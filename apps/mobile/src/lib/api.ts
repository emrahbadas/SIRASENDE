import { config } from "./config";
import { supabase } from "./supabase";

export interface CatalogSeries {
  id: string;
  title: string;
  description: string | null;
  creatorName: string | null;
  ageRating: string | null;
  categories: { slug: string; name_tr: string }[];
  poster: string | null;
  preview: string | null;
  episodeCount: number;
  /** First published episode (Shorts feed) */
  firstEpisodeId: string | null;
  freeEpisodeCount: number;
  episodeCoinPrice: number;
  /** Playback starts, all time and over the last 7 days */
  views: number;
  views7d: number;
  /** When the first episode went on air */
  publishedAt: string;
}

export type EpisodeAccess = "free" | "unlocked" | "locked";

export interface SeriesEpisode {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  durationSeconds: number | null;
  access: EpisodeAccess;
  progress: { position: number; completed: boolean } | null;
  likes: number;
  liked: boolean;
}

export interface SeriesDetail {
  id: string;
  title: string;
  description: string | null;
  creatorName: string | null;
  creator: { id: string; name: string; followers: number; following: boolean } | null;
  inWatchlist: boolean;
  ageRating: string | null;
  contentWarnings: string[];
  poster: string | null;
  episodeCoinPrice: number;
  episodes: SeriesEpisode[];
}

export interface Playback {
  hlsUrl: string;
  durationSeconds: number | null;
  /** Source dimensions in pixels (null for videos processed before they were recorded). */
  width: number | null;
  height: number | null;
  resumeAt: number;
  expiresAt: string;
}

export interface Library {
  watchlist: { id: string; title: string; poster: string | null }[];
  history: {
    seriesId: string;
    seriesTitle: string;
    poster: string | null;
    episodeId: string;
    episodeNumber: number;
    episodeTitle: string;
    durationSeconds: number | null;
    position: number;
    completed: boolean;
    updatedAt: string;
  }[];
  following: { id: string; name: string }[];
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {}
  ) {
    super(code);
  }
}

async function get<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${config.apiUrl}/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "request_failed", res.status, body);
  return body as T;
}

export const api = {
  catalog: () => get<{ series: CatalogSeries[] }>("/catalog").then((r) => r.series),
  series: (id: string) => get<SeriesDetail>(`/series/${id}`),
  playback: (episodeId: string) => get<Playback>(`/episodes/${episodeId}/playback`),
  library: () => get<Library>("/me/library"),
};

const unlockMessages: Record<string, string> = {
  insufficient_coins: "Yeterli coinin yok",
  episode_not_locked: "Bu bölüm zaten açık",
  episode_not_available: "Bu bölüm şu an yayında değil",
  not_authenticated: "Bölüm açmak için giriş yapmalısın",
};

/** Spends coins to unlock an episode (server checks price and balance). */
export async function unlockWithCoins(episodeId: string) {
  const { error } = await supabase.rpc("unlock_episode_with_coins", { p_episode_id: episodeId });
  if (error) {
    const key = Object.keys(unlockMessages).find((k) => error.message.includes(k));
    throw new Error(key ? unlockMessages[key] : "Bölüm açılamadı");
  }
}

export interface Wallet {
  purchased: number;
  bonus: number;
  /** Bonus coins in the grant that expires next, and when */
  bonusExpiring: number;
  bonusExpiresAt: string | null;
  /** Episodes that may still be paid with bonus coins today */
  bonusUnlocksLeft: number;
}

/** Signed-in viewer's coins, purchased and bonus separately (expired bonus removed). */
export async function wallet(): Promise<Wallet | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const { data, error } = await supabase.rpc("my_wallet").single<{
    purchased: number;
    bonus: number;
    bonus_expiring: number;
    bonus_expires_at: string | null;
    bonus_unlocks_left: number;
  }>();
  if (error || !data) return { purchased: 0, bonus: 0, bonusExpiring: 0, bonusExpiresAt: null, bonusUnlocksLeft: 0 };
  return {
    purchased: data.purchased,
    bonus: data.bonus,
    bonusExpiring: data.bonus_expiring,
    bonusExpiresAt: data.bonus_expires_at,
    bonusUnlocksLeft: data.bonus_unlocks_left,
  };
}

export async function coinBalance(): Promise<number | null> {
  const w = await wallet();
  return w ? w.purchased + w.bonus : null;
}

export interface DailyReward {
  claimedToday: boolean;
  /** Last claimed day of the current streak (0 = no streak) */
  streakDay: number;
  /** Day that today's claim counts as (1..7) */
  todayDay: number;
  rewards: number[];
}

export async function dailyReward(): Promise<DailyReward | null> {
  const { data, error } = await supabase.rpc("my_daily_reward").single<{
    claimed_today: boolean | null;
    streak_day: number;
    today_day: number;
    rewards: number[];
  }>();
  if (error || !data) return null;
  return {
    claimedToday: !!data.claimed_today,
    streakDay: data.streak_day,
    todayDay: data.today_day,
    rewards: data.rewards ?? [],
  };
}

export async function claimDailyReward(): Promise<{ coins: number; day: number }> {
  const { data, error } = await supabase.rpc("claim_daily_reward").single<{ coins: number; streak_day: number }>();
  if (error || !data) throw new Error("Ödül alınamadı, birazdan tekrar dene");
  return { coins: data.coins, day: data.streak_day };
}

export interface AdUnlockStatus {
  unlocked: boolean;
  adsWatched: number;
  adsRequired: number;
  dailyLimit: number;
  dailyRemaining: number;
  resetsAt: string;
}

async function adUnlockCall(episodeId: string, method: "GET" | "POST"): Promise<AdUnlockStatus> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(unlockMessages.not_authenticated);
  const res = await fetch(`${config.apiUrl}/api/v1/episodes/${episodeId}/ad-unlock`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(unlockMessages[body.error] ?? "Bölüm açılamadı");
  return body as AdUnlockStatus;
}

/** Ad progress for a locked episode and the viewer's ad unlocks left today. */
export const adUnlockStatus = (episodeId: string) => adUnlockCall(episodeId, "GET");

/**
 * Reports an earned rewarded ad and waits until the server has counted it.
 * In production AdMob's signed callback does the counting and can arrive a
 * few seconds after the ad closes, so progress is polled.
 */
export async function reportRewardedAd(episodeId: string, before: AdUnlockStatus): Promise<AdUnlockStatus> {
  let s = await adUnlockCall(episodeId, "POST");
  for (let attempt = 0; attempt < 8; attempt++) {
    if (s.unlocked || s.adsWatched > before.adsWatched) return s;
    await new Promise((r) => setTimeout(r, 1500));
    s = await adUnlockCall(episodeId, "GET");
  }
  throw new Error("Reklam doğrulanamadı, birazdan tekrar dene");
}
