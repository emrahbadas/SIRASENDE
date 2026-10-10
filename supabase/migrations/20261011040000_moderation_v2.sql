-- Moderation v2: granular review states, moderation note, content warnings

alter type public.content_status add value if not exists 'rejected';
alter type public.content_status add value if not exists 'needs_changes';

alter table public.series add column moderation_note text;

alter table public.productions
  add column content_warnings text[] not null default '{}';
