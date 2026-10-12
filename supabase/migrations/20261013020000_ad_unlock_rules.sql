-- Rewarded-ad unlock rules:
-- * ads_per_ad_unlock (2) verified rewarded ads unlock one episode. Progress is
--   kept per viewer and episode, so if the second ad is not available the
--   first one still counts later.
-- * At most ad_unlocks_per_day (8) episodes per viewer per day via ads, shared
--   across all series. The day resets at 00:00 Turkey time.
-- * Coin unlocks have no daily limit.

insert into public.platform_settings (key, value, description) values
  ('ads_per_ad_unlock', '2', 'Verified rewarded ads needed to unlock one episode'),
  ('ad_unlocks_per_day', '8', 'Episodes a viewer can unlock with ads per day (resets 00:00 Europe/Istanbul)')
on conflict (key) do nothing;

create table public.ad_unlock_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  ads_watched int not null default 0 check (ads_watched >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, episode_id)
);

alter table public.ad_unlock_progress enable row level security;
create policy "ad_unlock_progress_own_read" on public.ad_unlock_progress
  for select using (profile_id = (select auth.uid()));

-- Start of the current ad day (00:00 Turkey time) as a timestamptz
create or replace function public.ad_day_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
$$;

create or replace function public.ad_unlocks_today(p_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.episode_unlocks
  where profile_id = p_profile_id and method = 'rewarded_ad' and created_at >= public.ad_day_start();
$$;

-- Viewer-facing state for one episode (service role; the API passes the caller)
create or replace function public.ad_unlock_status(p_profile_id uuid, p_episode_id uuid)
returns table (
  unlocked boolean,
  ads_watched int,
  ads_required int,
  daily_limit int,
  daily_remaining int,
  resets_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select coalesce(public.setting_int('ads_per_ad_unlock'), 2) as req,
           coalesce(public.setting_int('ad_unlocks_per_day'), 8) as lim
  )
  select
    exists (select 1 from public.episode_unlocks u where u.profile_id = p_profile_id and u.episode_id = p_episode_id),
    coalesce((select p.ads_watched from public.ad_unlock_progress p
              where p.profile_id = p_profile_id and p.episode_id = p_episode_id), 0),
    s.req,
    s.lim,
    greatest(s.lim - public.ad_unlocks_today(p_profile_id), 0),
    public.ad_day_start() + interval '1 day'
  from s;
$$;

-- Records an impression; a NEW verified rewarded impression for an episode
-- adds progress and unlocks the episode once enough ads were watched and the
-- viewer still has ad unlocks left today. Replays of the same event id are no-ops.
create or replace function public.record_ad_impression(
  p_provider text,
  p_provider_event_id text,
  p_placement text,
  p_profile_id uuid,
  p_episode_id uuid,
  p_revenue_micros bigint default null,
  p_unlock_episode boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_creator uuid;
  v_new boolean;
  v_watched int;
  v_required int := coalesce(public.setting_int('ads_per_ad_unlock'), 2);
  v_limit int := coalesce(public.setting_int('ad_unlocks_per_day'), 8);
begin
  if p_episode_id is not null then
    select creator_id into v_creator from public.episode_context(p_episode_id);
  end if;

  select id into v_id from public.ad_impressions where provider = p_provider and provider_event_id = p_provider_event_id;
  v_new := v_id is null;

  if v_new then
    insert into public.ad_impressions
      (provider, provider_event_id, placement, profile_id, episode_id, creator_id, revenue_micros)
    values
      (p_provider, p_provider_event_id, p_placement, p_profile_id, p_episode_id, v_creator, p_revenue_micros)
    on conflict (provider, provider_event_id) do nothing
    returning id into v_id;
    if v_id is null then
      -- Lost a race with a concurrent delivery of the same event
      select id into v_id from public.ad_impressions where provider = p_provider and provider_event_id = p_provider_event_id;
      v_new := false;
    end if;
  elsif p_revenue_micros is not null then
    update public.ad_impressions set revenue_micros = p_revenue_micros
    where id = v_id and settlement_id is null;
  end if;

  if not (v_new and p_unlock_episode and p_placement = 'rewarded'
          and p_profile_id is not null and p_episode_id is not null) then
    return v_id;
  end if;

  if exists (select 1 from public.episode_unlocks where profile_id = p_profile_id and episode_id = p_episode_id) then
    return v_id;
  end if;

  insert into public.ad_unlock_progress (profile_id, episode_id, ads_watched)
  values (p_profile_id, p_episode_id, 1)
  on conflict (profile_id, episode_id) do update
    set ads_watched = public.ad_unlock_progress.ads_watched + 1, updated_at = now()
  returning ads_watched into v_watched;

  if v_watched >= v_required and public.ad_unlocks_today(p_profile_id) < v_limit then
    insert into public.episode_unlocks (profile_id, episode_id, method, ad_impression_id)
    values (p_profile_id, p_episode_id, 'rewarded_ad', v_id)
    on conflict (profile_id, episode_id) do nothing;
    delete from public.ad_unlock_progress where profile_id = p_profile_id and episode_id = p_episode_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ad_unlocks_today(uuid) from public, anon, authenticated;
revoke all on function public.ad_unlock_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ad_unlocks_today(uuid) to service_role;
grant execute on function public.ad_unlock_status(uuid, uuid) to service_role;
