-- Phase 5: account & social — watchlist, episode likes, creator follows.
-- Viewers manage only their own rows; counts are public through functions.

create table public.watchlist (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, series_id)
);
create index idx_watchlist_recent on public.watchlist (profile_id, created_at desc);

create table public.episode_likes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, episode_id)
);
create index idx_episode_likes_episode on public.episode_likes (episode_id);

create table public.creator_follows (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, creator_id)
);
create index idx_creator_follows_creator on public.creator_follows (creator_id);
create index idx_creator_follows_recent on public.creator_follows (profile_id, created_at desc);

alter table public.watchlist enable row level security;
alter table public.episode_likes enable row level security;
alter table public.creator_follows enable row level security;

-- Watchlist: own rows; only published series can be added
create policy "watchlist_self_read" on public.watchlist
  for select using (profile_id = (select auth.uid()));
create policy "watchlist_self_insert" on public.watchlist
  for insert with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.series s where s.id = series_id and s.status = 'published' and s.deleted_at is null)
  );
create policy "watchlist_self_delete" on public.watchlist
  for delete using (profile_id = (select auth.uid()));

-- Likes: own rows; only published episodes can be liked
create policy "episode_likes_self_read" on public.episode_likes
  for select using (profile_id = (select auth.uid()));
create policy "episode_likes_self_insert" on public.episode_likes
  for insert with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.episodes e where e.id = episode_id and e.status = 'published')
  );
create policy "episode_likes_self_delete" on public.episode_likes
  for delete using (profile_id = (select auth.uid()));

-- Follows: own rows; creators cannot follow themselves
create policy "creator_follows_self_read" on public.creator_follows
  for select using (profile_id = (select auth.uid()));
create policy "creator_follows_self_insert" on public.creator_follows
  for insert with check (
    profile_id = (select auth.uid())
    and not exists (select 1 from public.creator_profiles c where c.id = creator_id and c.profile_id = (select auth.uid()))
  );
create policy "creator_follows_self_delete" on public.creator_follows
  for delete using (profile_id = (select auth.uid()));

-- Public counts (individual rows stay private)
create or replace function public.episode_like_counts(p_episode_ids uuid[])
returns table (episode_id uuid, likes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select l.episode_id, count(*) from public.episode_likes l
  where l.episode_id = any (p_episode_ids)
  group by l.episode_id;
$$;

create or replace function public.creator_follower_count(p_creator_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from public.creator_follows where creator_id = p_creator_id;
$$;

grant execute on function public.episode_like_counts(uuid[]) to anon, authenticated;
grant execute on function public.creator_follower_count(uuid) to anon, authenticated;
