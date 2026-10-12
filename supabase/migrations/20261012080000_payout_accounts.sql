-- Where creator payouts go. A payout request snapshots the account at request
-- time, so changing the IBAN later cannot redirect a payout already in flight.

create table public.creator_payout_accounts (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  account_holder text not null check (length(trim(account_holder)) between 3 and 100),
  iban text not null check (iban ~ '^TR[0-9]{24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_creator_payout_accounts_updated_at before update on public.creator_payout_accounts
  for each row execute function public.set_updated_at();

alter table public.creator_payout_accounts enable row level security;

create policy "payout_accounts_own_read" on public.creator_payout_accounts
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

create policy "payout_accounts_own_insert" on public.creator_payout_accounts
  for insert with check (creator_id = public.my_creator_id());

create policy "payout_accounts_own_update" on public.creator_payout_accounts
  for update using (creator_id = public.my_creator_id()) with check (creator_id = public.my_creator_id());

alter table public.payout_requests
  add column account_holder text,
  add column iban text;

create or replace function public.request_payout(p_amount_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_account public.creator_payout_accounts;
  v_policy public.revenue_policies;
  v_payout uuid;
  v_txn uuid;
begin
  select id into v_creator from public.creator_profiles where profile_id = auth.uid();
  if v_creator is null then
    raise exception 'not_a_creator';
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
