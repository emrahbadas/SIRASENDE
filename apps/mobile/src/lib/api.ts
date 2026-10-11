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
  freeEpisodeCount: number;
  episodeCoinPrice: number;
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

export async function coinBalance(): Promise<number | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return null;
  const { data } = await supabase
    .from("wallet_accounts")
    .select("balance")
    .eq("profile_id", userId)
    .eq("currency", "COIN")
    .maybeSingle();
  return data?.balance ?? 0;
}
