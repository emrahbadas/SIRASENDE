-- Coin unlocks skip the ads the creator would have earned from, so the creator
-- gets the same share of a coin unlock as of ad revenue.
-- Enforced for every new policy version; v1 (0% on unlocks) stays as history.

alter table public.revenue_policies
  add constraint revenue_policies_coin_unlock_matches_ad
  check (coin_unlock_creator_share_bps = ad_creator_share_bps) not valid;

insert into public.revenue_policies
  (version, ad_creator_share_bps, download_creator_share_bps, coin_unlock_creator_share_bps, coin_value_minor, min_payout_minor, notes)
values
  (2, 6000, 7000, 6000, 50, 50000, 'Policy v2: coin unlocks pay the creator the ad share (60/40), since unlocking skips the ads. Downloads 70/30, 1 coin = 0.50 TRY, min payout 500 TRY');
