-- Moderation: allow admins/moderators to update series and episodes (approve/reject)

create policy "series_moderation_update" on public.series
  for update using (public.has_role('moderator') or public.has_role('admin'));

create policy "episodes_moderation_update" on public.episodes
  for update using (public.has_role('moderator') or public.has_role('admin'));
