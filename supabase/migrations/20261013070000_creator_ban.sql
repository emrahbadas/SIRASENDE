-- Admin can ban (suspend) a creator account and lift the ban.
--
-- Ban: the creator's published / paused / under-review series are blocked
-- (their previous status is remembered), the creator loses write access to
-- their content (owns_production / owner policies) and cannot request payouts.
-- Earnings already credited are kept; what happens to them is an admin
-- decision. Unban restores every series the ban had blocked.

alter table public.creator_profiles
  add column banned_at timestamptz,
  add column ban_reason text,
  add column banned_by uuid references public.profiles (id);

alter table public.series add column pre_ban_status public.content_status;

-- Creators may update their own profile row, but never the ban columns
create or replace function public.guard_creator_ban_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.has_role('admin') and (
       new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
       or new.banned_by is distinct from old.banned_by
     ) then
    raise exception 'ban_fields_read_only';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_creator_ban_columns() from public, anon, authenticated;

create trigger trg_creator_profiles_guard_ban before update on public.creator_profiles
  for each row execute function public.guard_creator_ban_columns();

-- Ownership no longer counts while banned (all owner RLS and server checks use it)
create or replace function public.owns_production(p_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.productions p
    join public.creator_profiles cp on cp.id = p.creator_id
    where p.id = p_production_id and cp.profile_id = auth.uid() and cp.banned_at is null
  );
$$;

drop policy if exists "productions_owner_all" on public.productions;
create policy "productions_owner_all" on public.productions
  for all using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = productions.creator_id and cp.profile_id = auth.uid() and cp.banned_at is null
    )
  );

create or replace function public.admin_ban_creator(p_creator_id uuid, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.has_role('admin') then
    raise exception 'forbidden';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'ban_reason_required';
  end if;

  update public.creator_profiles
     set banned_at = now(), ban_reason = trim(p_reason), banned_by = auth.uid()
   where id = p_creator_id and banned_at is null;
  if not found then
    raise exception 'creator_not_found_or_already_banned';
  end if;

  update public.series s
     set pre_ban_status = s.status, status = 'blocked'
    from public.productions p
   where p.id = s.production_id and p.creator_id = p_creator_id
     and s.status in ('published', 'paused', 'moderating');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_unban_creator(p_creator_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.has_role('admin') then
    raise exception 'forbidden';
  end if;

  update public.creator_profiles
     set banned_at = null, ban_reason = null, banned_by = null
   where id = p_creator_id and banned_at is not null;
  if not found then
    raise exception 'creator_not_banned';
  end if;

  -- Only series the ban blocked; separate takedowns stay blocked
  update public.series s
     set status = s.pre_ban_status, pre_ban_status = null
    from public.productions p
   where p.id = s.production_id and p.creator_id = p_creator_id
     and s.pre_ban_status is not null and s.status = 'blocked';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Banned creators cannot request payouts
create or replace function public.request_payout(p_amount_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_banned timestamptz;
  v_account public.creator_payout_accounts;
  v_policy public.revenue_policies;
  v_payout uuid;
  v_txn uuid;
begin
  select id, banned_at into v_creator, v_banned from public.creator_profiles where profile_id = auth.uid();
  if v_creator is null then
    raise exception 'not_a_creator';
  end if;
  if v_banned is not null then
    raise exception 'creator_banned';
  end if;

  select * into v_account from public.creator_payout_accounts where creator_id = v_creator;
  if v_account.creator_id is null then
    raise exception 'payout_account_missing';
  end if;

  v_policy := public.current_revenue_policy();
  if p_amount_minor < v_policy.min_payout_minor then
    raise exception 'below_min_payout';
  end if;

  if exists (select 1 from public.payout_requests where creator_id = v_creator and status in ('requested', 'processing')) then
    raise exception 'payout_already_pending';
  end if;

  insert into public.payout_requests (creator_id, amount_minor, account_holder, iban)
  values (v_creator, p_amount_minor, v_account.account_holder, v_account.iban)
  returning id into v_payout;

  v_txn := public.post_ledger_transaction(
    'payout_request',
    'payout_request:' || v_payout,
    jsonb_build_array(
      jsonb_build_object('account_id', public.creator_earnings_account(v_creator), 'currency', 'TRY', 'amount', -p_amount_minor),
      jsonb_build_object('account_id', public.system_account('payouts_payable', 'TRY'), 'currency', 'TRY', 'amount', p_amount_minor)
    ),
    v_policy.id, auth.uid(), 'payout_requests', v_payout
  );

  update public.payout_requests set request_transaction_id = v_txn where id = v_payout;
  return v_payout;
exception
  when check_violation then
    if sqlerrm like '%wallet_accounts%' then
      raise exception 'insufficient_balance';
    end if;
    raise;
end;
$$;

revoke all on function public.admin_ban_creator(uuid, text) from public, anon;
revoke all on function public.admin_unban_creator(uuid) from public, anon;
grant execute on function public.admin_ban_creator(uuid, text) to authenticated, service_role;
grant execute on function public.admin_unban_creator(uuid) to authenticated, service_role;
