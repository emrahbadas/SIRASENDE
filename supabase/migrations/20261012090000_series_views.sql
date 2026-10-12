-- View counts for the home screen (popular / trending / poster counts).
-- One row per series per day; the server increments it whenever it hands out
-- a playback URL, so clients cannot inflate it. Daily buckets give both the
-- all-time total and a rolling 7-day "trending" window.

create table public.series_daily_views (
  series_id uuid not null references public.series (id) on delete cascade,
  day date not null default current_date,
  views bigint not null default 0 check (views >= 0),
  primary key (series_id, day)
);

create index idx_series_daily_views_day on public.series_daily_views (day);

-- No policies: only the service role and the functions below touch it
alter table public.series_daily_views enable row level security;

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
$$;

-- Aggregates for published series (public: counts only, no viewer data)
create or replace function public.series_view_stats()
returns table (series_id uuid, views bigint, views_7d bigint, first_published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    coalesce((select sum(v.views) from public.series_daily_views v where v.series_id = s.id), 0)::bigint,
    coalesce((select sum(v.views) from public.series_daily_views v
              where v.series_id = s.id and v.day > current_date - 7), 0)::bigint,
    (select min(e.published_at) from public.episodes e
       join public.seasons se on se.id = e.season_id
      where se.series_id = s.id and e.status = 'published')
  from public.series s
  where s.status = 'published' and s.deleted_at is null;
$$;

revoke all on function public.record_series_view(uuid) from public, anon, authenticated;
grant execute on function public.record_series_view(uuid) to service_role;
revoke all on function public.series_view_stats() from public;
grant execute on function public.series_view_stats() to anon, authenticated, service_role;
