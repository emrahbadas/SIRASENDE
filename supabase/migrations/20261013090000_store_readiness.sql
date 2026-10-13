-- Store readiness: account deletion, content reports, creator blocking.

-- ============================================================
-- Account deletion (Google Play: in-app + web request)
-- ============================================================
-- Financial records (coin purchases, ledger, payouts) must be kept for legal
-- retention, so they stay — without personal data. Everything personal is
-- deleted or anonymised here; the server then deletes the auth user when no
-- financial rows reference it, otherwise scrubs its email and blocks sign-in.

alter table public.profiles add column deleted_at timestamptz;

create or replace function public.anonymize_account(p_profile_id uuid)
returns table (production_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_productions uuid[];
begin
  if exists (
    select 1 from public.payout_requests pr
    join public.creator_profiles cp on cp.id = pr.creator_id
    where cp.profile_id = p_profile_id and pr.status in ('requested', 'processing')
  ) then
    raise exception 'payout_pending';
  end if;

  delete from public.watch_progress where profile_id = p_profile_id;
  delete from public.watchlist where profile_id = p_profile_id;
  delete from public.episode_likes where profile_id = p_profile_id;
  delete from public.creator_follows where profile_id = p_profile_id;
  delete from public.feedback where profile_id = p_profile_id;
  delete from public.login_streaks where profile_id = p_profile_id;
  delete from public.ad_unlock_progress where profile_id = p_profile_id;
  delete from public.user_roles where profile_id = p_profile_id;

  select id into v_creator from public.creator_profiles where profile_id = p_profile_id;
  if v_creator is not null then
    select coalesce(array_agg(id), '{}') into v_productions
    from public.productions where creator_id = v_creator and deleted_at is null;

    -- Content goes offline now; videos are deleted by the server afterwards
    update public.series s set status = 'blocked'
      from public.productions p
     where p.id = s.production_id and p.creator_id = v_creator and s.status <> 'blocked';
    update public.productions set deleted_at = now() where creator_id = v_creator and deleted_at is null;
    update public.series s set deleted_at = now()
      from public.productions p
     where p.id = s.production_id and p.creator_id = v_creator and s.deleted_at is null;

    delete from public.creator_follows where creator_id = v_creator;
    delete from public.creator_payout_accounts where creator_id = v_creator;
    update public.creator_profiles
       set creator_name = 'Silinmiş creator', bio = null, website_url = null
     where id = v_creator;
  end if;

  update public.profiles
     set username = 'silinmis_' || left(replace(id::text, '-', ''), 21),
         display_name = null, avatar_url = null, deleted_at = now()
   where id = p_profile_id;

  return query select coalesce(v_productions, '{}');
end;
$$;

revoke all on function public.anonymize_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_account(uuid) to service_role;

-- ============================================================
-- Content reports (Google Play UGC: report from inside the app)
-- ============================================================

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  series_id uuid not null references public.series (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete cascade,
  reason text not null check (reason in ('sexual', 'violence', 'hate', 'harassment', 'copyright', 'misleading', 'other')),
  note text check (note is null or length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_content_reports_open on public.content_reports (created_at desc) where status = 'open';
-- One open report per viewer and series/episode
create unique index uq_content_reports_open on public.content_reports
  (reporter_id, series_id, coalesce(episode_id, '00000000-0000-0000-0000-000000000000'::uuid)) where status = 'open';

alter table public.content_reports enable row level security;

create policy "content_reports_own_insert" on public.content_reports
  for insert with check (reporter_id = (select auth.uid()) and status = 'open');

create policy "content_reports_staff_read" on public.content_reports
  for select using (public.has_role('admin') or public.has_role('moderator'));

create policy "content_reports_staff_update" on public.content_reports
  for update using (public.has_role('admin') or public.has_role('moderator'));

-- ============================================================
-- Blocking creators (viewer no longer sees their series)
-- ============================================================

create table public.creator_blocks (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, creator_id)
);

alter table public.creator_blocks enable row level security;

create policy "creator_blocks_own" on public.creator_blocks
  for all using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

-- Account deletion also removes the viewer's reports authorship and blocks
create or replace function public.anonymize_account_extras()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.creator_blocks where profile_id = new.id;
    update public.content_reports set reporter_id = null where reporter_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.anonymize_account_extras() from public, anon, authenticated;

create trigger trg_profiles_anonymize_extras after update of deleted_at on public.profiles
  for each row execute function public.anonymize_account_extras();
