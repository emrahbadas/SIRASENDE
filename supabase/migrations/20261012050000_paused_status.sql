-- Creator-paused content (hidden from viewers, creator can resume).
-- Admin takedowns use the existing 'blocked' status, which only staff can lift.
-- Separate migration: a new enum value cannot be used in the transaction that adds it.

alter type public.content_status add value if not exists 'paused';
