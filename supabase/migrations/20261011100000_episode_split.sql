-- Episode length limit + splitting one long upload into episodes.
-- Short episodes mean an ad break at every episode transition, so episode
-- length is capped (product setting, default 3 minutes). Longer videos are
-- uploaded once as a split source and cut into clips that become episodes.

-- ============================================================
-- Platform settings (product configuration, editable without deploys)
-- ============================================================

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create trigger trg_platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

create policy "platform_settings_read" on public.platform_settings
  for select using (true);

create policy "platform_settings_admin_write" on public.platform_settings
  for all using (public.has_role('admin')) with check (public.has_role('admin'));

insert into public.platform_settings (key, value, description) values
  ('max_episode_seconds', '180', 'Longest allowed episode; keeps an ad break at every episode transition'),
  ('split_target_seconds', '150', 'Preferred episode length when suggesting cut points for a long video'),
  ('max_split_source_seconds', '7200', 'Longest single video that can be uploaded for splitting');

create or replace function public.setting_int(p_key text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::int from public.platform_settings where key = p_key;
$$;

-- ============================================================
-- Split jobs: one long source video → many episode clips
-- ============================================================

create type public.split_job_status as enum (
  'pending_upload', -- job created, file not uploaded yet
  'processing',     -- uploaded, provider is encoding the source
  'ready',          -- source encoded, waiting for the creator to confirm cuts
  'splitting',      -- clips requested; episodes are processing
  'completed',      -- every clip is ready, source deleted
  'failed',
  'canceled'
);

create table public.video_split_jobs (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  provider text not null default 'cloudflare_stream',
  provider_asset_id text,
  status public.split_job_status not null default 'pending_upload',
  reserved_seconds int not null check (reserved_seconds > 0),
  duration_seconds int,
  cut_points int[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_split_jobs_provider_asset on public.video_split_jobs (provider, provider_asset_id)
  where provider_asset_id is not null;
create index idx_split_jobs_season on public.video_split_jobs (season_id, created_at desc);
create index idx_split_jobs_creator on public.video_split_jobs (creator_id);

create trigger trg_video_split_jobs_updated_at before update on public.video_split_jobs
  for each row execute function public.set_updated_at();

alter table public.video_split_jobs enable row level security;

create policy "split_jobs_creator_read" on public.video_split_jobs
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

alter table public.video_assets
  add column split_job_id uuid references public.video_split_jobs (id) on delete set null;

create index idx_video_assets_split_job on public.video_assets (split_job_id)
  where split_job_id is not null;

-- ============================================================
-- Storage: a split source counts against quota until its clips take over
-- ============================================================

create or replace function public.creator_storage_used_seconds(p_creator_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(coalesce(va.duration_seconds, va.reserved_seconds, 0))
      from public.video_assets va
      join public.episodes e on e.id = va.episode_id
      join public.seasons se on se.id = e.season_id
      join public.series s on s.id = se.series_id
      join public.productions p on p.id = s.production_id
      where p.creator_id = p_creator_id
        and va.status <> 'deleted'
    ), 0)
    + coalesce((
      select sum(coalesce(j.duration_seconds, j.reserved_seconds))
      from public.video_split_jobs j
      where j.creator_id = p_creator_id
        and j.status in ('pending_upload', 'processing', 'ready')
    ), 0);
$$;

create or replace function public.enforce_split_job_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reserved_seconds > coalesce(public.setting_int('max_split_source_seconds'), 7200) then
    raise exception 'split_source_too_long';
  end if;

  if public.creator_storage_used_seconds(new.creator_id) + new.reserved_seconds
     > public.creator_storage_quota_minutes(new.creator_id)::bigint * 60 then
    raise exception 'storage_quota_exceeded';
  end if;
  return new;
end;
$$;

create trigger trg_video_split_jobs_quota before insert on public.video_split_jobs
  for each row execute function public.enforce_split_job_quota();

-- Episode assets: quota (as before) + maximum episode length
create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if new.status = 'deleted' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.duration_seconds is null and new.reserved_seconds is null then
    raise exception 'reserved_seconds_required';
  end if;

  -- +2s tolerance for encoder rounding on clips cut at the exact limit
  if tg_op = 'INSERT'
     and coalesce(new.duration_seconds, new.reserved_seconds)
         > coalesce(public.setting_int('max_episode_seconds'), 180) + 2 then
    raise exception 'episode_too_long';
  end if;

  -- Durations come from the video provider webhook (service role), never from the client.
  if tg_op = 'UPDATE' and auth.role() = 'authenticated' and (
       new.duration_seconds is distinct from old.duration_seconds
       or coalesce(new.reserved_seconds, 0) < coalesce(old.reserved_seconds, 0)
     ) then
    raise exception 'storage_fields_read_only';
  end if;

  if tg_op = 'UPDATE'
     and coalesce(new.duration_seconds, new.reserved_seconds, 0) <= coalesce(old.duration_seconds, old.reserved_seconds, 0)
     and old.status <> 'deleted' then
    return new;
  end if;

  select creator_id into v_creator from public.episode_context(new.episode_id);

  if public.creator_storage_used_seconds(v_creator)
     - (case when tg_op = 'UPDATE' and old.status <> 'deleted'
             then coalesce(old.duration_seconds, old.reserved_seconds, 0) else 0 end)
     + coalesce(new.duration_seconds, new.reserved_seconds, 0)
     > public.creator_storage_quota_minutes(v_creator)::bigint * 60 then
    raise exception 'storage_quota_exceeded';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_split_job_quota() from public, anon, authenticated;
