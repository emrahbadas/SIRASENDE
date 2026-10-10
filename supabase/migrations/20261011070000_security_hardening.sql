-- Security hardening (Supabase advisors)
-- Trigger functions run regardless of EXECUTE privilege, so they must not be
-- callable through /rest/v1/rpc. become_creator already rejects anonymous
-- callers, but should not be exposed to anon at all.

revoke all on function public.apply_ledger_entry() from public, anon, authenticated;
revoke all on function public.enforce_storage_quota() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.forbid_mutation() from public, anon, authenticated;
revoke all on function public.check_ledger_balanced() from public, anon, authenticated;

revoke all on function public.become_creator(text) from anon;

alter function public.set_updated_at() set search_path = public;
