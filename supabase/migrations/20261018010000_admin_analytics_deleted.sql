-- Admin analytics: split active and deleted series ("Silinenler" tab) so the
-- totals on each tab add up to its table. p_deleted = false → live series only,
-- true → deleted series only. Viewer counts follow the same split; the viewer
-- history keeps every row and flags deleted series.

drop function public.admin_analytics_overview();
drop function public.admin_daily_views(uuid, int);
drop function public.admin_series_analytics();
drop function public.admin_viewers();
drop function public.admin_viewer_history(uuid);

create function public.admin_analytics_overview(p_deleted boolean default false)
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
  with scope as (
    select s.id from public.series s where (s.deleted_at is not null) = p_deleted
  ),
  v as (
    select dv.day, dv.views from public.series_daily_views dv where dv.series_id in (select id from scope)
  ),
  wp as (
    select w.* from public.watch_progress w where w.series_id in (select id from scope)
  ),
  un as (
    select u.method from public.episode_unlocks u
    join public.episodes e on e.id = u.episode_id
    join public.seasons se on se.id = e.season_id
    where se.series_id in (select id from scope)
  )
  select
    coalesce((select sum(v.views) from v where v.day = current_date), 0)::bigint,
    coalesce((select sum(v.views) from v where v.day > current_date - 7), 0)::bigint,
    coalesce((select sum(v.views) from v where v.day > current_date - 30), 0)::bigint,
    coalesce((select sum(v.views) from v), 0)::bigint,
    (select count(distinct wp.profile_id) from wp),
    (select count(distinct wp.profile_id) from wp where wp.updated_at > now() - interval '7 days'),
    (select count(*) from wp where wp.completed),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
    (select count(*) from un where un.method = 'coins'),
    (select count(*) from un where un.method = 'rewarded_ad');
end;
$$;

-- Daily views for one series (p_series_id) or for every series of the tab
create function public.admin_daily_views(p_series_id uuid default null, p_days int default 30, p_deleted boolean default false)
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
              join public.series s on s.id = v.series_id
              where v.day = d::date
                and (case when p_series_id is null then (s.deleted_at is not null) = p_deleted
                          else v.series_id = p_series_id end)), 0)::bigint
  from generate_series(current_date - (least(greatest(p_days, 1), 365) - 1), current_date, interval '1 day') d
  order by 1;
end;
$$;

create function public.admin_series_analytics(p_deleted boolean default false)
returns table (
  series_id uuid,
  series_title text,
  series_status public.content_status,
  creator_name text,
  deleted_at timestamptz,
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
    s.deleted_at,
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
  where (s.deleted_at is not null) = p_deleted
  order by 7 desc, s.created_at;
end;
$$;

-- series_count / episodes_* count live series only; deleted ones are separate
create function public.admin_viewers()
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
  deleted_series_count bigint,
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
    count(distinct wp.series_id) filter (where s.deleted_at is null),
    count(wp.episode_id) filter (where s.deleted_at is null),
    count(wp.episode_id) filter (where wp.completed and s.deleted_at is null),
    count(distinct wp.series_id) filter (where s.deleted_at is not null),
    (select count(*) from public.episode_unlocks eu where eu.profile_id = p.id),
    exists (select 1 from public.coin_lots cl where cl.profile_id = p.id and cl.source = 'play_review_account')
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.watch_progress wp on wp.profile_id = p.id
  left join public.series s on s.id = wp.series_id
  group by p.id, u.email
  order by max(wp.updated_at) desc nulls last, p.created_at desc;
end;
$$;

create function public.admin_viewer_history(p_profile_id uuid)
returns table (
  series_id uuid,
  series_title text,
  series_deleted boolean,
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
    s.deleted_at is not null,
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

revoke all on function public.admin_analytics_overview(boolean) from public, anon;
revoke all on function public.admin_daily_views(uuid, int, boolean) from public, anon;
revoke all on function public.admin_series_analytics(boolean) from public, anon;
revoke all on function public.admin_viewers() from public, anon;
revoke all on function public.admin_viewer_history(uuid) from public, anon;
grant execute on function public.admin_analytics_overview(boolean) to authenticated, service_role;
grant execute on function public.admin_daily_views(uuid, int, boolean) to authenticated, service_role;
grant execute on function public.admin_series_analytics(boolean) to authenticated, service_role;
grant execute on function public.admin_viewers() to authenticated, service_role;
grant execute on function public.admin_viewer_history(uuid) to authenticated, service_role;
