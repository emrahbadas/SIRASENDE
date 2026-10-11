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
