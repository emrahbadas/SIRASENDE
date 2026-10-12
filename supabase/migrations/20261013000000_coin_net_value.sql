-- Coin accounting on real net value.
--
-- Before: every spent coin was valued at a fixed policy rate (0.50 TRY), no
-- matter what the viewer paid. Bonus-heavy packages (1 800 coins for 599.99)
-- then released more revenue than was collected, and store fees / VAT were
-- never deducted, so the creator share came out of the platform's pocket.
--
-- Now:
-- * Each purchase becomes a coin lot carrying the purchase's NET value
--   (price − VAT − store fee). Spending consumes lots oldest first and
--   releases exactly that net value from deferred revenue.
-- * Episode unlocks: creator gets share_bps of (net value − delivery cost of
--   the episode); never negative. Downloads: share of net value.
-- * Rates are platform settings (to be confirmed with an accountant).

insert into public.platform_settings (key, value, description) values
  ('sales_tax_bps', '2000', 'VAT included in store prices, in basis points (withheld/remitted by the store)'),
  ('store_fee_bps', '1500', 'Store service fee on the price excluding VAT, in basis points'),
  ('delivery_cost_minor_per_hour', '300', 'Video delivery cost per watched hour in kuruş (Stream: 1 USD / 1000 min at 50 TRY)')
on conflict (key) do nothing;

-- Pass-through accounts: what the store kept as VAT and as its fee
insert into public.wallet_accounts (owner_kind, system_code, currency, allow_negative) values
  ('system', 'sales_tax', 'TRY', false),
  ('system', 'store_fees', 'TRY', false)
on conflict do nothing;

create table public.coin_lots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  purchase_id uuid references public.coin_purchases (id),
  coins_total int not null check (coins_total > 0),
  coins_remaining int not null check (coins_remaining between 0 and coins_total),
  -- net TRY value (kuruş) still attached to the remaining coins
  value_remaining_minor bigint not null check (value_remaining_minor >= 0),
  created_at timestamptz not null default now()
);

create index idx_coin_lots_open on public.coin_lots (profile_id, created_at) where coins_remaining > 0;

alter table public.coin_lots enable row level security;
create policy "coin_lots_owner_read" on public.coin_lots
  for select using (profile_id = (select auth.uid()) or public.has_role('admin'));

alter table public.coin_purchases
  add column net_minor bigint,
  add column sales_tax_minor bigint,
  add column store_fee_minor bigint;

-- Price split for a store sale: VAT included in the price, fee on the rest.
create or replace function public.store_sale_split(p_price_minor bigint)
returns table (sales_tax_minor bigint, store_fee_minor bigint, net_minor bigint)
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select coalesce(public.setting_int('sales_tax_bps'), 2000) as tax_bps,
           coalesce(public.setting_int('store_fee_bps'), 1500) as fee_bps
  ), t as (
    select round(p_price_minor * r.tax_bps / (10000.0 + r.tax_bps))::bigint as tax, r.fee_bps from r
  ), f as (
    select t.tax, round((p_price_minor - t.tax) * t.fee_bps / 10000.0)::bigint as fee from t
  )
  select f.tax, f.fee, p_price_minor - f.tax - f.fee from f;
$$;

create or replace function public.credit_coin_purchase(
  p_profile_id uuid,
  p_package_id uuid,
  p_store text,
  p_store_transaction_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg public.coin_packages;
  v_purchase_id uuid;
  v_coins int;
  v_split record;
  v_txn uuid;
begin
  select * into v_pkg from public.coin_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'unknown_coin_package';
  end if;
  v_coins := v_pkg.coins + v_pkg.bonus_coins;
  select * into v_split from public.store_sale_split(v_pkg.price_minor);

  insert into public.coin_purchases
    (profile_id, package_id, store, store_transaction_id, coins_granted, price_minor, net_minor, sales_tax_minor, store_fee_minor)
  values
    (p_profile_id, p_package_id, p_store, p_store_transaction_id, v_coins, v_pkg.price_minor,
     v_split.net_minor, v_split.sales_tax_minor, v_split.store_fee_minor)
  on conflict (store, store_transaction_id) do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    select id into v_purchase_id from public.coin_purchases
    where store = p_store and store_transaction_id = p_store_transaction_id;
    return v_purchase_id; -- already credited
  end if;

  insert into public.coin_lots (profile_id, purchase_id, coins_total, coins_remaining, value_remaining_minor)
  values (p_profile_id, v_purchase_id, v_coins, v_coins, v_split.net_minor);

  -- Gross price in; VAT and store fee out; the net is deferred until spent.
  v_txn := public.post_ledger_transaction(
    'coin_purchase',
    'coin_purchase:' || p_store || ':' || p_store_transaction_id,
    jsonb_build_array(
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', -v_coins),
      jsonb_build_object('account_id', public.viewer_coin_account(p_profile_id), 'currency', 'COIN', 'amount', v_coins),
      jsonb_build_object('account_id', public.system_account('external_payments', 'TRY'), 'currency', 'TRY', 'amount', -v_pkg.price_minor),
      jsonb_build_object('account_id', public.system_account('sales_tax', 'TRY'), 'currency', 'TRY', 'amount', v_split.sales_tax_minor),
      jsonb_build_object('account_id', public.system_account('store_fees', 'TRY'), 'currency', 'TRY', 'amount', v_split.store_fee_minor),
      jsonb_build_object('account_id', public.system_account('deferred_coin_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_split.net_minor)
    ),
    null, p_profile_id, 'coin_purchases', v_purchase_id,
    jsonb_build_object('gross_minor', v_pkg.price_minor)
  );

  update public.coin_purchases set ledger_transaction_id = v_txn where id = v_purchase_id;
  return v_purchase_id;
end;
$$;

-- Takes p_coins from the viewer's lots (oldest first) and returns the net
-- value attached to them. Raises insufficient_coins. Caller posts the ledger.
create or replace function public.consume_coin_lots(p_profile_id uuid, p_coins int)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot record;
  v_need int := p_coins;
  v_take int;
  v_value bigint;
  v_total bigint := 0;
begin
  if p_coins <= 0 then
    return 0;
  end if;

  if (select coalesce(sum(coins_remaining), 0) from public.coin_lots
      where profile_id = p_profile_id and coins_remaining > 0) < p_coins then
    raise exception 'insufficient_coins';
  end if;

  for v_lot in
    select id, coins_remaining, value_remaining_minor from public.coin_lots
    where profile_id = p_profile_id and coins_remaining > 0
    order by created_at, id
    for update
  loop
    exit when v_need = 0;
    v_take := least(v_need, v_lot.coins_remaining);
    -- Proportional value; the last coins of a lot take whatever value is left,
    -- so a lot always releases exactly its net value in total
    v_value := case when v_take = v_lot.coins_remaining then v_lot.value_remaining_minor
                    else v_lot.value_remaining_minor * v_take / v_lot.coins_remaining end;
    update public.coin_lots
       set coins_remaining = coins_remaining - v_take,
           value_remaining_minor = value_remaining_minor - v_value
     where id = v_lot.id;
    v_need := v_need - v_take;
    v_total := v_total + v_value;
  end loop;

  return v_total;
end;
$$;

-- Delivery cost of one full watch of an episode, in kuruş
create or replace function public.episode_delivery_cost_minor(p_episode_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select ceil(
    coalesce(
      (select va.duration_seconds from public.video_assets va
        where va.episode_id = p_episode_id and va.status = 'ready' limit 1),
      (select e.duration_seconds from public.episodes e where e.id = p_episode_id),
      coalesce(public.setting_int('max_episode_seconds'), 180)
    ) * coalesce(public.setting_int('delivery_cost_minor_per_hour'), 300) / 3600.0
  )::bigint;
$$;

create or replace function public.unlock_episode_with_coins(p_episode_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ctx record;
  v_series public.series;
  v_policy public.revenue_policies;
  v_unlock_id uuid;
  v_price int;
  v_value bigint;
  v_delivery bigint;
  v_creator_cut bigint;
  v_txn uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_unlock_id from public.episode_unlocks where profile_id = v_uid and episode_id = p_episode_id;
  if v_unlock_id is not null then
    return v_unlock_id;
  end if;

  if public.can_watch_episode(p_episode_id) then
    raise exception 'episode_not_locked';
  end if;

  select * into v_ctx from public.episode_context(p_episode_id);
  if v_ctx.series_status is distinct from 'published' or v_ctx.episode_status is distinct from 'published' then
    raise exception 'episode_not_available';
  end if;

  select * into v_series from public.series where id = v_ctx.series_id;
  v_policy := public.current_revenue_policy();
  v_price := v_series.episode_coin_price;

  v_value := public.consume_coin_lots(v_uid, v_price);
  v_delivery := public.episode_delivery_cost_minor(p_episode_id);
  v_creator_cut := greatest(v_value - v_delivery, 0) * v_policy.coin_unlock_creator_share_bps / 10000;

  insert into public.episode_unlocks (profile_id, episode_id, method, coins_spent)
  values (v_uid, p_episode_id, 'coins', v_price)
  returning id into v_unlock_id;

  v_txn := public.post_ledger_transaction(
    'episode_unlock_coins',
    'episode_unlock:' || v_unlock_id,
    jsonb_build_array(
      jsonb_build_object('account_id', public.viewer_coin_account(v_uid), 'currency', 'COIN', 'amount', -v_price),
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', v_price),
      jsonb_build_object('account_id', public.system_account('deferred_coin_revenue', 'TRY'), 'currency', 'TRY', 'amount', -v_value),
      jsonb_build_object('account_id', public.creator_earnings_account(v_ctx.creator_id), 'currency', 'TRY', 'amount', v_creator_cut),
      jsonb_build_object('account_id', public.system_account('platform_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_value - v_creator_cut)
    ),
    v_policy.id, v_uid, 'episode_unlocks', v_unlock_id,
    jsonb_build_object('net_value_minor', v_value, 'delivery_cost_minor', v_delivery)
  );

  update public.episode_unlocks set ledger_transaction_id = v_txn where id = v_unlock_id;
  return v_unlock_id;
exception
  when check_violation then
    if sqlerrm like '%wallet_accounts%' then
      raise exception 'insufficient_coins';
    end if;
    raise;
end;
$$;

create or replace function public.purchase_series_download(p_series_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_series public.series;
  v_creator uuid;
  v_policy public.revenue_policies;
  v_purchase_id uuid;
  v_value bigint;
  v_creator_cut bigint;
  v_txn uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_purchase_id from public.download_purchases where profile_id = v_uid and series_id = p_series_id;
  if v_purchase_id is not null then
    return v_purchase_id;
  end if;

  select * into v_series from public.series where id = p_series_id and deleted_at is null;
  if v_series.id is null or v_series.status <> 'published' then
    raise exception 'series_not_available';
  end if;
  if not v_series.downloads_enabled then
    raise exception 'downloads_disabled';
  end if;

  select creator_id into v_creator from public.productions where id = v_series.production_id;
  v_policy := public.current_revenue_policy();
  v_value := public.consume_coin_lots(v_uid, v_series.download_coin_price);
  v_creator_cut := v_value * v_policy.download_creator_share_bps / 10000;

  insert into public.download_purchases (profile_id, series_id, coins_spent)
  values (v_uid, p_series_id, v_series.download_coin_price)
  returning id into v_purchase_id;

  v_txn := public.post_ledger_transaction(
    'download_purchase',
    'download_purchase:' || v_purchase_id,
    jsonb_build_array(
      jsonb_build_object('account_id', public.viewer_coin_account(v_uid), 'currency', 'COIN', 'amount', -v_series.download_coin_price),
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', v_series.download_coin_price),
      jsonb_build_object('account_id', public.system_account('deferred_coin_revenue', 'TRY'), 'currency', 'TRY', 'amount', -v_value),
      jsonb_build_object('account_id', public.creator_earnings_account(v_creator), 'currency', 'TRY', 'amount', v_creator_cut),
      jsonb_build_object('account_id', public.system_account('platform_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_value - v_creator_cut)
    ),
    v_policy.id, v_uid, 'download_purchases', v_purchase_id,
    jsonb_build_object('net_value_minor', v_value)
  );

  update public.download_purchases set ledger_transaction_id = v_txn where id = v_purchase_id;
  return v_purchase_id;
exception
  when check_violation then
    if sqlerrm like '%wallet_accounts%' then
      raise exception 'insufficient_coins';
    end if;
    raise;
end;
$$;

-- Internal helpers: never callable through the API
revoke all on function public.store_sale_split(bigint) from public, anon, authenticated;
revoke all on function public.consume_coin_lots(uuid, int) from public, anon, authenticated;
revoke all on function public.episode_delivery_cost_minor(uuid) from public, anon, authenticated;
grant execute on function public.store_sale_split(bigint) to service_role;
grant execute on function public.consume_coin_lots(uuid, int) to service_role;
grant execute on function public.episode_delivery_cost_minor(uuid) to service_role;
