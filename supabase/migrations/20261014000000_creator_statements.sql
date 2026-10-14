-- Monthly creator statements (hakediş belgesi) + payouts on/off switch.
--
-- * creator_statement_data(creator, month): itemised monthly figures straight
--   from the ledger (ad revenue, coin unlocks with VAT / store fee / delivery
--   cost / platform share, downloads, bonus-coin promo, adjustments) plus the
--   opening/closing balance and payouts. Months follow Turkey time.
-- * creator_statements: one numbered document per creator and month, with a
--   random token for the public QR verification page.
-- * payouts_enabled setting: while false creators keep earning (balance grows)
--   but cannot request a payout.

insert into public.platform_settings (key, value, description) values
  ('payouts_enabled', 'false', 'Creators can request payouts (false until the company is set up; earnings keep accruing)')
on conflict (key) do nothing;

create or replace function public.setting_bool(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (value #>> '{}')::boolean from public.platform_settings where key = p_key;
$$;

-- ============================================================
-- Statement registry
-- ============================================================

create table public.creator_statements (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  period date not null check (period = date_trunc('month', period)::date),
  number text not null unique,
  token uuid not null default gen_random_uuid(),
  issued_at timestamptz not null default now(),
  unique (creator_id, period)
);

alter table public.creator_statements enable row level security;

create policy "creator_statements_read" on public.creator_statements
  for select using (
    public.has_role('admin')
    or exists (select 1 from public.creator_profiles c where c.id = creator_id and c.profile_id = (select auth.uid()))
  );

-- Admin, the creator themself, or the server (service role, no auth.uid())
create or replace function public.can_read_creator_finance(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is null
      or public.has_role('admin')
      or exists (select 1 from public.creator_profiles where id = p_creator_id and profile_id = auth.uid());
$$;

/** Numbers the creator's statement for the month on first use: SS-2026-10-0001. */
create or replace function public.issue_creator_statement(p_creator_id uuid, p_month date)
returns public.creator_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_month)::date;
  v_row public.creator_statements;
  v_seq int;
begin
  if not public.can_read_creator_finance(p_creator_id) then
    raise exception 'forbidden';
  end if;
  if v_period > date_trunc('month', now() at time zone 'Europe/Istanbul')::date then
    raise exception 'future_period';
  end if;

  select * into v_row from public.creator_statements where creator_id = p_creator_id and period = v_period;
  if v_row.id is not null then
    return v_row;
  end if;

  perform pg_advisory_xact_lock(hashtext('creator_statements:' || v_period));
  select count(*) + 1 into v_seq from public.creator_statements where period = v_period;

  insert into public.creator_statements (creator_id, period, number)
  values (p_creator_id, v_period, 'SS-' || to_char(v_period, 'YYYY-MM') || '-' || lpad(v_seq::text, 4, '0'))
  on conflict (creator_id, period) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.creator_statements where creator_id = p_creator_id and period = v_period;
  end if;
  return v_row;
end;
$$;

-- ============================================================
-- Statement figures
-- ============================================================

create or replace function public.creator_statement_data(p_creator_id uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_month)::date;
  v_start timestamptz := v_period::timestamp at time zone 'Europe/Istanbul';
  v_end timestamptz := (v_period + interval '1 month')::timestamp at time zone 'Europe/Istanbul';
  v_tax int := coalesce(public.setting_int('sales_tax_bps'), 2000);
  v_fee int := coalesce(public.setting_int('store_fee_bps'), 1500);
  v_account uuid;
  v_creator record;
  v_ad jsonb;
  v_coin jsonb;
  v_download jsonb;
  v_other bigint;
  v_opening bigint;
  v_closing bigint;
  v_requested bigint;
  v_returned bigint;
  v_earned bigint;
  v_payouts jsonb;
begin
  if not public.can_read_creator_finance(p_creator_id) then
    raise exception 'forbidden';
  end if;

  select c.id, c.creator_name, p.username, a.account_holder, right(a.iban, 4) as iban_last4
    into v_creator
    from public.creator_profiles c
    join public.profiles p on p.id = c.profile_id
    left join public.creator_payout_accounts a on a.creator_id = c.id
   where c.id = p_creator_id;
  if v_creator.id is null then
    raise exception 'creator_not_found';
  end if;

  select id into v_account from public.wallet_accounts
   where owner_kind = 'creator' and creator_id = p_creator_id and currency = 'TRY';

  -- Ad revenue: settlements booked in the month
  select jsonb_build_object(
           'impressions', coalesce(sum(s.impressions), 0),
           'gross', coalesce(sum(s.gross_minor), 0),
           'platform', coalesce(sum(s.platform_minor), 0),
           'creator', coalesce(sum(s.creator_minor), 0))
    into v_ad
    from public.ad_revenue_settlements s
    join public.ledger_transactions t on t.id = s.ledger_transaction_id
   where s.creator_id = p_creator_id and t.created_at >= v_start and t.created_at < v_end;

  -- Coin unlocks of the creator's episodes. The viewer's gross price (VAT
  -- included) is rebuilt from the net value with the VAT / store fee rates.
  with u as (
    select (t.metadata ->> 'net_value_minor')::bigint as net,
           coalesce((t.metadata ->> 'delivery_cost_minor')::bigint, 0) as delivery,
           coalesce((t.metadata ->> 'promo_minor')::bigint, 0) as promo,
           coalesce(eu.bonus_coins_spent, 0) as bonus,
           eu.coins_spent as price,
           coalesce((select sum(e.amount) from public.ledger_entries e
                      where e.transaction_id = t.id and e.account_id = v_account), 0) as credited
      from public.ledger_transactions t
      join public.episode_unlocks eu on eu.id = t.reference_id
      join public.episodes ep on ep.id = eu.episode_id
      join public.seasons se on se.id = ep.season_id
      join public.series sr on sr.id = se.series_id
      join public.productions pr on pr.id = sr.production_id
     where t.txn_type = 'episode_unlock_coins'
       and pr.creator_id = p_creator_id
       and t.created_at >= v_start and t.created_at < v_end
  ), r as (
    select *,
           round(net * (10000 + v_tax)::numeric / (10000 - v_fee))::bigint as gross,
           case when price > 0 then delivery * (price - bonus) / price else 0 end as delivery_applied
      from u
  ), r2 as (
    select *,
           round(gross * v_tax::numeric / (10000 + v_tax))::bigint as vat,
           greatest(net - delivery_applied, 0) as base,
           credited - promo as creator_cut
      from r
  )
  select jsonb_build_object(
           'unlocks', count(*),
           'paid_unlocks', count(*) filter (where bonus < price),
           'bonus_unlocks', count(*) filter (where bonus > 0),
           'coins', coalesce(sum(price), 0),
           'bonus_coins', coalesce(sum(bonus), 0),
           'gross', coalesce(sum(gross), 0),
           'vat', coalesce(sum(vat), 0),
           'store_fee', coalesce(sum(gross - vat - net), 0),
           'net', coalesce(sum(net), 0),
           'delivery', coalesce(sum(delivery_applied), 0),
           'base', coalesce(sum(base), 0),
           'platform', coalesce(sum(base - creator_cut), 0),
           'creator', coalesce(sum(creator_cut), 0),
           'promo', coalesce(sum(promo), 0))
    into v_coin
    from r2;

  -- Download sales of the creator's series
  with d as (
    select coalesce((t.metadata ->> 'net_value_minor')::bigint, 0) as net,
           coalesce((select sum(e.amount) from public.ledger_entries e
                      where e.transaction_id = t.id and e.account_id = v_account), 0) as credited
      from public.ledger_transactions t
      join public.download_purchases dp on dp.id = t.reference_id
      join public.series sr on sr.id = dp.series_id
      join public.productions pr on pr.id = sr.production_id
     where t.txn_type = 'download_purchase'
       and pr.creator_id = p_creator_id
       and t.created_at >= v_start and t.created_at < v_end
  )
  select jsonb_build_object(
           'count', count(*),
           'net', coalesce(sum(net), 0),
           'platform', coalesce(sum(net - credited), 0),
           'creator', coalesce(sum(credited), 0))
    into v_download
    from d;

  if v_account is null then
    v_other := 0; v_opening := 0; v_closing := 0; v_requested := 0; v_returned := 0; v_earned := 0;
  else
    select coalesce(sum(e.amount) filter (where e.created_at < v_start), 0),
           coalesce(sum(e.amount) filter (where e.created_at < v_end), 0),
           coalesce(-sum(e.amount) filter (where t.txn_type = 'payout_request' and e.created_at >= v_start and e.created_at < v_end), 0),
           coalesce(sum(e.amount) filter (where t.txn_type = 'payout_rejected' and e.created_at >= v_start and e.created_at < v_end), 0),
           coalesce(sum(e.amount) filter (where t.txn_type not in ('payout_request', 'payout_rejected')
                                            and e.created_at >= v_start and e.created_at < v_end), 0),
           coalesce(sum(e.amount) filter (where t.txn_type not in ('payout_request', 'payout_rejected',
                                                                   'ad_revenue_settlement', 'episode_unlock_coins', 'download_purchase')
                                            and e.created_at >= v_start and e.created_at < v_end), 0)
      into v_opening, v_closing, v_requested, v_returned, v_earned, v_other
      from public.ledger_entries e
      join public.ledger_transactions t on t.id = e.transaction_id
     where e.account_id = v_account;
  end if;

  -- Payouts sent in the month (bank transfer done, with its reference)
  select coalesce(jsonb_agg(jsonb_build_object(
           'amount', p.amount_minor,
           'paid_at', t.created_at,
           'reference', p.provider_reference,
           'iban_last4', right(p.iban, 4)) order by t.created_at), '[]')
    into v_payouts
    from public.payout_requests p
    join public.ledger_transactions t on t.id = p.settle_transaction_id
   where p.creator_id = p_creator_id and p.status = 'paid'
     and t.created_at >= v_start and t.created_at < v_end;

  return jsonb_build_object(
    'creator', jsonb_build_object(
      'id', v_creator.id,
      'name', v_creator.creator_name,
      'username', v_creator.username,
      'account_holder', v_creator.account_holder,
      'iban_last4', v_creator.iban_last4),
    'period', v_period,
    'period_start', v_start,
    'period_end', v_end,
    'closed', now() >= v_end,
    'rates', jsonb_build_object('sales_tax_bps', v_tax, 'store_fee_bps', v_fee),
    'ad', v_ad,
    'coin', v_coin,
    'download', v_download,
    'other', v_other,
    'earned', v_earned,
    'opening', v_opening,
    'requested', v_requested,
    'returned', v_returned,
    'closing', v_closing,
    'payouts', v_payouts,
    'paid_total', (select coalesce(sum((x ->> 'amount')::bigint), 0) from jsonb_array_elements(v_payouts) x)
  );
end;
$$;

revoke all on function public.creator_statement_data(uuid, date) from public, anon;
revoke all on function public.issue_creator_statement(uuid, date) from public, anon;
grant execute on function public.creator_statement_data(uuid, date) to authenticated, service_role;
grant execute on function public.issue_creator_statement(uuid, date) to authenticated, service_role;

/** Admin overview: every creator with activity or a balance, one row each. */
create or replace function public.admin_statement_overview(p_month date)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', p_month)::date;
  v_end timestamptz := (v_period + interval '1 month')::timestamp at time zone 'Europe/Istanbul';
  v_id uuid;
begin
  if auth.uid() is not null and not public.has_role('admin') then
    raise exception 'forbidden';
  end if;

  for v_id in
    select c.id from public.creator_profiles c
     where exists (select 1 from public.wallet_accounts w
                    join public.ledger_entries e on e.account_id = w.id
                   where w.creator_id = c.id and w.owner_kind = 'creator' and e.created_at < v_end)
        or exists (select 1 from public.productions p
                    join public.series s on s.production_id = p.id
                    join public.seasons se on se.series_id = s.id
                    join public.episodes ep on ep.season_id = se.id
                    join public.episode_unlocks u on u.episode_id = ep.id
                   where p.creator_id = c.id and u.method = 'coins' and u.created_at < v_end)
     order by c.creator_name
  loop
    return next public.creator_statement_data(v_id, v_period)
      || jsonb_build_object('statement',
           (select jsonb_build_object('number', s.number) from public.creator_statements s
             where s.creator_id = v_id and s.period = v_period));
  end loop;
end;
$$;

revoke all on function public.admin_statement_overview(date) from public, anon;
grant execute on function public.admin_statement_overview(date) to authenticated, service_role;

-- ============================================================
-- Payout requests respect the switch
-- ============================================================

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
  if not coalesce(public.setting_bool('payouts_enabled'), false) then
    raise exception 'payouts_disabled';
  end if;

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

/** Admin turns creator payout requests on/off. */
create or replace function public.set_payouts_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role('admin') then
    raise exception 'forbidden';
  end if;
  update public.platform_settings set value = to_jsonb(p_enabled), updated_at = now() where key = 'payouts_enabled';
end;
$$;

revoke all on function public.set_payouts_enabled(boolean) from public, anon;
grant execute on function public.set_payouts_enabled(boolean) to authenticated;
