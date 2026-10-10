-- Scenario test for 20261011060000_monetization_wallets.sql.
-- Runs entirely inside one transaction and ends with RAISE 'ALL_TESTS_PASSED',
-- which rolls everything back. Any other error message is a failure.
-- Run against a database where the migration is applied (SQL editor / execute_sql).

do $t$
declare
  v_viewer uuid := gen_random_uuid();
  v_cuser uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_creator uuid; v_prod uuid; v_series uuid; v_season uuid;
  v_eps uuid[] := '{}'; v_e uuid; i int;
  v_pkg uuid; v_bal bigint; v_id uuid; v_n int;
  v_plat_before bigint; v_cnt int;
begin
  insert into auth.users (id, email) values (v_viewer, 'viewer_t@example.test'), (v_cuser, 'creator_t@example.test'), (v_admin, 'admin_t@example.test');
  insert into public.user_roles (profile_id, role) values (v_admin, 'admin');

  -- Creator with a published 4-episode series, first 2 free, 10 coins per locked episode
  perform set_config('request.jwt.claims', json_build_object('sub', v_cuser, 'role','authenticated')::text, true);
  v_creator := public.become_creator('Test Creator');
  insert into public.productions (creator_id, title) values (v_creator, 'P') returning id into v_prod;
  insert into public.series (production_id, title, status, free_episode_count, episode_coin_price)
    values (v_prod, 'S', 'published', 2, 10) returning id into v_series;
  insert into public.seasons (series_id, season_number) values (v_series, 1) returning id into v_season;
  for i in 1..4 loop
    insert into public.episodes (season_id, episode_number, title, status) values (v_season, i, 'E'||i, 'published') returning id into v_e;
    v_eps := v_eps || v_e;
  end loop;

  -- T1 free window / lock
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role','authenticated')::text, true);
  if not public.can_watch_episode(v_eps[2]) then raise exception 'T1a free ep2 should be watchable'; end if;
  if public.can_watch_episode(v_eps[3]) then raise exception 'T1b ep3 should be locked'; end if;

  -- T2 unlock without coins fails and leaves no unlock row
  begin
    perform public.unlock_episode_with_coins(v_eps[3]);
    raise exception 'T2 expected insufficient_coins';
  exception when others then
    if sqlerrm <> 'insufficient_coins' then raise exception 'T2 got %', sqlerrm; end if;
  end;
  if exists (select 1 from episode_unlocks where profile_id = v_viewer) then raise exception 'T2b unlock row leaked'; end if;

  -- T3 coin purchase is idempotent per store transaction
  insert into public.coin_packages (code, coins, bonus_coins, price_minor) values ('test_100', 100, 10, 4999) returning id into v_pkg;
  perform public.credit_coin_purchase(v_viewer, v_pkg, 'google_play', 'GPA.1');
  perform public.credit_coin_purchase(v_viewer, v_pkg, 'google_play', 'GPA.1');
  select balance into v_bal from wallet_accounts where profile_id = v_viewer;
  if v_bal <> 110 then raise exception 'T3 coin balance %', v_bal; end if;

  -- T4 coin unlock: 10 coins x 0.50 TRY = 500 kuruş, creator gets the ad share (60%) = 300
  v_plat_before := (select balance from wallet_accounts where system_code='platform_revenue');
  perform public.unlock_episode_with_coins(v_eps[3]);
  perform public.unlock_episode_with_coins(v_eps[3]);
  if (select balance from wallet_accounts where profile_id = v_viewer) <> 100 then raise exception 'T4 coins after unlock'; end if;
  if not public.can_watch_episode(v_eps[3]) then raise exception 'T4b unlocked ep3 not watchable'; end if;
  if (select balance from wallet_accounts where system_code='platform_revenue') - v_plat_before <> 200 then raise exception 'T4c platform revenue'; end if;
  if (select balance from wallet_accounts where creator_id = v_creator) <> 300 then raise exception 'T4d creator unlock share'; end if;

  -- T5 downloads are off by default
  begin
    perform public.purchase_series_download(v_series);
    raise exception 'T5 expected downloads_disabled';
  exception when others then
    if sqlerrm <> 'downloads_disabled' then raise exception 'T5 got %', sqlerrm; end if;
  end;

  -- T6 creator enables downloads: 40 coins = 2000 kuruş, creator 70% = 1400 (+300 from T4)
  update public.series set downloads_enabled = true, download_coin_price = 40 where id = v_series;
  perform public.purchase_series_download(v_series);
  if (select balance from wallet_accounts where profile_id = v_viewer) <> 60 then raise exception 'T6 coins'; end if;
  if (select balance from wallet_accounts where creator_id = v_creator) <> 1700 then raise exception 'T6b creator'; end if;
  if not public.can_download_episode(v_eps[1]) then raise exception 'T6c can download'; end if;
  update public.series set downloads_enabled = false where id = v_series;
  if public.can_download_episode(v_eps[1]) then raise exception 'T6d creator disabled downloads'; end if;

  -- T7 rewarded ad unlock + settlement: 10 TRY gross, creator 60% = 600
  perform public.record_ad_impression('admob', 'ev1', 'rewarded', v_viewer, v_eps[4], 2500000, true);
  perform public.record_ad_impression('admob', 'ev1', 'rewarded', v_viewer, v_eps[4], 2500000, true);
  perform public.record_ad_impression('admob', 'ev2', 'pre_roll', v_viewer, v_eps[1], 7500000, false);
  if not public.can_watch_episode(v_eps[4]) then raise exception 'T7 rewarded unlock'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  v_n := public.settle_ad_revenue(now() - interval '1 day', now() + interval '1 day');
  if (select balance from wallet_accounts where creator_id = v_creator) <> 2300 then raise exception 'T7b creator'; end if;
  if (select count(*) from ad_impressions where settlement_id is null) <> 0 then raise exception 'T7c unsettled'; end if;

  -- T8 payouts: policy minimum, balance check, admin-only resolve, reject refunds
  perform set_config('request.jwt.claims', json_build_object('sub', v_cuser, 'role','authenticated')::text, true);
  begin
    perform public.request_payout(2000);
    raise exception 'T8 expected below_min_payout';
  exception when others then
    if sqlerrm <> 'below_min_payout' then raise exception 'T8 got %', sqlerrm; end if;
  end;
  insert into revenue_policies (version, ad_creator_share_bps, download_creator_share_bps, coin_unlock_creator_share_bps, coin_value_minor, min_payout_minor)
    values (99, 6000, 7000, 6000, 50, 1000);
  begin
    perform public.request_payout(5000);
    raise exception 'T8b expected insufficient_balance';
  exception when others then
    if sqlerrm <> 'insufficient_balance' then raise exception 'T8b got %', sqlerrm; end if;
  end;
  v_id := public.request_payout(1500);
  if (select balance from wallet_accounts where creator_id = v_creator) <> 800 then raise exception 'T8c'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role','authenticated')::text, true);
  begin
    perform public.resolve_payout(v_id, true);
    raise exception 'T8d viewer resolved payout';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception 'T8d got %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  perform public.resolve_payout(v_id, false, null, 'iban eksik');
  if (select balance from wallet_accounts where creator_id = v_creator) <> 2300 then raise exception 'T8e reject refund'; end if;
  begin
    insert into revenue_policies (version, ad_creator_share_bps, download_creator_share_bps, coin_unlock_creator_share_bps, coin_value_minor, min_payout_minor)
      values (100, 6000, 7000, 0, 50, 1000);
    raise exception 'T8f unlock share diverged from ad share';
  exception when check_violation then null;
  end;

  -- T9 ledger integrity
  begin
    update ledger_entries set amount = amount where true;
    raise exception 'T9 update allowed';
  exception when others then
    if sqlerrm not like '%append-only%' then raise exception 'T9 got %', sqlerrm; end if;
  end;
  if exists (select 1 from ledger_entries group by transaction_id, currency having sum(amount) <> 0) then raise exception 'T9b unbalanced'; end if;
  if exists (select 1 from wallet_accounts wa where balance <> coalesce((select sum(amount) from ledger_entries where account_id = wa.id),0)) then raise exception 'T9c cached balance drift'; end if;
  begin
    perform public.post_ledger_transaction('adjustment', 'bad', jsonb_build_array(
      jsonb_build_object('account_id', public.system_account('platform_revenue','TRY'), 'currency','TRY','amount', 5)));
    raise exception 'T9d unbalanced txn accepted';
  exception when others then
    if sqlerrm <> 'ledger_transaction_unbalanced' then raise exception 'T9d got %', sqlerrm; end if;
  end;

  -- T10 storage quota: free plan 30 min, upgrade to pro (600 min) via payment
  insert into video_assets (episode_id, reserved_seconds) values (v_eps[1], 1500);
  begin
    insert into video_assets (episode_id, reserved_seconds) values (v_eps[2], 600);
    raise exception 'T10 quota not enforced';
  exception when others then
    if sqlerrm <> 'storage_quota_exceeded' then raise exception 'T10 got %', sqlerrm; end if;
  end;
  perform public.record_storage_payment(v_creator, 'pro', 'iyzico', 'pay_1', now(), now() + interval '30 days');
  insert into video_assets (episode_id, reserved_seconds) values (v_eps[2], 600);
  if public.creator_storage_quota_minutes(v_creator) <> 600 then raise exception 'T10b quota'; end if;
  begin
    insert into video_assets (episode_id) values (v_eps[3]);
    raise exception 'T10d upload without size accepted';
  exception when others then
    if sqlerrm <> 'reserved_seconds_required' then raise exception 'T10d got %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_cuser, 'role','authenticated')::text, true);
  begin
    update video_assets set duration_seconds = 1 where episode_id = v_eps[1];
    raise exception 'T10e creator shrank duration';
  exception when others then
    if sqlerrm <> 'storage_fields_read_only' then raise exception 'T10e got %', sqlerrm; end if;
  end;
  -- re-running a settled period is a no-op, not an error
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  if public.settle_ad_revenue(now() - interval '1 day', now() + interval '1 day') <> 0 then raise exception 'T10f resettle'; end if;
  if (select balance from wallet_accounts where system_code='platform_revenue') - v_plat_before <> 200 + 600 + 400 + 49900 then
    raise exception 'T10c platform revenue';
  end if;

  -- T11 RLS and grants as an authenticated viewer
  perform set_config('request.jwt.claims', json_build_object('sub', v_viewer, 'role','authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_cnt from wallet_accounts;
  if v_cnt <> 1 then raise exception 'T11 viewer sees % wallets', v_cnt; end if;
  select count(*) into v_cnt from ledger_transactions;
  if v_cnt <> 3 then raise exception 'T11b viewer sees % txns', v_cnt; end if;
  begin
    perform public.credit_coin_purchase(v_viewer, v_pkg, 'web', 'x');
    raise exception 'T11c viewer could mint coins';
  exception when insufficient_privilege then null;
  end;
  if not public.can_watch_episode(v_eps[3]) then raise exception 'T11d can_watch as authenticated'; end if;
  begin
    perform public.unlock_episode_with_coins(v_eps[2]);
    raise exception 'T11e free ep unlock should fail';
  exception when others then
    if sqlerrm <> 'episode_not_locked' then raise exception 'T11e got %', sqlerrm; end if;
  end;
  reset role;

  raise exception 'ALL_TESTS_PASSED';
end;
$t$;
