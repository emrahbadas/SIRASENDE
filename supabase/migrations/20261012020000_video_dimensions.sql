-- Video dimensions reported by the provider, so players can pick the right fit
-- before the first frame (vertical fills the screen, horizontal is letterboxed).

alter table public.video_assets
  add column width int check (width > 0),
  add column height int check (height > 0);
