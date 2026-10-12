-- Studio analytics + moderation fixes
-- 1) Moderators could read series and episodes under review but not their
--    seasons, so the admin queue showed 0 episodes and approval could not
--    publish episodes of series the moderator does not own.
-- 2) Per-episode stats for the caller's own series. Viewer-level rows
--    (watch_progress, likes, unlocks, watchlist) are private to each viewer, so
--    the creator only gets aggregates through this security definer function.

create policy "seasons_moderation_read" on public.seasons
  for select using (public.has_role('moderator') or public.has_role('admin'));

create or replace function public.my_creator_analytics()
returns table (
  series_id uuid,
  series_title text,
  series_status public.content_status,
  watchlisted bigint,
  episode_id uuid,
  season_number int,
  episode_number int,
  episode_title text,
  duration_seconds int,
  viewers bigint,
  completions bigint,
  likes bigint,
  coin_unlocks bigint,
  ad_unlocks bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.title,
    s.status,
    (select count(*) from public.watchlist w where w.series_id = s.id),
    e.id,
    se.season_number,
    e.episode_number,
    e.title,
    e.duration_seconds,
    (select count(*) from public.watch_progress wp where wp.episode_id = e.id),
    (select count(*) from public.watch_progress wp where wp.episode_id = e.id and wp.completed),
    (select count(*) from public.episode_likes l where l.episode_id = e.id),
    (select count(*) from public.episode_unlocks u where u.episode_id = e.id and u.method = 'coins'),
    (select count(*) from public.episode_unlocks u where u.episode_id = e.id and u.method = 'rewarded_ad')
  from public.series s
  join public.productions p on p.id = s.production_id
  join public.creator_profiles c on c.id = p.creator_id
  join public.seasons se on se.series_id = s.id
  join public.episodes e on e.season_id = se.id
  where c.profile_id = auth.uid() and s.deleted_at is null
  order by s.created_at, se.season_number, e.episode_number;
$$;

revoke all on function public.my_creator_analytics() from public, anon;
grant execute on function public.my_creator_analytics() to authenticated, service_role;
