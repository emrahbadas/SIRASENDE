// Monetization model (see supabase/migrations/20261011060000_monetization_wallets.sql)
//   Viewer: watches ads or spends coins to unlock episodes / buy downloads. Never earns.
//   Creator: earns ad revenue share + download share (downloads only if enabled).
//   Platform: storage plans, ad commission, download commission, coin unlocks.
// All split ratios come from the versioned revenue_policies table.

/** TRY minor units (kuruş). */
export type MinorAmount = number;

export const WALLET_CURRENCIES = ["TRY", "COIN"] as const;
export type WalletCurrency = (typeof WALLET_CURRENCIES)[number];

export const WALLET_OWNER_KINDS = ["viewer", "creator", "system"] as const;
export type WalletOwnerKind = (typeof WALLET_OWNER_KINDS)[number];

export const LEDGER_TXN_TYPES = [
  "coin_purchase",
  "coin_refund",
  "episode_unlock_coins",
  "download_purchase",
  "ad_revenue_settlement",
  "storage_purchase",
  "payout_request",
  "payout_paid",
  "payout_rejected",
  "adjustment",
] as const;
export type LedgerTxnType = (typeof LEDGER_TXN_TYPES)[number];

export const EPISODE_UNLOCK_METHODS = ["coins", "rewarded_ad", "admin_grant"] as const;
export type EpisodeUnlockMethod = (typeof EPISODE_UNLOCK_METHODS)[number];

export const PAYOUT_STATUSES = ["requested", "processing", "paid", "rejected"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const AD_PLACEMENTS = ["pre_roll", "interstitial", "rewarded", "native"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export interface RevenuePolicy {
  id: string;
  version: number;
  effectiveFrom: string;
  /** Basis points (10000 = 100%) of net ad revenue going to the creator. */
  adCreatorShareBps: number;
  /** Basis points of a download sale going to the creator. */
  downloadCreatorShareBps: number;
  /** Basis points of a coin episode unlock going to the creator (0 by default). */
  coinUnlockCreatorShareBps: number;
  /** TRY value of one coin when spent, in kuruş. */
  coinValueMinor: MinorAmount;
  minPayoutMinor: MinorAmount;
}

export interface WalletAccount {
  id: string;
  ownerKind: WalletOwnerKind;
  currency: WalletCurrency;
  /** COIN count for viewer wallets, kuruş for creator wallets. */
  balance: number;
}

export interface LedgerEntry {
  id: number;
  transactionId: string;
  accountId: string;
  currency: WalletCurrency;
  /** Signed: positive increases the account balance. */
  amount: number;
  createdAt: string;
}

export interface CoinPackage {
  id: string;
  code: string;
  coins: number;
  bonusCoins: number;
  priceMinor: MinorAmount;
  googleProductId: string | null;
  appleProductId: string | null;
}

export interface SeriesMonetization {
  freeEpisodeCount: number;
  episodeCoinPrice: number;
  /** Creator-controlled; false means nobody can download the series. */
  downloadsEnabled: boolean;
  downloadCoinPrice: number | null;
}

export interface StoragePlan {
  id: string;
  code: string;
  name: string;
  /** Stored video minutes (matches the video provider's storage billing). */
  quotaMinutes: number;
  priceMinor: MinorAmount;
  billingPeriod: "monthly" | "yearly";
}

export interface StorageSummary {
  quotaMinutes: number;
  usedSeconds: number;
}

export interface PayoutRequest {
  id: string;
  creatorId: string;
  amountMinor: MinorAmount;
  status: PayoutStatus;
  adminNote: string | null;
  createdAt: string;
}

/** Errors raised by monetization RPCs (Postgres exception messages). */
export const MONETIZATION_ERRORS = [
  "not_authenticated",
  "insufficient_coins",
  "insufficient_balance",
  "episode_not_locked",
  "episode_not_available",
  "series_not_available",
  "downloads_disabled",
  "below_min_payout",
  "payout_already_pending",
  "not_a_creator",
  "storage_quota_exceeded",
  "forbidden",
] as const;
export type MonetizationError = (typeof MONETIZATION_ERRORS)[number];
