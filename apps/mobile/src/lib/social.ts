import { router } from "expo-router";
import { supabase } from "./supabase";

// Watchlist, likes and follows are plain row inserts/deletes; RLS limits them
// to the signed-in viewer's own rows. Signed-out viewers are sent to sign in.

async function requireUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id ?? null;
  if (!id) router.push("/login");
  return id;
}

async function toggle(table: string, key: string, value: string, on: boolean) {
  const profileId = await requireUserId();
  if (!profileId) return false;
  const { error } = on
    ? await supabase.from(table).upsert({ profile_id: profileId, [key]: value }, { ignoreDuplicates: true })
    : await supabase.from(table).delete().eq("profile_id", profileId).eq(key, value);
  if (error) throw new Error("İşlem tamamlanamadı, tekrar dene");
  return true;
}

/** Returns false when the viewer had to sign in first (nothing changed). */
export const setInWatchlist = (seriesId: string, on: boolean) => toggle("watchlist", "series_id", seriesId, on);
export const setLiked = (episodeId: string, on: boolean) => toggle("episode_likes", "episode_id", episodeId, on);
export const setFollowing = (creatorId: string, on: boolean) => toggle("creator_follows", "creator_id", creatorId, on);
export const setBlocked = (creatorId: string, on: boolean) => toggle("creator_blocks", "creator_id", creatorId, on);

export type ReportReason = "sexual" | "violence" | "hate" | "harassment" | "copyright" | "misleading" | "other";

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: "sexual", label: "Cinsel / müstehcen içerik" },
  { key: "violence", label: "Şiddet veya tehlikeli davranış" },
  { key: "hate", label: "Nefret söylemi" },
  { key: "harassment", label: "Taciz veya zorbalık" },
  { key: "copyright", label: "Telif hakkı ihlali" },
  { key: "misleading", label: "Yanıltıcı içerik veya dolandırıcılık" },
  { key: "other", label: "Diğer" },
];

/** Reports a series (or one episode) to moderation. Returns false if the viewer had to sign in. */
export async function reportContent(input: { seriesId: string; episodeId?: string; reason: ReportReason; note?: string }) {
  const profileId = await requireUserId();
  if (!profileId) return false;
  const { error } = await supabase.from("content_reports").insert({
    reporter_id: profileId,
    series_id: input.seriesId,
    episode_id: input.episodeId ?? null,
    reason: input.reason,
    note: input.note?.trim() || null,
  });
  // 23505: this viewer already has an open report for it — nothing more to do
  if (error && error.code !== "23505") throw new Error("Bildirim gönderilemedi, tekrar dene");
  return true;
}
