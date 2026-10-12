-- Bonus coins and the daily login streak.
--
-- * Bonus coins are coin lots with no money behind them (value 0), a source
--   and an expiry (bonus_coin_ttl_days = 14). They sit in the same viewer
--   wallet; the app shows purchased and bonus amounts separately.
-- * Spending uses bonus lots first (soonest to expire), then purchased lots
--   oldest first. Bonus is usable for at most bonus_unlocks_per_day (2)
--   episodes per day (00:00 Turkey time); downloads never use bonus.
-- * An episode paid (partly) with bonus earns the creator a promotional
--   payment of bonus_unlock_creator_promo_minor (5 kuruş) per full episode,
--   pro rata, funded by the platform's marketing budget.
-- * Login streak: claim once per Turkey day; amounts by streak day from
--   daily_reward_coins (2,2,2,2,2,4,6); missing a day restarts at day 1.
-- * Expired bonus is removed lazily (when the viewer's wallet is read or
--   coins are spent), so no scheduled job is needed.

insert into public.platform_settings (key, value, description) values
  ('daily_reward_coins', '[2,2,2,2,2,4,6]', 'Bonus coins for login streak days 1..7 (then repeats)'),
  ('bonus_coin_ttl_days', '14', 'Days until a bonus coin grant expires'),
  ('bonus_unlocks_per_day', '2', 'Episodes per day that may be paid with bonus coins'),
  ('bonus_unlock_creator_promo_minor', '5', 'Promotional creator payment (kuruş) per episode fully paid with bonus')
on conflict (key) do nothing;

insert into public.wallet_accounts (owner_kind, system_code, currency, allow_negative) values
  ('system', 'marketing_expense', 'TRY', true)
on conflict do nothing;

alter table public.coin_lots
  add column is_bonus boolean not null default false,
  add column source text not null default 'purchase',
  add column expires_at timestamptz,
  add constraint coin_lots_bonus_shape check (
    (is_bonus and expires_at is not null and value_remaining_minor = 0)
    or (not is_bonus and expires_at is null)
  );

create index idx_coin_lots_bonus_open on public.coin_lots (profile_id, expires_at)
  where is_bonus and coins_remaining > 0;

alter table public.episode_unlocks
  add column bonus_coins_spent int not null default 0 check (bonus_coins_spent >= 0);

create table public.login_streaks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  streak_day int not null check (streak_day between 1 and 7),
  last_claim_date date not null,
  updated_at timestamptz not null default now()
);

alter table public.login_streaks enable row level security;
create policy "login_streaks_own_read" on public.login_streaks
  for select using (profile_id = (select auth.uid()));

create or replace function public.tr_today()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- Removes the viewer's expired bonus coins from their wallet.
create or replace function public.expire_bonus_coins(p_profile_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot record;
  v_total int := 0;
begin
  for v_lot in
    select id, coins_remaining from public.coin_lots
    where profile_id = p_profile_id and is_bonus and coins_remaining > 0 and expires_at <= now()
    for update
  loop
    update public.coin_lots set coins_remaining = 0 where id = v_lot.id;
    perform public.post_ledger_transaction(
      'bonus_expiry',
      'bonus_expiry:' || v_lot.id,
      jsonb_build_array(
        jsonb_build_object('account_id', public.viewer_coin_account(p_profile_id), 'currency', 'COIN', 'amount', -v_lot.coins_remaining),
        jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', v_lot.coins_remaining)
      ),
      null, null, 'coin_lots', v_lot.id
    );
    v_total := v_total + v_lot.coins_remaining;
  end loop;
  return v_total;
end;
$$;

-- Grants bonus coins as a new expiring lot (service role / internal).
create or replace function public.grant_bonus_coins(p_profile_id uuid, p_coins int, p_source text, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot uuid;
begin
  if p_coins <= 0 then
    return null;
  end if;
  if exists (select 1 from public.ledger_transactions where idempotency_key = p_idempotency_key) then
    return null;
  end if;

  insert into public.coin_lots (profile_id, coins_total, coins_remaining, value_remaining_minor, is_bonus, source, expires_at)
  values (p_profile_id, p_coins, p_coins, 0, true, p_source,
          now() + make_interval(days => coalesce(public.setting_int('bonus_coin_ttl_days'), 14)))
  returning id into v_lot;

  perform public.post_ledger_transaction(
    'bonus_grant',
    p_idempotency_key,
    jsonb_build_array(
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', -p_coins),
      jsonb_build_object('account_id', public.viewer_coin_account(p_profile_id), 'currency', 'COIN', 'amount', p_coins)
    ),
    null, p_profile_id, 'coin_lots', v_lot, jsonb_build_object('source', p_source)
  );
  return v_lot;
end;
$$;

-- Takes p_coins (bonus first when allowed, then purchased oldest first).
-- Returns the net value of the purchased coins used and how many bonus
-- coins were used. Raises insufficient_coins.
drop function if exists public.consume_coin_lots(uuid, int);

create or replace function public.consume_coins(p_profile_id uuid, p_coins int, p_allow_bonus boolean)
returns table (value_minor bigint, bonus_used int)
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
  v_bonus int := 0;
begin
  perform public.expire_bonus_coins(p_profile_id);

  if (select coalesce(sum(coins_remaining), 0) from public.coin_lots
      where profile_id = p_profile_id and coins_remaining > 0 and (p_allow_bonus or not is_bonus)) < p_coins then
    raise exception 'insufficient_coins';
  end if;

  for v_lot in
    select id, coins_remaining, value_remaining_minor, is_bonus from public.coin_lots
    where profile_id = p_profile_id and coins_remaining > 0 and (p_allow_bonus or not is_bonus)
    order by is_bonus desc, expires_at nulls last, created_at, id
    for update
  loop
    exit when v_need = 0;
    v_take := least(v_need, v_lot.coins_remaining);
    v_value := case when v_take = v_lot.coins_remaining then v_lot.value_remaining_minor
                    else v_lot.value_remaining_minor * v_take / v_lot.coins_remaining end;
    update public.coin_lots
       set coins_remaining = coins_remaining - v_take,
           value_remaining_minor = value_remaining_minor - v_value
     where id = v_lot.id;
    v_need := v_need - v_take;
    v_total := v_total + v_value;
    if v_lot.is_bonus then
      v_bonus := v_bonus + v_take;
    end if;
  end loop;

  return query select v_total, v_bonus;
end;
$$;

create or replace function public.bonus_unlocks_today(p_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.episode_unlocks
  where profile_id = p_profile_id and bonus_coins_spent > 0
    and created_at >= public.ad_day_start();
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
  v_spend record;
  v_allow_bonus boolean;
  v_delivery bigint;
  v_creator_cut bigint;
  v_promo bigint;
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

  v_allow_bonus := public.bonus_unlocks_today(v_uid) < coalesce(public.setting_int('bonus_unlocks_per_day'), 2);
  select * into v_spend from public.consume_coins(v_uid, v_price, v_allow_bonus);

  v_delivery := public.episode_delivery_cost_minor(p_episode_id);
  -- Share of the paid part, after the delivery cost the paid part covers
  v_creator_cut := greatest(v_spend.value_minor - v_delivery * (v_price - v_spend.bonus_used) / v_price, 0)
                   * v_policy.coin_unlock_creator_share_bps / 10000;
  -- Promotional payment for the bonus part (platform marketing budget)
  v_promo := coalesce(public.setting_int('bonus_unlock_creator_promo_minor'), 5) * v_spend.bonus_used / v_price;

  insert into public.episode_unlocks (profile_id, episode_id, method, coins_spent, bonus_coins_spent)
  values (v_uid, p_episode_id, 'coins', v_price, v_spend.bonus_used)
  returning id into v_unlock_id;

  v_txn := public.post_ledger_transaction(
    'episode_unlock_coins',
    'episode_unlock:' || v_unlock_id,
    jsonb_build_array(
      jsonb_build_object('account_id', public.viewer_coin_account(v_uid), 'currency', 'COIN', 'amount', -v_price),
      jsonb_build_object('account_id', public.system_account('coin_issuance', 'COIN'), 'currency', 'COIN', 'amount', v_price),
      jsonb_build_object('account_id', public.system_account('deferred_coin_revenue', 'TRY'), 'currency', 'TRY', 'amount', -v_spend.value_minor),
      jsonb_build_object('account_id', public.creator_earnings_account(v_ctx.creator_id), 'currency', 'TRY', 'amount', v_creator_cut + v_promo),
      jsonb_build_object('account_id', public.system_account('platform_revenue', 'TRY'), 'currency', 'TRY', 'amount', v_spend.value_minor - v_creator_cut),
      jsonb_build_object('account_id', public.system_account('marketing_expense', 'TRY'), 'currency', 'TRY', 'amount', -v_promo)
    ),
    v_policy.id, v_uid, 'episode_unlocks', v_unlock_id,
    jsonb_build_object('net_value_minor', v_spend.value_minor, 'bonus_coins', v_spend.bonus_used,
                       'delivery_cost_minor', v_delivery, 'promo_minor', v_promo)
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
  select value_minor into v_value from public.consume_coins(v_uid, v_series.download_coin_price, false);
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

-- Caller's wallet: purchased and bonus coins separately, next bonus expiry.
create or replace function public.my_wallet()
returns table (purchased int, bonus int, bonus_expiring int, bonus_expires_at timestamptz,
               bonus_unlocks_left int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  perform public.expire_bonus_coins(v_uid);

  select min(expires_at) into v_next from public.coin_lots
  where profile_id = v_uid and is_bonus and coins_remaining > 0;

  return query
  select
    coalesce(sum(coins_remaining) filter (where not is_bonus), 0)::int,
    coalesce(sum(coins_remaining) filter (where is_bonus), 0)::int,
    coalesce(sum(coins_remaining) filter (where is_bonus and expires_at = v_next), 0)::int,
    v_next,
    greatest(coalesce(public.setting_int('bonus_unlocks_per_day'), 2) - public.bonus_unlocks_today(v_uid), 0)
  from public.coin_lots
  where profile_id = v_uid and coins_remaining > 0;
end;
$$;

-- Caller's login streak and what today's claim would give.
create or replace function public.my_daily_reward()
returns table (claimed_today boolean, streak_day int, today_day int, rewards int[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.login_streaks;
  v_today date := public.tr_today();
  v_rewards int[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select array_agg(x::int order by o) into v_rewards
  from jsonb_array_elements_text((select value from public.platform_settings where key = 'daily_reward_coins'))
       with ordinality t(x, o);
  select * into v_row from public.login_streaks where profile_id = v_uid;

  return query select
    v_row.last_claim_date = v_today,
    case when v_row.last_claim_date >= v_today - 1 then v_row.streak_day else 0 end,
    case
      when v_row.last_claim_date = v_today then v_row.streak_day
      when v_row.last_claim_date = v_today - 1 then v_row.streak_day % 7 + 1
      else 1
    end,
    v_rewards;
end;
$$;

-- Claims today's login reward; returns coins granted (0 if already claimed).
create or replace function public.claim_daily_reward()
returns table (coins int, streak_day int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := public.tr_today();
  v_row public.login_streaks;
  v_day int;
  v_coins int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row from public.login_streaks where profile_id = v_uid for update;
  if v_row.last_claim_date = v_today then
    return query select 0, v_row.streak_day;
    return;
  end if;

  v_day := case when v_row.last_claim_date = v_today - 1 then v_row.streak_day % 7 + 1 else 1 end;
  v_coins := coalesce(((select value from public.platform_settings where key = 'daily_reward_coins') ->> (v_day - 1))::int, 0);

  insert into public.login_streaks (profile_id, streak_day, last_claim_date)
  values (v_uid, v_day, v_today)
  on conflict (profile_id) do update set streak_day = v_day, last_claim_date = v_today, updated_at = now();

  perform public.grant_bonus_coins(v_uid, v_coins, 'daily_login',
                                   'bonus_daily:' || v_uid || ':' || v_today);
  return query select v_coins, v_day;
end;
$$;

revoke all on function public.expire_bonus_coins(uuid) from public, anon, authenticated;
revoke all on function public.grant_bonus_coins(uuid, int, text, text) from public, anon, authenticated;
revoke all on function public.consume_coins(uuid, int, boolean) from public, anon, authenticated;
revoke all on function public.bonus_unlocks_today(uuid) from public, anon, authenticated;
grant execute on function public.expire_bonus_coins(uuid) to service_role;
grant execute on function public.grant_bonus_coins(uuid, int, text, text) to service_role;
grant execute on function public.consume_coins(uuid, int, boolean) to service_role;
grant execute on function public.bonus_unlocks_today(uuid) to service_role;

revoke all on function public.my_wallet() from public, anon;
revoke all on function public.my_daily_reward() from public, anon;
revoke all on function public.claim_daily_reward() from public, anon;
grant execute on function public.my_wallet() to authenticated, service_role;
grant execute on function public.my_daily_reward() to authenticated, service_role;
grant execute on function public.claim_daily_reward() to authenticated, service_role;
