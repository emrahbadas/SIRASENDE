-- creator_profiles is publicly readable; the ban reason and who issued it are
-- not. Column privileges hide them from API roles; the creator reads their own
-- through my_ban(), admins through the server (service role).
revoke select on public.creator_profiles from anon, authenticated;
grant select (id, profile_id, creator_name, bio, website_url, verified, created_at, updated_at, banned_at)
  on public.creator_profiles to anon, authenticated;

create or replace function public.my_ban()
returns table (banned_at timestamptz, ban_reason text)
language sql
stable
security definer
set search_path = public
as $$
  select cp.banned_at, cp.ban_reason from public.creator_profiles cp
  where cp.profile_id = auth.uid() and cp.banned_at is not null;
$$;

revoke all on function public.my_ban() from public, anon;
grant execute on function public.my_ban() to authenticated, service_role;
