-- Monetization foundation: wallets, ledgers, revenue policies, storage plans, payouts
-- Creator income = ad revenue share + optional download sales share. Viewers never earn.
-- Platform income = storage plan sales + ad commission + download commission.
--
-- NOTE: This migration was applied to the remote project before being committed.
-- It is kept here so local history matches the database. It is superseded by
-- 20261011060000_monetization_wallets.sql, which drops these objects.

-- ============================================================
-- Enums
-- ============================================================

create type public.coin_tx_kind as enum (
  'purchase', 'episode_unlock', 'download_purchase', 'refund', 'admin_adjust'
);

create type public.revenue_event_type as enum ('ad_view', 'download_sale');

create type public.payout_status as enum (
  'pending', 'approved', 'paid', 'failed', 'cancelled'
);

-- ============================================================
-- Versioned revenue policy (no hard-coded percentages in app code)
-- ============================================================

create table public.revenue_policies (
  id uuid primary key default gen_random_uuid(),
  ad_creator_share_pct numeric(5,2) not null check (ad_creator_share_pct between 0 and 100),
  download_creator_share_pct numeric(5,2) not null check (download_creator_share_pct between 0 and 100),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Initial policy (TBD: final rates); creator 70 / platform 30 for both streams
insert into public.revenue_policies (ad_creator_share_pct, download_creator_share_pct)
values (70.00, 70.00);

-- ============================================================
-- Storage plans (platform's primary direct revenue)
-- ============================================================

create table public.storage_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  storage_gb int not null check (storage_gb > 0),
  price_cents int, -- null = TBD; managed as product configuration
  currency text not null default 'TRY',
  active boolean not null default true,
  sort_order int not null default 0
);

insert into public.storage_plans (code, name, storage_gb, price_cents, sort_order) values
  ('free', 'Free', 2, 0, 0),
  ('creator_pro', 'Creator Pro', 50, null, 1),
  ('studio', 'Studio', 250, null, 2);

create table public.creator_subscriptions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  plan_id uuid not null references public.storage_plans (id),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_creator_subscriptions_creator on public.creator_subscriptions (creator_id);

-- ============================================================
-- Creator earnings wallet (withdrawable, in cents)
-- ============================================================

create table public.creator_balances (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  total_earned_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Viewer coin wallet (spend-only currency, never withdrawable)
-- ============================================================

create table public.coin_wallets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  balance_coins bigint not null default 0 check (balance_coins >= 0),
  updated_at timestamptz not null default now()
);

-- Append-only coin ledger
create table public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount_coins bigint not null, -- positive = credit, negative = spend
  kind public.coin_tx_kind not null,
  episode_id uuid references public.episodes (id) on delete set null,
  reference text, -- payment provider ref / idempotency key
  created_at timestamptz not null default now()
);

create unique index idx_coin_tx_reference on public.coin_transactions (reference)
  where reference is not null;
create index idx_coin_tx_profile on public.coin_transactions (profile_id, created_at desc);

-- ============================================================
-- Revenue ledger (append-only, idempotent, auditable)
-- ============================================================

create table public.revenue_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique, -- idempotency: ad provider event id / download tx id
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  type public.revenue_event_type not null,
  gross_cents bigint not null check (gross_cents >= 0),
  platform_fee_cents bigint not null check (platform_fee_cents >= 0),
  net_cents bigint not null check (net_cents >= 0),
  policy_id uuid not null references public.revenue_policies (id),
  created_at timestamptz not null default now(),
  constraint revenue_split_consistent check (gross_cents = platform_fee_cents + net_cents)
);

create index idx_revenue_events_creator on public.revenue_events (creator_id, created_at desc);
create index idx_revenue_events_episode on public.revenue_events (episode_id);

-- ============================================================
-- Payouts
-- ============================================================

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  status public.payout_status not null default 'pending',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  note text
);

create index idx_payouts_creator on public.payouts (creator_id, requested_at desc);

-- ============================================================
-- Download permission (creator-controlled, default OFF)
-- ============================================================

alter table public.series
  add column downloads_enabled boolean not null default false,
  add column download_price_coins int check (download_price_coins is null or download_price_coins > 0);

-- ============================================================
-- Ledger triggers: balances are derived from append-only events
-- ============================================================

create or replace function public.apply_revenue_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.creator_balances (creator_id, balance_cents, total_earned_cents)
  values (new.creator_id, new.net_cents, new.net_cents)
  on conflict (creator_id) do update set
    balance_cents = public.creator_balances.balance_cents + new.net_cents,
    total_earned_cents = public.creator_balances.total_earned_cents + new.net_cents,
    updated_at = now();
  return new;
end;
$$;

create trigger trg_revenue_event_apply
  after insert on public.revenue_events
  for each row execute function public.apply_revenue_event();

create or replace function public.apply_coin_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coin_wallets (profile_id, balance_coins)
  values (new.profile_id, new.amount_coins)
  on conflict (profile_id) do update set
    balance_coins = public.coin_wallets.balance_coins + new.amount_coins,
    updated_at = now();
  return new;
end;
$$;

create trigger trg_coin_tx_apply
  after insert on public.coin_transactions
  for each row execute function public.apply_coin_transaction();

-- updated_at triggers
create trigger trg_creator_subscriptions_updated_at before update on public.creator_subscriptions
  for each row execute function public.set_updated_at();

-- ============================================================
-- Client-callable RPCs (security definer; service role handles the rest)
-- ============================================================

-- Viewer spends coins (episode unlock / download purchase). Atomic, balance-checked.
create or replace function public.spend_coins(
  p_amount bigint,
  p_kind public.coin_tx_kind,
  p_episode_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_tx_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_kind not in ('episode_unlock', 'download_purchase') then
    raise exception 'invalid_kind';
  end if;

  insert into public.coin_wallets (profile_id) values (v_uid)
  on conflict (profile_id) do nothing;

  select balance_coins into v_balance
  from public.coin_wallets where profile_id = v_uid for update;

  if v_balance < p_amount then raise exception 'insufficient_coins'; end if;

  insert into public.coin_transactions (profile_id, amount_coins, kind, episode_id)
  values (v_uid, -p_amount, p_kind, p_episode_id)
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke all on function public.spend_coins(bigint, public.coin_tx_kind, uuid) from public;
grant execute on function public.spend_coins(bigint, public.coin_tx_kind, uuid) to authenticated;

-- Creator requests payout. Min threshold is policy (TBD); placeholder 50000 kuruş = 500 TRY.
create or replace function public.request_payout(p_amount_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_id uuid;
  v_balance bigint;
  v_payout_id uuid;
  v_min_payout constant bigint := 50000;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_creator_id from public.creator_profiles where profile_id = v_uid;
  if v_creator_id is null then raise exception 'not_a_creator'; end if;

  if p_amount_cents is null or p_amount_cents < v_min_payout then
    raise exception 'below_min_payout';
  end if;

  select balance_cents into v_balance
  from public.creator_balances where creator_id = v_creator_id for update;

  if v_balance is null or v_balance < p_amount_cents then
    raise exception 'insufficient_balance';
  end if;

  update public.creator_balances
  set balance_cents = balance_cents - p_amount_cents, updated_at = now()
  where creator_id = v_creator_id;

  insert into public.payouts (creator_id, amount_cents)
  values (v_creator_id, p_amount_cents)
  returning id into v_payout_id;

  return v_payout_id;
end;
$$;

revoke all on function public.request_payout(bigint) from public;
grant execute on function public.request_payout(bigint) to authenticated;

-- ============================================================
-- RLS: read-own everywhere; writes only via service role / RPCs
-- ============================================================

alter table public.revenue_policies enable row level security;
alter table public.storage_plans enable row level security;
alter table public.creator_subscriptions enable row level security;
alter table public.creator_balances enable row level security;
alter table public.coin_wallets enable row level security;
alter table public.coin_transactions enable row level security;
alter table public.revenue_events enable row level security;
alter table public.payouts enable row level security;

create policy "revenue_policies_public_read" on public.revenue_policies
  for select using (true);

create policy "storage_plans_public_read" on public.storage_plans
  for select using (true);

create policy "creator_subscriptions_own_read" on public.creator_subscriptions
  for select using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = creator_id and cp.profile_id = auth.uid()
    )
  );

create policy "creator_balances_own_read" on public.creator_balances
  for select using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = creator_id and cp.profile_id = auth.uid()
    )
  );

create policy "coin_wallets_own_read" on public.coin_wallets
  for select using (profile_id = auth.uid());

create policy "coin_transactions_own_read" on public.coin_transactions
  for select using (profile_id = auth.uid());

create policy "revenue_events_own_read" on public.revenue_events
  for select using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = creator_id and cp.profile_id = auth.uid()
    )
  );

create policy "payouts_own_read" on public.payouts
  for select using (
    exists (
      select 1 from public.creator_profiles cp
      where cp.id = creator_id and cp.profile_id = auth.uid()
    )
  );

create policy "payouts_admin_read" on public.payouts
  for select using (public.has_role('admin'));

create policy "payouts_admin_update" on public.payouts
  for update using (public.has_role('admin'));
