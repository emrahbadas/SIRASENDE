-- Cap the free window: 20% of published episodes (rounded), at least 1 and
-- at most free_episode_max (8). Long series no longer give away 12–16 episodes
-- whose delivery cost has no revenue against it.

insert into public.platform_settings (key, value, description) values
  ('free_episode_max', '8', 'Upper limit of free episodes per series, whatever its length')
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
    else least(
      coalesce(public.setting_int('free_episode_max'), 8),
      greatest(1, round(published * coalesce(public.setting_int('free_episode_percent'), 20) / 100.0))::int
    )
  end
  from n;
$$;

-- Recompute when the cap changes, too
create or replace function public.settings_refresh_free_episode_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key in ('free_episode_percent', 'free_episode_max') then
    update public.series set free_episode_count = free_episode_count;
  end if;
  return null;
end;
$$;

update public.series set free_episode_count = free_episode_count;
