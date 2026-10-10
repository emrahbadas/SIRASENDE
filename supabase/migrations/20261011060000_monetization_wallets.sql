-- Monetization v1: wallets, double-entry ledger, coins, episode unlocks,
-- creator-controlled downloads, ad revenue settlement, storage plans, payouts.
--
-- Money model (decided):
--   * Viewer never earns. Viewer watches ads or spends coins to unlock episodes.
--   * Creator earns ONLY from (a) ad revenue on their content, after platform
--     commission, and (b) paid downloads of their series, if they enabled downloads.
--   * Platform earns from storage plan sales, ad commission, download commission
--     and coin episode unlocks.
--   * Every split ratio lives in versioned revenue_policies — never in app code.
--
-- Units:
--   * TRY amounts are bigint minor units (kuruş). Ad revenue per impression is
--     tracked in micros (1 TRY = 1_000_000 micros) and rounded at settlement.
--   * COIN is its own currency. Spending coins converts their TRY value
--     (policy.coin_value_minor) from deferred coin revenue into earned revenue.
--
-- All balance changes happen through ledger transactions posted by
-- security-definer functions. Ledger rows are immutable.

-- ============================================================
-- Replace 20261011050000_monetization_foundation
-- ============================================================
-- That draft let viewers spend arbitrary coin amounts without validating price
-- or recording an entitlement, mutated balances outside a ledger, had no ad
-- impression / coin purchase / storage quota flow and hard-coded the payout
-- minimum. Its tables held only seed rows, so they are replaced wholesale.

drop function if exists public.spend_coins(bigint, public.coin_tx_kind, uuid);
drop function if exists public.request_payout(bigint);

drop table if exists public.payouts;
drop table if exists public.revenue_events;
drop table if exists public.coin_transactions;
drop table if exists public.coin_wallets;
drop table if exists public.creator_balances;
drop table if exists public.creator_subscriptions;
drop table if exists public.storage_plans;
drop table if exists public.revenue_policies;

drop function if exists public.apply_revenue_event();
drop function if exists public.apply_coin_transaction();

drop type if exists public.payout_status;
drop type if exists public.revenue_event_type;
drop type if exists public.coin_tx_kind;

alter table public.series
  drop column if exists download_price_coins,
  drop column if exists downloads_enabled;

-- ============================================================
-- Enums
-- ============================================================

create type public.wallet_owner_kind as enum ('viewer', 'creator', 'system');

create type public.ledger_txn_type as enum (
  'coin_purchase',        -- viewer buys coins (real money in)
  'coin_refund',          -- store refund / chargeback of a coin purchase
  'episode_unlock_coins', -- viewer spends coins to unlock an episode
  'download_purchase',    -- viewer spends coins to download a series
  'ad_revenue_settlement',-- ad network revenue split creator/platform
  'storage_purchase',     -- creator pays for a storage plan
  'payout_request',       -- creator earnings moved to payable
  'payout_paid',          -- payable settled to creator bank account
  'payout_rejected',      -- payable returned to creator earnings
  'adjustment'            -- manual admin correction (always audited)
);

create type public.episode_unlock_method as enum ('coins', 'rewarded_ad', 'admin_grant');

create type public.payout_status as enum ('requested', 'processing', 'paid', 'rejected');

create type public.storage_subscription_status as enum ('active', 'past_due', 'canceled', 'expired');

-- ============================================================
-- Revenue policy (versioned, append-only)
-- ============================================================

create table public.revenue_policies (
  id uuid primary key default gen_random_uuid(),
  version int not null unique check (version > 0),
  effective_from timestamptz not null default now(),
  currency text not null default 'TRY' check (currency = 'TRY'),
  -- basis points (10000 = 100%) going to the creator; the rest is platform commission
  ad_creator_share_bps int not null check (ad_creator_share_bps between 0 and 10000),
  download_creator_share_bps int not null check (download_creator_share_bps between 0 and 10000),
  -- coin unlocks are platform revenue by default (creator earns from ads + downloads only)
  coin_unlock_creator_share_bps int not null default 0
    check (coin_unlock_creator_share_bps between 0 and 10000),
  -- TRY value of one coin when spent (kuruş)
  coin_value_minor int not null check (coin_value_minor > 0),
  min_payout_minor bigint not null check (min_payout_minor >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.current_revenue_policy()
returns public.revenue_policies
language sql
stable
security definer
set search_path = public
as $$
  select * from public.revenue_policies
  where effective_from <= now()
  order by effective_from desc, version desc
  limit 1;
$$;

-- Placeholder rates — open decision, adjust by inserting a new version.
insert into public.revenue_policies
  (version, ad_creator_share_bps, download_creator_share_bps, coin_value_minor, min_payout_minor, notes)
values
  (1, 6000, 7000, 50, 50000, 'Launch policy v1 (rates TBD, add a new version to change): ads 60/40, downloads 70/30, coin unlocks 0/100, 1 coin = 0.50 TRY, min payout 500 TRY');

-- ============================================================
-- Wallet accounts & double-entry ledger
-- ============================================================

create table public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_kind public.wallet_owner_kind not null,
  profile_id uuid references public.profiles (id) on delete restrict,
  creator_id uuid references public.creator_profiles (id) on delete restrict,
  system_code text,
  currency text not null check (currency in ('TRY', 'COIN')),
  balance bigint not null default 0,
  allow_negative boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (owner_kind = 'viewer'  and profile_id is not null and creator_id is null and system_code is null and currency = 'COIN')
 or (owner_kind = 'creator' and creator_id is not null and profile_id is null and system_code is null and currency = 'TRY')
 or (owner_kind = 'system'  and system_code is not null and profile_id is null and creator_id is null)
  ),
  check (allow_negative or balance >= 0)
);

create unique index uq_wallet_viewer on public.wallet_accounts (profile_id, currency) where owner_kind = 'viewer';
create unique index uq_wallet_creator on public.wallet_accounts (creator_id, currency) where owner_kind = 'creator';
create unique index uq_wallet_system on public.wallet_accounts (system_code, currency) where owner_kind = 'system';

create trigger trg_wallet_accounts_updated_at before update on public.wallet_accounts
  for each row execute function public.set_updated_at();

-- System accounts. "external_*" mirror the real world and may go negative.
insert into public.wallet_accounts (owner_kind, system_code, currency, allow_negative) values
  ('system', 'coin_issuance',          'COIN', true),  -- mints/burns coins
  ('system', 'external_payments',      'TRY',  true),  -- card / store money in & payouts out
  ('system', 'ad_network',             'TRY',  true),  -- ad network revenue in
  ('system', 'deferred_coin_revenue',  'TRY',  false), -- sold but unspent coins (liability)
  ('system', 'platform_revenue',       'TRY',  false), -- platform earned revenue
  ('system', 'payouts_payable',        'TRY',  false); -- creator payouts awaiting transfer

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_type public.ledger_txn_type not null,
  idempotency_key text not null unique,
  policy_id uuid references public.revenue_policies (id),
  actor_profile_id uuid references public.profiles (id),
  reference_table text,
  reference_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references public.ledger_transactions (id),
  account_id uuid not null references public.wallet_accounts (id),
  currency text not null check (currency in ('TRY', 'COIN')),
  amount bigint not null check (amount <> 0),
  created_at timestamptz not null default now()
);

create index idx_ledger_entries_account on public.ledger_entries (account_id, created_at desc);
create index idx_ledger_entries_txn on public.ledger_entries (transaction_id);
create index idx_ledger_txn_reference on public.ledger_transactions (reference_table, reference_id);

-- Immutability
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger trg_ledger_transactions_immutable before update or delete on public.ledger_transactions
  for each row execute function public.forbid_mutation();
create trigger trg_ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function public.forbid_mutation();
create trigger trg_revenue_policies_immutable before update or delete on public.revenue_policies
  for each row execute function public.forbid_mutation();

-- Apply entry to cached balance (row lock serializes concurrent spends)
create or replace function public.apply_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
begin
  update public.wallet_accounts
     set balance = balance + new.amount
   where id = new.account_id
  returning currency into v_currency;

  if v_currency is distinct from new.currency then
    raise exception 'ledger_currency_mismatch';
  end if;
  return new;
end;
$$;

create trigger trg_ledger_entries_apply after insert on public.ledger_entries
  for each row execute function public.apply_ledger_entry();

-- Each transaction must balance to zero per currency (checked at commit)
create or replace function public.check_ledger_balanced()
returns trigger
language plpgsql
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

create constraint trigger trg_ledger_entries_balanced
  after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.check_ledger_balanced();

-- ------------------------------------------------------------
-- Account helpers (internal)
-- ------------------------------------------------------------

create or replace function public.system_account(p_code text, p_currency text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.wallet_accounts
  where owner_kind = 'system' and system_code = p_code and currency = p_currency;
$$;

create or replace function public.viewer_coin_account(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.wallet_accounts (owner_kind, profile_id, currency)
  values ('viewer', p_profile_id, 'COIN')
  on conflict (profile_id, currency) where owner_kind = 'viewer' do nothing;

  select id into v_id from public.wallet_accounts
  where owner_kind = 'viewer' and profile_id = p_profile_id and currency = 'COIN';
  return v_id;
end;
$$;

create or replace function public.creator_earnings_account(p_creator_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.wallet_accounts (owner_kind, creator_id, currency)
  values ('creator', p_creator_id, 'TRY')
  on conflict (creator_id, currency) where owner_kind = 'creator' do nothing;

  select id into v_id from public.wallet_accounts
  where owner_kind = 'creator' and creator_id = p_creator_id and currency = 'TRY';
  return v_id;
end;
$$;

-- Core posting primitive. p_entries: [{"account_id": uuid, "currency": "TRY", "amount": 123}, ...]
-- Returns existing txn id when the idempotency key was already used.
create or replace function public.post_ledger_transaction(
  p_type public.ledger_txn_type,
  p_idempotency_key text,
  p_entries jsonb,
  p_policy_id uuid default null,
  p_actor uuid default null,
  p_reference_table text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn_id uuid;
  v_entry jsonb;
begin
  select id into v_txn_id from public.ledger_transactions where idempotency_key = p_idempotency_key;
  if v_txn_id is not null then
    return v_txn_id;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_entries) e
    group by e->>'currency'
    having sum((e->>'amount')::bigint) <> 0
  ) then
    raise exception 'ledger_transaction_unbalanced';
  end if;

  insert into public.ledger_transactions
    (txn_type, idempotency_key, policy_id, actor_profile_id, reference_table, reference_id, metadata)
  values
    (p_type, p_idempotency_key, p_policy_id, p_actor, p_reference_table, p_reference_id, coalesce(p_metadata, '{}'))
  returning id into v_txn_id;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    if (v_entry->>'amount')::bigint = 0 then
      continue; -- zero legs (e.g. 0% share) are skipped
    end if;
    insert into public.ledger_entries (transaction_id, account_id, currency, amount)
    values (v_txn_id, (v_entry->>'account_id')::uuid, v_entry->>'currency', (v_entry->>'amount')::bigint);
  end loop;

  return v_txn_id;
end;
$$;

-- ============================================================
-- Coins
-- ============================================================

create table public.coin_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  coins int not null check (coins > 0),
  bonus_coins int not null default 0 check (bonus_coins >= 0),
  price_minor bigint not null check (price_minor > 0),
  currency text not null default 'TRY',
  google_product_id text unique,
  apple_product_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.coin_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  package_id uuid not null references public.coin_packages (id),
  store text not null check (store in ('google_play', 'app_store', 'web')),
  store_transaction_id text not null,
  coins_granted int not null check (coins_granted > 0),
  price_minor bigint not null,
  status text not null default 'completed' check (status in ('completed', 'refunded')),
  ledger_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now(),
  unique (store, store_transaction_id)
);

-- Called by the server after verifying the store receipt (service role only).
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
  v_txn uuid;
begin
  select * into v_pkg from public.coin_packages where id = p_package_id;
  if v_pkg.id is null then
    raise exception 'unknown_coin_package';
  end if;
  v_coins := v_pkg.coins + v_pkg.bonus_coins;

  insert into public.coin_purchases (profile_id, package_id, store, store_transaction_id, coins_granted, price_minor)
  values (p_profile_id, p_package_id, p_store, p_store_transaction_id, v_coins, v_pkg.price_minor)
  on conflict (store, store_transaction_id) do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    select id into v_purchase_id from public.coin_purchases
    where store = p_store and store_transaction_id = p_store_transaction_id;
    return v_purchase_id; -- already credited
  end if;

  -- Real money is held as deferred revenue until coins are spent.
  v_txn := public.post_ledger_transaction(
    'coin_purchase',
    'coin_purchase:' || p_store || ':' || p_store_transaction_id,
    jsonb_build_array(
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', -v_coins),
      jsonb_build_object('account_id', public.viewer_coin_account(p_profile_id), 'currency', 'COIN', 'amount', v_coins),
      jsonb_build_object('account_id', public.system_account('external_payments', 'TRY'), 'currency', 'TRY', 'amount', -v_pkg.price_minor),
      jsonb_build_object('account_id', public.system_account('deferred_coin_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_pkg.price_minor)
    ),
    null, p_profile_id, 'coin_purchases', v_purchase_id
  );

  update public.coin_purchases set ledger_transaction_id = v_txn where id = v_purchase_id;
  return v_purchase_id;
end;
$$;

-- Launch coin catalog (1 coin = 0.50 TRY at policy v1; bonus coins on larger packs)
insert into public.coin_packages (code, coins, bonus_coins, price_minor, google_product_id, apple_product_id) values
  ('coins_100',  100,  0,   4999,  'coins_100',  'coins_100'),
  ('coins_300',  300,  30,  13999, 'coins_300',  'coins_300'),
  ('coins_600',  600,  90,  24999, 'coins_600',  'coins_600'),
  ('coins_1500', 1500, 300, 59999, 'coins_1500', 'coins_1500');

-- ============================================================
-- Series / episode monetization settings (creator controlled)
-- ============================================================

alter table public.series
  add column free_episode_count int not null default 10 check (free_episode_count >= 0),
  add column episode_coin_price int not null default 10 check (episode_coin_price between 1 and 1000),
  -- downloads are OFF unless the creator opts in
  add column downloads_enabled boolean not null default false,
  add column download_coin_price int check (download_coin_price between 1 and 100000),
  add constraint series_download_price_required
    check (not downloads_enabled or download_coin_price is not null);

-- ============================================================
-- Episode unlocks (coins or rewarded ad)
-- ============================================================

create table public.episode_unlocks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.episodes (id) on delete cascade,
  method public.episode_unlock_method not null,
  coins_spent int not null default 0 check (coins_spent >= 0),
  ad_impression_id uuid,
  ledger_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now(),
  unique (profile_id, episode_id)
);

-- Resolves an episode to its series, creator and absolute position in the series
create or replace function public.episode_context(p_episode_id uuid)
returns table (series_id uuid, creator_id uuid, episode_position int, series_status public.content_status, episode_status public.content_status)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select e.id, se.series_id
    from public.episodes e
    join public.seasons se on se.id = e.season_id
    where e.id = p_episode_id
  ),
  ordered as (
    select e.id,
           row_number() over (order by se.season_number, e.episode_number)::int as episode_position
    from public.episodes e
    join public.seasons se on se.id = e.season_id
    where se.series_id = (select series_id from target)
  )
  select s.id, p.creator_id, o.episode_position, s.status, e.status
  from target t
  join public.series s on s.id = t.series_id
  join public.productions p on p.id = s.production_id
  join public.episodes e on e.id = t.id
  join ordered o on o.id = t.id;
$$;

-- Can the current user watch this episode? (free window, unlock, or owner/moderator)
create or replace function public.can_watch_episode(p_episode_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_free int;
begin
  select * into v_ctx from public.episode_context(p_episode_id);
  if v_ctx.series_id is null then
    return false;
  end if;

  if auth.uid() is not null and (
       public.has_role('admin') or public.has_role('moderator')
       or exists (select 1 from public.creator_profiles where id = v_ctx.creator_id and profile_id = auth.uid())
     ) then
    return true;
  end if;

  if v_ctx.series_status <> 'published' or v_ctx.episode_status <> 'published' then
    return false;
  end if;

  select free_episode_count into v_free from public.series where id = v_ctx.series_id;
  if v_ctx.episode_position <= v_free then
    return true;
  end if;

  return auth.uid() is not null and exists (
    select 1 from public.episode_unlocks where profile_id = auth.uid() and episode_id = p_episode_id
  );
end;
$$;

-- Viewer spends coins to unlock a locked episode.
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
  v_value := v_price::bigint * v_policy.coin_value_minor;
  v_creator_cut := v_value * v_policy.coin_unlock_creator_share_bps / 10000;

  insert into public.episode_unlocks (profile_id, episode_id, method, coins_spent)
  values (v_uid, p_episode_id, 'coins', v_price)
  returning id into v_unlock_id;

  -- Fails with a check violation if the viewer does not have enough coins.
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
    v_policy.id, v_uid, 'episode_unlocks', v_unlock_id
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

-- ============================================================
-- Ads: impressions reported server-side (ad network SSV / reporting API)
-- ============================================================

create table public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  placement text not null check (placement in ('pre_roll', 'interstitial', 'rewarded', 'native')),
  profile_id uuid references public.profiles (id) on delete set null,
  episode_id uuid references public.episodes (id) on delete set null,
  creator_id uuid references public.creator_profiles (id),
  -- revenue attributed to this impression, in TRY micros; null until reported
  revenue_micros bigint check (revenue_micros >= 0),
  occurred_at timestamptz not null default now(),
  settlement_id uuid,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index idx_ad_impressions_unsettled on public.ad_impressions (creator_id, occurred_at)
  where settlement_id is null;

alter table public.episode_unlocks
  add constraint episode_unlocks_ad_impression_fk
  foreign key (ad_impression_id) references public.ad_impressions (id);

-- Service role: record an ad impression; rewarded impressions can unlock the episode.
create or replace function public.record_ad_impression(
  p_provider text,
  p_provider_event_id text,
  p_placement text,
  p_profile_id uuid,
  p_episode_id uuid,
  p_revenue_micros bigint default null,
  p_unlock_episode boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_creator uuid;
begin
  if p_episode_id is not null then
    select creator_id into v_creator from public.episode_context(p_episode_id);
  end if;

  insert into public.ad_impressions
    (provider, provider_event_id, placement, profile_id, episode_id, creator_id, revenue_micros)
  values
    (p_provider, p_provider_event_id, p_placement, p_profile_id, p_episode_id, v_creator, p_revenue_micros)
  on conflict (provider, provider_event_id) do update
    set revenue_micros = coalesce(excluded.revenue_micros, public.ad_impressions.revenue_micros)
    where public.ad_impressions.settlement_id is null
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.ad_impressions where provider = p_provider and provider_event_id = p_provider_event_id;
  end if;

  if p_unlock_episode and p_placement = 'rewarded' and p_profile_id is not null and p_episode_id is not null then
    insert into public.episode_unlocks (profile_id, episode_id, method, ad_impression_id)
    values (p_profile_id, p_episode_id, 'rewarded_ad', v_id)
    on conflict (profile_id, episode_id) do nothing;
  end if;

  return v_id;
end;
$$;

create table public.ad_revenue_settlements (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  impressions int not null,
  gross_minor bigint not null,
  creator_minor bigint not null,
  platform_minor bigint not null,
  policy_id uuid not null references public.revenue_policies (id),
  ledger_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now()
);

create index idx_ad_revenue_settlements_creator on public.ad_revenue_settlements (creator_id, period_end desc);

alter table public.ad_impressions
  add constraint ad_impressions_settlement_fk
  foreign key (settlement_id) references public.ad_revenue_settlements (id);

-- Admin / scheduled job: split reported ad revenue per creator for a period.
create or replace function public.settle_ad_revenue(p_period_start timestamptz, p_period_end timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.revenue_policies;
  v_row record;
  v_gross bigint;
  v_creator_cut bigint;
  v_settlement uuid;
  v_txn uuid;
  v_count int := 0;
begin
  if auth.uid() is not null and not public.has_role('admin') then
    raise exception 'forbidden';
  end if;

  v_policy := public.current_revenue_policy();

  for v_row in
    select creator_id, count(*)::int as impressions, sum(revenue_micros) as micros
    from public.ad_impressions
    where settlement_id is null
      and creator_id is not null
      and revenue_micros is not null
      and occurred_at >= p_period_start and occurred_at < p_period_end
    group by creator_id
  loop
    v_gross := v_row.micros / 10000; -- micros → kuruş (remainder stays with platform rounding)
    v_creator_cut := v_gross * v_policy.ad_creator_share_bps / 10000;

    insert into public.ad_revenue_settlements
      (creator_id, period_start, period_end, impressions, gross_minor, creator_minor, platform_minor, policy_id)
    values
      (v_row.creator_id, p_period_start, p_period_end, v_row.impressions, v_gross, v_creator_cut, v_gross - v_creator_cut, v_policy.id)
    returning id into v_settlement;

    if v_gross > 0 then
      v_txn := public.post_ledger_transaction(
        'ad_revenue_settlement',
        'ad_settlement:' || v_settlement,
        jsonb_build_array(
          jsonb_build_object('account_id', public.system_account('ad_network', 'TRY'), 'currency', 'TRY', 'amount', -v_gross),
          jsonb_build_object('account_id', public.creator_earnings_account(v_row.creator_id), 'currency', 'TRY', 'amount', v_creator_cut),
          jsonb_build_object('account_id', public.system_account('platform_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_gross - v_creator_cut)
        ),
        v_policy.id, auth.uid(), 'ad_revenue_settlements', v_settlement
      );
      update public.ad_revenue_settlements set ledger_transaction_id = v_txn where id = v_settlement;
    end if;

    update public.ad_impressions
       set settlement_id = v_settlement
     where settlement_id is null
       and creator_id = v_row.creator_id
       and revenue_micros is not null
       and occurred_at >= p_period_start and occurred_at < p_period_end;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ============================================================
-- Downloads (only when the creator enabled them)
-- ============================================================

create table public.download_purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  series_id uuid not null references public.series (id) on delete cascade,
  coins_spent int not null check (coins_spent > 0),
  ledger_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now(),
  unique (profile_id, series_id)
);

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
  v_value := v_series.download_coin_price::bigint * v_policy.coin_value_minor;
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
    v_policy.id, v_uid, 'download_purchases', v_purchase_id
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

-- Checked when issuing a download URL: creator can switch downloads off at any time.
create or replace function public.can_download_episode(p_episode_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.episode_context(p_episode_id) c
    join public.series s on s.id = c.series_id
    join public.download_purchases dp on dp.series_id = s.id and dp.profile_id = auth.uid()
    where s.downloads_enabled
      and s.status = 'published'
      and c.episode_status = 'published'
  );
$$;

-- ============================================================
-- Storage plans (creator pays for video storage)
-- ============================================================
-- Quota is measured in stored video minutes, matching how the video
-- provider (Cloudflare Stream) bills storage.

create table public.storage_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  quota_minutes int not null check (quota_minutes >= 0),
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'TRY',
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Launch storage catalog (prices are product configuration; change via data, not code)
insert into public.storage_plans (code, name, quota_minutes, price_minor) values
  ('free',   'Başlangıç', 30,    0),
  ('pro',    'Pro',       600,   49900),
  ('studio', 'Studio',    3000,  199900);

create table public.creator_storage_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  plan_id uuid not null references public.storage_plans (id),
  status public.storage_subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null,
  provider text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_storage_sub_active on public.creator_storage_subscriptions (creator_id)
  where status in ('active', 'past_due');

create trigger trg_creator_storage_subscriptions_updated_at before update on public.creator_storage_subscriptions
  for each row execute function public.set_updated_at();

create table public.storage_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.creator_storage_subscriptions (id),
  creator_id uuid not null references public.creator_profiles (id),
  amount_minor bigint not null check (amount_minor >= 0),
  provider text not null,
  provider_payment_id text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  ledger_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

-- Service role: called from the payment provider webhook after a successful charge.
create or replace function public.record_storage_payment(
  p_creator_id uuid,
  p_plan_code text,
  p_provider text,
  p_provider_payment_id text,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.storage_plans;
  v_sub uuid;
  v_payment uuid;
  v_txn uuid;
begin
  select * into v_plan from public.storage_plans where code = p_plan_code;
  if v_plan.id is null then
    raise exception 'unknown_storage_plan';
  end if;

  select id into v_payment from public.storage_payments
  where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if v_payment is not null then
    return v_payment;
  end if;

  select id into v_sub from public.creator_storage_subscriptions
  where creator_id = p_creator_id and status in ('active', 'past_due');

  if v_sub is null then
    insert into public.creator_storage_subscriptions (creator_id, plan_id, current_period_start, current_period_end, provider)
    values (p_creator_id, v_plan.id, p_period_start, p_period_end, p_provider)
    returning id into v_sub;
  else
    update public.creator_storage_subscriptions
       set plan_id = v_plan.id, status = 'active',
           current_period_start = p_period_start, current_period_end = p_period_end
     where id = v_sub;
  end if;

  insert into public.storage_payments
    (subscription_id, creator_id, amount_minor, provider, provider_payment_id, period_start, period_end)
  values
    (v_sub, p_creator_id, v_plan.price_minor, p_provider, p_provider_payment_id, p_period_start, p_period_end)
  returning id into v_payment;

  if v_plan.price_minor > 0 then
    v_txn := public.post_ledger_transaction(
      'storage_purchase',
      'storage_payment:' || p_provider || ':' || p_provider_payment_id,
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('external_payments', 'TRY'), 'currency', 'TRY', 'amount', -v_plan.price_minor),
        jsonb_build_object('account_id', public.system_account('platform_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_plan.price_minor)
      ),
      null, null, 'storage_payments', v_payment
    );
    update public.storage_payments set ledger_transaction_id = v_txn where id = v_payment;
  end if;

  return v_payment;
end;
$$;

-- Effective quota: active paid plan, otherwise the free plan.
create or replace function public.creator_storage_quota_minutes(p_creator_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select sp.quota_minutes
       from public.creator_storage_subscriptions s
       join public.storage_plans sp on sp.id = s.plan_id
      where s.creator_id = p_creator_id
        and s.status in ('active', 'past_due')
        and s.current_period_end > now()),
    (select quota_minutes from public.storage_plans where code = 'free'),
    0
  );
$$;

-- Reserved = declared max duration at upload time; replaced by real duration once ready.
alter table public.video_assets
  add column reserved_seconds int check (reserved_seconds > 0);

create or replace function public.creator_storage_used_seconds(p_creator_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coalesce(va.duration_seconds, va.reserved_seconds, 0)), 0)
  from public.video_assets va
  join public.episodes e on e.id = va.episode_id
  join public.seasons se on se.id = e.season_id
  join public.series s on s.id = se.series_id
  join public.productions p on p.id = s.production_id
  where p.creator_id = p_creator_id
    and va.status <> 'deleted';
$$;

-- Blocks new uploads that would exceed the creator's storage quota.
create or replace function public.enforce_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if new.status = 'deleted' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.duration_seconds is null and new.reserved_seconds is null then
    raise exception 'reserved_seconds_required';
  end if;

  -- Durations come from the video provider webhook (service role), never from the client.
  if tg_op = 'UPDATE' and auth.role() = 'authenticated' and (
       new.duration_seconds is distinct from old.duration_seconds
       or coalesce(new.reserved_seconds, 0) < coalesce(old.reserved_seconds, 0)
     ) then
    raise exception 'storage_fields_read_only';
  end if;

  if tg_op = 'UPDATE'
     and coalesce(new.duration_seconds, new.reserved_seconds, 0) <= coalesce(old.duration_seconds, old.reserved_seconds, 0)
     and old.status <> 'deleted' then
    return new;
  end if;

  select creator_id into v_creator from public.episode_context(new.episode_id);

  if public.creator_storage_used_seconds(v_creator)
     - (case when tg_op = 'UPDATE' and old.status <> 'deleted'
             then coalesce(old.duration_seconds, old.reserved_seconds, 0) else 0 end)
     + coalesce(new.duration_seconds, new.reserved_seconds, 0)
     > public.creator_storage_quota_minutes(v_creator)::bigint * 60 then
    raise exception 'storage_quota_exceeded';
  end if;
  return new;
end;
$$;

-- Studio: current creator's storage usage vs quota
create or replace function public.my_storage_summary()
returns table (quota_minutes int, used_seconds bigint)
language sql
stable
security definer
set search_path = public
as $$
  select public.creator_storage_quota_minutes(c.id), public.creator_storage_used_seconds(c.id)
  from public.creator_profiles c
  where c.profile_id = auth.uid();
$$;

create trigger trg_video_assets_storage_quota before insert or update on public.video_assets
  for each row execute function public.enforce_storage_quota();

-- ============================================================
-- Payouts (creator earnings → bank)
-- ============================================================

create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id),
  amount_minor bigint not null check (amount_minor > 0),
  status public.payout_status not null default 'requested',
  provider_reference text,
  admin_note text,
  request_transaction_id uuid references public.ledger_transactions (id),
  settle_transaction_id uuid references public.ledger_transactions (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_payout_requests_creator on public.payout_requests (creator_id, created_at desc);

create trigger trg_payout_requests_updated_at before update on public.payout_requests
  for each row execute function public.set_updated_at();

create or replace function public.request_payout(p_amount_minor bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_policy public.revenue_policies;
  v_payout uuid;
  v_txn uuid;
begin
  select id into v_creator from public.creator_profiles where profile_id = auth.uid();
  if v_creator is null then
    raise exception 'not_a_creator';
  end if;

  v_policy := public.current_revenue_policy();
  if p_amount_minor < v_policy.min_payout_minor then
    raise exception 'below_min_payout';
  end if;

  if exists (select 1 from public.payout_requests where creator_id = v_creator and status in ('requested', 'processing')) then
    raise exception 'payout_already_pending';
  end if;

  insert into public.payout_requests (creator_id, amount_minor)
  values (v_creator, p_amount_minor)
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

-- Admin: mark a payout as paid (money left the platform) or reject it (refund earnings).
create or replace function public.resolve_payout(p_payout_id uuid, p_paid boolean, p_reference text default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.payout_requests;
  v_txn uuid;
begin
  if auth.uid() is not null and not public.has_role('admin') then
    raise exception 'forbidden';
  end if;

  select * into v_p from public.payout_requests where id = p_payout_id for update;
  if v_p.id is null or v_p.status not in ('requested', 'processing') then
    raise exception 'payout_not_open';
  end if;

  if p_paid then
    v_txn := public.post_ledger_transaction(
      'payout_paid', 'payout_paid:' || v_p.id,
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('payouts_payable', 'TRY'), 'currency', 'TRY', 'amount', -v_p.amount_minor),
        jsonb_build_object('account_id', public.system_account('external_payments', 'TRY'), 'currency', 'TRY', 'amount', v_p.amount_minor)
      ),
      null, auth.uid(), 'payout_requests', v_p.id
    );
  else
    v_txn := public.post_ledger_transaction(
      'payout_rejected', 'payout_rejected:' || v_p.id,
      jsonb_build_array(
        jsonb_build_object('account_id', public.system_account('payouts_payable', 'TRY'), 'currency', 'TRY', 'amount', -v_p.amount_minor),
        jsonb_build_object('account_id', public.creator_earnings_account(v_p.creator_id), 'currency', 'TRY', 'amount', v_p.amount_minor)
      ),
      null, auth.uid(), 'payout_requests', v_p.id
    );
  end if;

  update public.payout_requests
     set status = case when p_paid then 'paid'::public.payout_status else 'rejected'::public.payout_status end,
         provider_reference = coalesce(p_reference, provider_reference),
         admin_note = coalesce(p_note, admin_note),
         settle_transaction_id = v_txn
   where id = v_p.id;
end;
$$;

-- ============================================================
-- Row Level Security — reads only; all writes go through functions
-- ============================================================

alter table public.revenue_policies enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.coin_packages enable row level security;
alter table public.coin_purchases enable row level security;
alter table public.episode_unlocks enable row level security;
alter table public.ad_impressions enable row level security;
alter table public.ad_revenue_settlements enable row level security;
alter table public.download_purchases enable row level security;
alter table public.storage_plans enable row level security;
alter table public.creator_storage_subscriptions enable row level security;
alter table public.storage_payments enable row level security;
alter table public.payout_requests enable row level security;

create or replace function public.my_creator_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.creator_profiles where profile_id = auth.uid();
$$;

create policy "revenue_policies_read" on public.revenue_policies
  for select using (true);

create policy "wallet_accounts_owner_read" on public.wallet_accounts
  for select using (
    profile_id = auth.uid()
    or creator_id = public.my_creator_id()
    or public.has_role('admin')
  );

create policy "ledger_entries_owner_read" on public.ledger_entries
  for select using (
    exists (
      select 1 from public.wallet_accounts wa
      where wa.id = account_id
        and (wa.profile_id = auth.uid() or wa.creator_id = public.my_creator_id())
    )
    or public.has_role('admin')
  );

create policy "ledger_transactions_owner_read" on public.ledger_transactions
  for select using (
    exists (
      select 1 from public.ledger_entries le
      join public.wallet_accounts wa on wa.id = le.account_id
      where le.transaction_id = ledger_transactions.id
        and (wa.profile_id = auth.uid() or wa.creator_id = public.my_creator_id())
    )
    or public.has_role('admin')
  );

create policy "coin_packages_read" on public.coin_packages
  for select using (active or public.has_role('admin'));

create policy "coin_purchases_owner_read" on public.coin_purchases
  for select using (profile_id = auth.uid() or public.has_role('admin'));

create policy "episode_unlocks_owner_read" on public.episode_unlocks
  for select using (profile_id = auth.uid() or public.has_role('admin'));

create policy "ad_impressions_admin_read" on public.ad_impressions
  for select using (public.has_role('admin'));

create policy "ad_revenue_settlements_creator_read" on public.ad_revenue_settlements
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

create policy "download_purchases_owner_read" on public.download_purchases
  for select using (profile_id = auth.uid() or public.has_role('admin'));

create policy "storage_plans_read" on public.storage_plans
  for select using (active or public.has_role('admin'));

create policy "storage_subscriptions_creator_read" on public.creator_storage_subscriptions
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

create policy "storage_payments_creator_read" on public.storage_payments
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

create policy "payout_requests_creator_read" on public.payout_requests
  for select using (creator_id = public.my_creator_id() or public.has_role('admin'));

-- ============================================================
-- Function grants
-- ============================================================

do $$
declare
  f text;
begin
  -- internal / service-role-only
  foreach f in array array[
    'public.post_ledger_transaction(public.ledger_txn_type, text, jsonb, uuid, uuid, text, uuid, jsonb)',
    'public.system_account(text, text)',
    'public.viewer_coin_account(uuid)',
    'public.creator_earnings_account(uuid)',
    'public.credit_coin_purchase(uuid, uuid, text, text)',
    'public.record_ad_impression(text, text, text, uuid, uuid, bigint, boolean)',
    'public.record_storage_payment(uuid, text, text, text, timestamptz, timestamptz)',
    'public.episode_context(uuid)',
    'public.creator_storage_quota_minutes(uuid)',
    'public.creator_storage_used_seconds(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;

  -- signed-in users (functions check auth.uid() / roles themselves)
  foreach f in array array[
    'public.unlock_episode_with_coins(uuid)',
    'public.purchase_series_download(uuid)',
    'public.can_download_episode(uuid)',
    'public.request_payout(bigint)',
    'public.resolve_payout(uuid, boolean, text, text)',
    'public.settle_ad_revenue(timestamptz, timestamptz)',
    'public.my_storage_summary()'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- can_watch_episode is callable by anonymous viewers too (free episodes)
grant execute on function public.can_watch_episode(uuid) to anon, authenticated;
