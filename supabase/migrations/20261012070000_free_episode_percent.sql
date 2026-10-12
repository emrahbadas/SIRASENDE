-- Free episodes follow the series length: a platform-wide share of the
-- published episodes is free (rounded to nearest, at least 1); the rest are
-- unlocked with a rewarded ad or coins.
--
-- series.free_episode_count stays as a cached column so every reader keeps
-- working, but it is now maintained by the database: recomputed whenever
-- episodes are published/paused/removed or the percentage changes, and any
-- direct write is overwritten.
--
-- Episode positions (free window, unlock pricing) now count published episodes
-- only, so a paused or newly added episode does not shift the window.

insert into public.platform_settings (key, value, description) values
  ('free_episode_percent', '20', 'Share of a series'' published episodes that is free (rounded to nearest, min 1)')
on conflict (key) do nothing;

create or replace function public.series_free_episode_count(p_series_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with n as (
    select count(*)::numeric as published
    from public.episodes e
    join public.seasons se on se.id = e.season_id
    where se.series_id = p_series_id and e.status = 'published'
  )
  select case
    when published = 0 then 0
    else greatest(1, round(published * coalesce(public.setting_int('free_episode_percent'), 20) / 100.0))::int
  end
  from n;
$$;

-- Always derive the cached value; ignores whatever the writer sent
create or replace function public.series_set_free_episode_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.free_episode_count := public.series_free_episode_count(new.id);
  return new;
end;
$$;

create trigger trg_series_free_episode_count before insert or update on public.series
  for each row execute function public.series_set_free_episode_count();

create or replace function public.episodes_refresh_free_episode_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series uuid;
begin
  select se.series_id into v_series
  from public.seasons se
  where se.id = coalesce(new.season_id, old.season_id);

  if v_series is not null then
    -- The series trigger recomputes the value
    update public.series set free_episode_count = free_episode_count where id = v_series;
  end if;
  return null;
end;
$$;

create trigger trg_episodes_free_episode_count
  after insert or delete or update of status, season_id on public.episodes
  for each row execute function public.episodes_refresh_free_episode_count();

create or replace function public.settings_refresh_free_episode_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'free_episode_percent' then
    update public.series set free_episode_count = free_episode_count;
  end if;
  return null;
end;
$$;

create trigger trg_settings_free_episode_count
  after insert or update on public.platform_settings
  for each row execute function public.settings_refresh_free_episode_count();

revoke all on function public.series_set_free_episode_count() from public, anon, authenticated;
revoke all on function public.episodes_refresh_free_episode_count() from public, anon, authenticated;
revoke all on function public.settings_refresh_free_episode_count() from public, anon, authenticated;
grant execute on function public.series_free_episode_count(uuid) to anon, authenticated, service_role;

-- Position among the series' published episodes (the target is always ranked,
-- so owners and moderators still get a context for unpublished episodes).
create or replace function public.episode_context(p_episode_id uuid)
returns table (series_id uuid, creator_id uuid, episode_position int, series_status public.content_status, episode_status public.content_status)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select e.id, se.series_id
    from public.episodes e
    join public.seasons se on se.id = e.season_id
    where e.id = p_episode_id
  ),
  ordered as (
    select e.id,
           row_number() over (order by se.season_number, e.episode_number)::int as episode_position
    from public.episodes e
    join public.seasons se on se.id = e.season_id
    where se.series_id = (select series_id from target)
      and (e.status = 'published' or e.id = p_episode_id)
  )
  select s.id, p.creator_id, o.episode_position, s.status, e.status
  from target t
  join public.series s on s.id = t.series_id
  join public.productions p on p.id = s.production_id
  join public.episodes e on e.id = t.id
  join ordered o on o.id = t.id;
$$;

-- Backfill
update public.series set free_episode_count = free_episode_count;
