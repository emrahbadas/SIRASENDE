-- In-app feedback / bug reports. Viewers can only add their own rows and
-- never read them back; admins read them.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('feedback', 'bug', 'content')),
  message text not null check (length(trim(message)) between 5 and 2000),
  app_version text,
  platform text,
  created_at timestamptz not null default now()
);

create index idx_feedback_recent on public.feedback (created_at desc);

alter table public.feedback enable row level security;

create policy "feedback_own_insert" on public.feedback
  for insert with check (profile_id = (select auth.uid()));

create policy "feedback_admin_read" on public.feedback
  for select using (public.has_role('admin'));
