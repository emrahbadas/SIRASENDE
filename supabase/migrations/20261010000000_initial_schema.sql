-- Sıra Sende — Initial schema: identity, creator, content hierarchy, video, subtitles
-- Phase 1: Auth and Database

-- ============================================================
-- Enums
-- ============================================================

create type public.user_role as enum (
  'viewer', 'creator', 'moderator', 'admin', 'studio_member'
);

create type public.production_type as enum (
  'human', 'ai_assisted', 'ai_generated', 'hybrid'
);

create type public.content_status as enum (
  'draft', 'uploading', 'processing', 'transcribing', 'translating',
  'moderating', 'ready', 'published', 'blocked', 'failed'
);

create type public.video_asset_status as enum (
  'pending_upload', 'uploading', 'processing', 'ready', 'failed', 'deleted'
);

create type public.subtitle_track_status as enum (
  'pending', 'generating', 'generated', 'edited', 'published', 'disabled', 'failed'
);

-- ============================================================
-- Profiles & roles
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.user_role not null,
  granted_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  creator_name text not null,
  bio text,
  website_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Content hierarchy: production → series → season → episode
-- ============================================================

create table public.productions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  title text not null,
  description text,
  production_type public.production_type not null default 'human',
  script_source text check (script_source in ('human', 'ai_assisted', 'ai_generated')),
  video_source text check (video_source in ('real_footage', 'ai_generated', 'hybrid')),
  voice_source text check (voice_source in ('human', 'synthetic', 'hybrid')),
  music_source text check (music_source in ('original', 'licensed', 'ai_generated')),
  rights_declared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  production_id uuid not null references public.productions (id) on delete cascade,
  title text not null,
  description text,
  poster_url text,
  primary_language text not null default 'tr' check (primary_language in ('tr', 'en')),
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  season_number int not null check (season_number > 0),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, season_number)
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  episode_number int not null check (episode_number > 0),
  title text not null,
  description text,
  duration_seconds int check (duration_seconds > 0),
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, episode_number)
);

-- ============================================================
-- Categories
-- ============================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_tr text not null,
  name_en text not null
);

create table public.production_categories (
  production_id uuid not null references public.productions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (production_id, category_id)
);

-- ============================================================
-- Video assets & subtitles
-- ============================================================

create table public.video_assets (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes (id) on delete cascade,
  provider text not null default 'cloudflare_stream',
  provider_asset_id text,
  status public.video_asset_status not null default 'pending_upload',
  duration_seconds int,
  playback_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subtitle_tracks (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes (id) on delete cascade,
  language text not null check (language in ('tr', 'en')),
  is_original boolean not null default false,
  status public.subtitle_track_status not null default 'pending',
  vtt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, language)
);

-- ============================================================
-- Indexes
-- ============================================================

create index idx_productions_creator on public.productions (creator_id);
create index idx_series_production on public.series (production_id);
create index idx_seasons_series on public.seasons (series_id);
create index idx_episodes_season on public.episodes (season_id);
create index idx_episodes_status on public.episodes (status);
create index idx_video_assets_episode on public.video_assets (episode_id);
create index idx_subtitle_tracks_episode on public.subtitle_tracks (episode_id);

-- ============================================================
-- updated_at trigger
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'creator_profiles', 'productions', 'series',
    'seasons', 'episodes', 'video_assets', 'subtitle_tracks'
  ]
  loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t
    );
  end loop;
end;
$$;

-- ============================================================
-- Helper functions for RLS
-- ============================================================

create or replace function public.has_role(required_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where profile_id = auth.uid() and role = required_role
  );
$$;

create or replace function public.owns_production(p_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.productions p
    join public.creator_profiles cp on cp.id = p.creator_id
    where p.id = p_production_id and cp.profile_id = auth.uid()
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.productions enable row level security;
alter table public.series enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.categories enable row level security;
alter table public.production_categories enable row level security;
alter table public.video_assets enable row level security;
alter table public.subtitle_tracks enable row level security;

-- Profiles: public read, self update
create policy "profiles_public_read" on public.profiles
  for select using (true);

create policy "profiles_self_insert" on public.profiles
  for insert with check (id = auth.uid());

create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid());

-- User roles: self read; mutations via service role / admin only
create policy "user_roles_self_read" on public.user_roles
  for select using (profile_id = auth.uid() or public.has_role('admin'));

-- Creator profiles: public read, self manage
create policy "creator_profiles_public_read" on public.creator_profiles
  for select using (true);

create policy "creator_profiles_self_insert" on public.creator_profiles
  for insert with check (profile_id = auth.uid());

create policy "creator_profiles_self_update" on public.creator_profiles
  for update using (profile_id = auth.uid());

-- Productions: owner full access; moderators/admins read
create policy "productions_owner_all" on public.productions
  for all using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = creator_id and cp.profile_id = auth.uid()
    )
  );

create policy "productions_moderation_read" on public.productions
  for select using (public.has_role('moderator') or public.has_role('admin'));

-- Series: public read only when published; owner full access
create policy "series_public_read" on public.series
  for select using (status = 'published' and deleted_at is null);

create policy "series_owner_all" on public.series
  for all using (public.owns_production(production_id));

create policy "series_moderation_read" on public.series
  for select using (public.has_role('moderator') or public.has_role('admin'));

-- Seasons: visible if parent series is accessible
create policy "seasons_public_read" on public.seasons
  for select using (
    exists (
      select 1 from public.series s
      where s.id = series_id and s.status = 'published' and s.deleted_at is null
    )
  );

create policy "seasons_owner_all" on public.seasons
  for all using (
    exists (
      select 1 from public.series s
      where s.id = series_id and public.owns_production(s.production_id)
    )
  );

-- Episodes: public read only when published
create policy "episodes_public_read" on public.episodes
  for select using (status = 'published');

create policy "episodes_owner_all" on public.episodes
  for all using (
    exists (
      select 1
      from public.seasons se
      join public.series s on s.id = se.series_id
      where se.id = season_id and public.owns_production(s.production_id)
    )
  );

create policy "episodes_moderation_read" on public.episodes
  for select using (public.has_role('moderator') or public.has_role('admin'));

-- Categories: public read; admin manage
create policy "categories_public_read" on public.categories
  for select using (true);

create policy "categories_admin_write" on public.categories
  for all using (public.has_role('admin'));

create policy "production_categories_public_read" on public.production_categories
  for select using (true);

create policy "production_categories_owner_write" on public.production_categories
  for all using (public.owns_production(production_id));

-- Video assets: owner only (playback for viewers goes through signed URLs)
create policy "video_assets_owner_all" on public.video_assets
  for all using (
    exists (
      select 1
      from public.episodes e
      join public.seasons se on se.id = e.season_id
      join public.series s on s.id = se.series_id
      where e.id = episode_id and public.owns_production(s.production_id)
    )
  );

-- Subtitle tracks: public read when episode is published; owner manage
create policy "subtitle_tracks_public_read" on public.subtitle_tracks
  for select using (
    status = 'published'
    and exists (
      select 1 from public.episodes e
      where e.id = episode_id and e.status = 'published'
    )
  );

create policy "subtitle_tracks_owner_all" on public.subtitle_tracks
  for all using (
    exists (
      select 1
      from public.episodes e
      join public.seasons se on se.id = e.season_id
      join public.series s on s.id = se.series_id
      where e.id = episode_id and public.owns_production(s.production_id)
    )
  );
