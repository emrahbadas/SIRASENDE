-- Creator grants: time-boxed advantages given to a creator (founder campaign,
-- growth-program rewards, manual admin grants). Only storage_minutes affects
-- behaviour today (added to the storage quota); featured / badge /
-- share_bonus_bps are recorded for the growth program (see README).
--
-- Founder campaign ("ilk 100 creator"):
-- * A new creator gets founder_storage_minutes (240) once, while slots last
--   (founder_campaign_slots = 100).
-- * They have founder_publish_window_days (30) to get their first series on
--   air; from that moment the grant runs founder_days (90).
-- * A grant that lapses unused frees its slot. When a grant ends, existing
--   videos stay; only new uploads above the plan quota are blocked.

insert into public.platform_settings (key, value, description) values
  ('founder_campaign_slots', '100', 'Founder campaign: number of creators'),
  ('founder_storage_minutes', '240', 'Founder campaign: extra storage minutes (80 × 3-minute episodes)'),
  ('founder_days', '90', 'Founder campaign: days the grant runs after the first series goes on air'),
  ('founder_publish_window_days', '30', 'Founder campaign: days to get the first series on air')
on conflict (key) do nothing;

create table public.creator_grants (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  kind text not null check (kind in ('storage_minutes', 'featured', 'badge', 'share_bonus_bps')),
  value int not null check (value > 0),
  -- share_bonus_bps only: earnings ceiling (kuruş) the bonus applies to
  cap_minor bigint check (cap_minor > 0),
  source text not null,
  note text,
  granted_by uuid references public.profiles (id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- founder grants: when the first series went on air (the 90 days start)
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index idx_creator_grants_creator on public.creator_grants (creator_id, ends_at desc);
-- One founder grant per creator, ever
create unique index uq_creator_grants_founder on public.creator_grants (creator_id) where source = 'founder_100';

alter table public.creator_grants enable row level security;
create policy "creator_grants_read" on public.creator_grants
  for select using (creator_id = public.my_creator_id() or public.has_role('admin') or public.has_role('moderator'));

create or replace function public.creator_grant_active(g public.creator_grants)
returns boolean
language sql
stable
set search_path = public
as $$
  select g.revoked_at is null and g.starts_at <= now() and g.ends_at > now();
$$;

-- Slots taken: founder grants that are running or still inside the publish window
create or replace function public.founder_slots_used()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.creator_grants g
  where g.source = 'founder_100' and g.revoked_at is null
    and (g.activated_at is not null or g.ends_at > now());
$$;

-- Gives a creator the founder grant if they never had one and slots remain.
create or replace function public.grant_founder_campaign(p_creator_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.creator_grants where creator_id = p_creator_id and source = 'founder_100') then
    return null;
  end if;
  -- Serialize slot counting
  perform pg_advisory_xact_lock(hashtext('founder_100'));
  if public.founder_slots_used() >= coalesce(public.setting_int('founder_campaign_slots'), 100) then
    return null;
  end if;

  insert into public.creator_grants (creator_id, kind, value, source, note, starts_at, ends_at)
  values (p_creator_id, 'storage_minutes', coalesce(public.setting_int('founder_storage_minutes'), 240),
          'founder_100', 'İlk 100 kurucu creator kampanyası', now(),
          now() + make_interval(days => coalesce(public.setting_int('founder_publish_window_days'), 30)))
  on conflict do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- New creators enter the campaign automatically
create or replace function public.creator_profiles_founder_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_founder_campaign(new.id);
  return null;
end;
$$;

create trigger trg_creator_profiles_founder_grant after insert on public.creator_profiles
  for each row execute function public.creator_profiles_founder_grant();

-- First series on air starts the founder grant's 90 days
create or replace function public.series_activate_founder_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    update public.creator_grants g
       set activated_at = now(),
           ends_at = now() + make_interval(days => coalesce(public.setting_int('founder_days'), 90))
     where g.source = 'founder_100'
       and g.activated_at is null
       and g.revoked_at is null
       and g.ends_at > now()
       and g.creator_id = (select p.creator_id from public.productions p where p.id = new.production_id);
  end if;
  return null;
end;
$$;

create trigger trg_series_activate_founder_grant after update of status on public.series
  for each row execute function public.series_activate_founder_grant();

-- Quota = plan quota + active storage grants
create or replace function public.creator_storage_quota_minutes(p_creator_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sp.quota_minutes
       from public.creator_storage_subscriptions s
       join public.storage_plans sp on sp.id = s.plan_id
      where s.creator_id = p_creator_id
        and s.status in ('active', 'past_due')
        and s.current_period_end > now()),
    (select quota_minutes from public.storage_plans where code = 'free'),
    0
  ) + coalesce(
    (select sum(g.value) from public.creator_grants g
      where g.creator_id = p_creator_id and g.kind = 'storage_minutes' and public.creator_grant_active(g)),
    0
  )::int;
$$;

-- Admin: manual grant (growth program, support, corrections)
create or replace function public.admin_grant(
  p_creator_id uuid, p_kind text, p_value int, p_days int, p_note text default null, p_cap_minor bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.has_role('admin') then
    raise exception 'forbidden';
  end if;
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'invalid_days';
  end if;
  insert into public.creator_grants (creator_id, kind, value, cap_minor, source, note, granted_by, starts_at, ends_at)
  values (p_creator_id, p_kind, p_value, p_cap_minor, 'admin', p_note, auth.uid(), now(), now() + make_interval(days => p_days))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_revoke_grant(p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden';
  end if;
  update public.creator_grants set revoked_at = now() where id = p_grant_id and revoked_at is null;
end;
$$;

revoke all on function public.founder_slots_used() from public, anon;
grant execute on function public.founder_slots_used() to authenticated, service_role;
revoke all on function public.grant_founder_campaign(uuid) from public, anon, authenticated;
grant execute on function public.grant_founder_campaign(uuid) to service_role;
revoke all on function public.creator_profiles_founder_grant() from public, anon, authenticated;
revoke all on function public.series_activate_founder_grant() from public, anon, authenticated;
revoke all on function public.admin_grant(uuid, text, int, int, text, bigint) from public, anon;
revoke all on function public.admin_revoke_grant(uuid) from public, anon;
grant execute on function public.admin_grant(uuid, text, int, int, text, bigint) to authenticated, service_role;
grant execute on function public.admin_revoke_grant(uuid) to authenticated, service_role;

-- Existing creators join the campaign (oldest first). Creators whose series is
-- already on air start their 90 days from its first publish.
do $$
declare
  c record;
begin
  for c in select id from public.creator_profiles order by created_at loop
    perform public.grant_founder_campaign(c.id);
  end loop;

  update public.creator_grants g
     set activated_at = f.first_publish,
         ends_at = f.first_publish + make_interval(days => coalesce(public.setting_int('founder_days'), 90))
    from (
      select p.creator_id, min(e.published_at) as first_publish
      from public.productions p
      join public.series s on s.production_id = p.id
      join public.seasons se on se.series_id = s.id
      join public.episodes e on e.season_id = se.id
      where s.status = 'published' and s.deleted_at is null and e.published_at is not null
      group by p.creator_id
    ) f
   where g.creator_id = f.creator_id and g.source = 'founder_100' and g.activated_at is null;
end $$;
