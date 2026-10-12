-- The deferred "every ledger transaction balances" check ran with the
-- caller's privileges. When a viewer's own RPC posted a transaction
-- (daily reward, coin unlock), RLS let the check see only the viewer's own
-- entries, so it summed one side and rejected a balanced transaction at commit
-- ("ledger_transaction_unbalanced"). It must see the whole transaction.
create or replace function public.check_ledger_balanced()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.ledger_entries
    where transaction_id = new.transaction_id
    group by currency
    having sum(amount) <> 0
  ) then
    raise exception 'ledger_transaction_unbalanced %', new.transaction_id;
  end if;
  return null;
end;
$$;

revoke all on function public.check_ledger_balanced() from public, anon, authenticated;
