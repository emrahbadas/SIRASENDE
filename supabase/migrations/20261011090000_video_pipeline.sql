-- Phase 3: video pipeline
-- video_assets are written only by the server (service role) after it checks
-- ownership, so a creator cannot point an episode at someone else's provider
-- asset or mark a video ready. Creators and moderators can read.

drop policy if exists "video_assets_owner_all" on public.video_assets;

create policy "video_assets_owner_read" on public.video_assets
  for select using (
    exists (
      select 1
      from public.episodes e
      join public.seasons se on se.id = e.season_id
      join public.series s on s.id = se.series_id
      where e.id = episode_id and public.owns_production(s.production_id)
    )
  );

create policy "video_assets_moderation_read" on public.video_assets
  for select using (public.has_role('moderator') or public.has_role('admin'));

-- One live asset per episode; provider ids are unique (webhook lookups)
create unique index uq_video_assets_active_episode on public.video_assets (episode_id)
  where status not in ('failed', 'deleted');

create unique index uq_video_assets_provider_asset on public.video_assets (provider, provider_asset_id)
  where provider_asset_id is not null;

alter table public.video_assets
  add column error_message text;
