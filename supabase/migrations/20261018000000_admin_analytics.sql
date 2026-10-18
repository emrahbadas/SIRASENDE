-- Admin analytics (web only, admin role).
-- 1) Per-episode daily view buckets next to the per-series ones, incremented by
--    the same server-side call that hands out a playback URL.
-- 2) Read-only security definer RPCs for /admin/analytics. Each one checks the
--    admin role itself; viewer-level rows never reach creators.

create table public.episode_daily_views (
  episode_id uuid not null references public.episodes (id) on delete cascade,
  day date not null default current_date,
  views bigint not null default 0 check (views >= 0),
  primary key (episode_id, day)
);

create index idx_episode_daily_views_day on public.episode_daily_views (day);

-- No policies: only the service role and the functions below touch it
alter table public.episode_daily_views enable row level security;

create or replace function public.record_series_view(p_episode_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.series_daily_views (series_id, day, views)
  select se.series_id, current_date, 1
  from public.episodes e
  join public.seasons se on se.id = e.season_id
  where e.id = p_episode_id
  on conflict (series_id, day) do update set views = public.series_daily_views.views + 1;

  insert into public.episode_daily_views (episode_id, day, views)
  select e.id, current_date, 1
  from public.episodes e
  where e.id = p_episode_id
  on conflict (episode_id, day) do update set views = public.episode_daily_views.views + 1;
$$;

-- Platform totals
create or replace function public.admin_analytics_overview()
returns table (
  views_today bigint,
  views_7d bigint,
  views_30d bigint,
  views_total bigint,
  viewers_total bigint,
  viewers_7d bigint,
  completions bigint,
  users_total bigint,
  users_7d bigint,
  coin_unlocks bigint,
  ad_unlocks bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    coalesce((select sum(v.views) from public.series_daily_views v where v.day = current_date), 0)::bigint,
    coalesce((select sum(v.views) from public.series_daily_views v where v.day > current_date - 7), 0)::bigint,
    coalesce((select sum(v.views) from public.series_daily_views v where v.day > current_date - 30), 0)::bigint,
    coalesce((select sum(v.views) from public.series_daily_views v), 0)::bigint,
    (select count(distinct wp.profile_id) from public.watch_progress wp),
    (select count(distinct wp.profile_id) from public.watch_progress wp where wp.updated_at > now() - interval '7 days'),
    (select count(*) from public.watch_progress wp where wp.completed),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
    (select count(*) from public.episode_unlocks u where u.method = 'coins'),
    (select count(*) from public.episode_unlocks u where u.method = 'rewarded_ad');
end;
$$;

-- Daily views, all series or one, for the last p_days days (gaps filled)
create or replace function public.admin_daily_views(p_series_id uuid default null, p_days int default 30)
returns table (day date, views bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select d::date,
    coalesce((select sum(v.views) from public.series_daily_views v
              where v.day = d::date and (p_series_id is null or v.series_id = p_series_id)), 0)::bigint
  from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
  order by 1;
end;
$$;

-- One row per series (any status except deleted)
create or replace function public.admin_series_analytics()
returns table (
  series_id uuid,
  series_title text,
  series_status public.content_status,
  creator_name text,
  episode_count bigint,
  views_total bigint,
  views_7d bigint,
  viewers bigint,
  completions bigint,
  likes bigint,
  coin_unlocks bigint,
  ad_unlocks bigint,
  watchlisted bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    s.title,
    s.status,
    c.creator_name,
    (select count(*) from public.seasons se join public.episodes e on e.season_id = se.id where se.series_id = s.id),
    coalesce((select sum(v.views) from public.series_daily_views v where v.series_id = s.id), 0)::bigint,
    coalesce((select sum(v.views) from public.series_daily_views v
              where v.series_id = s.id and v.day > current_date - 7), 0)::bigint,
    (select count(distinct wp.profile_id) from public.watch_progress wp where wp.series_id = s.id),
    (select count(*) from public.watch_progress wp where wp.series_id = s.id and wp.completed),
    (select count(*) from public.episode_likes l
       join public.episodes e on e.id = l.episode_id
       join public.seasons se on se.id = e.season_id
      where se.series_id = s.id),
    (select count(*) from public.episode_unlocks u
       join public.episodes e on e.id = u.episode_id
       join public.seasons se on se.id = e.season_id
      where se.series_id = s.id and u.method = 'coins'),
    (select count(*) from public.episode_unlocks u
       join public.episodes e on e.id = u.episode_id
       join public.seasons se on se.id = e.season_id
      where se.series_id = s.id and u.method = 'rewarded_ad'),
    (select count(*) from public.watchlist w where w.series_id = s.id)
  from public.series s
  join public.productions p on p.id = s.production_id
  join public.creator_profiles c on c.id = p.creator_id
  where s.deleted_at is null
  order by 6 desc, s.created_at;
end;
$$;

-- Per-episode funnel of one series
create or replace function public.admin_episode_analytics(p_series_id uuid)
returns table (
  episode_id uuid,
  season_number int,
  episode_number int,
  episode_title text,
  episode_status public.content_status,
  duration_seconds int,
  views_total bigint,
  views_7d bigint,
  viewers bigint,
  completions bigint,
  likes bigint,
  coin_unlocks bigint,
  ad_unlocks bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    e.id,
    se.season_number,
    e.episode_number,
    e.title,
    e.status,
    e.duration_seconds,
    coalesce((select sum(v.views) from public.episode_daily_views v where v.episode_id = e.id), 0)::bigint,
    coalesce((select sum(v.views) from public.episode_daily_views v
              where v.episode_id = e.id and v.day > current_date - 7), 0)::bigint,
    (select count(*) from public.watch_progress wp where wp.episode_id = e.id),
    (select count(*) from public.watch_progress wp where wp.episode_id = e.id and wp.completed),
    (select count(*) from public.episode_likes l where l.episode_id = e.id),
    (select count(*) from public.episode_unlocks u where u.episode_id = e.id and u.method = 'coins'),
    (select count(*) from public.episode_unlocks u where u.episode_id = e.id and u.method = 'rewarded_ad')
  from public.seasons se
  join public.episodes e on e.season_id = se.id
  where se.series_id = p_series_id
  order by se.season_number, e.episode_number;
end;
$$;

-- Signed-in viewers with watch activity. is_reviewer marks the Google Play
-- review account (its coins come from the play_review_account lot).
create or replace function public.admin_viewers()
returns table (
  profile_id uuid,
  username text,
  display_name text,
  email text,
  joined_at timestamptz,
  last_watched_at timestamptz,
  series_count bigint,
  episodes_started bigint,
  episodes_completed bigint,
  unlocks bigint,
  is_reviewer boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    p.id,
    p.username,
    p.display_name,
    u.email::text,
    p.created_at,
    max(wp.updated_at),
    count(distinct wp.series_id),
    count(wp.episode_id),
    count(wp.episode_id) filter (where wp.completed),
    (select count(*) from public.episode_unlocks eu where eu.profile_id = p.id),
    exists (select 1 from public.coin_lots cl where cl.profile_id = p.id and cl.source = 'play_review_account')
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.watch_progress wp on wp.profile_id = p.id
  group by p.id, u.email
  order by max(wp.updated_at) desc nulls last, p.created_at desc;
end;
$$;

-- What one viewer watched, most recent first
create or replace function public.admin_viewer_history(p_profile_id uuid)
returns table (
  series_id uuid,
  series_title text,
  episode_id uuid,
  season_number int,
  episode_number int,
  episode_title text,
  duration_seconds int,
  position_seconds int,
  completed boolean,
  liked boolean,
  unlock_method text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select
    s.id,
    s.title,
    e.id,
    se.season_number,
    e.episode_number,
    e.title,
    e.duration_seconds,
    wp.position_seconds,
    wp.completed,
    exists (select 1 from public.episode_likes l where l.episode_id = e.id and l.profile_id = p_profile_id),
    (select eu.method::text from public.episode_unlocks eu
      where eu.episode_id = e.id and eu.profile_id = p_profile_id
      order by eu.created_at limit 1),
    wp.updated_at
  from public.watch_progress wp
  join public.episodes e on e.id = wp.episode_id
  join public.seasons se on se.id = e.season_id
  join public.series s on s.id = se.series_id
  where wp.profile_id = p_profile_id
  order by wp.updated_at desc;
end;
$$;

revoke all on function public.admin_analytics_overview() from public, anon;
revoke all on function public.admin_daily_views(uuid, int) from public, anon;
revoke all on function public.admin_series_analytics() from public, anon;
revoke all on function public.admin_episode_analytics(uuid) from public, anon;
revoke all on function public.admin_viewers() from public, anon;
revoke all on function public.admin_viewer_history(uuid) from public, anon;
grant execute on function public.admin_analytics_overview() to authenticated, service_role;
grant execute on function public.admin_daily_views(uuid, int) to authenticated, service_role;
grant execute on function public.admin_series_analytics() to authenticated, service_role;
grant execute on function public.admin_episode_analytics(uuid) to authenticated, service_role;
grant execute on function public.admin_viewers() to authenticated, service_role;
grant execute on function public.admin_viewer_history(uuid) to authenticated, service_role;
