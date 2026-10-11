import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { callerUserId, json, one, preflight } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * A published series with its episodes in watch order. Each episode says
 * whether it is free, already unlocked by the caller, or locked — the
 * playback endpoint still enforces access on its own.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await callerUserId(request);

  const { data: series } = await supabase
    .from("series")
    .select(
      "id, title, description, poster_url, free_episode_count, episode_coin_price, productions(age_rating, content_warnings, creator_profiles(creator_name))"
    )
    .eq("id", id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (!series) return json({ error: "not_found" }, 404);

  // Positions count every episode (as can_watch_episode does), so read all of them
  const admin = createAdminClient();
  const { data: all } = await admin
    .from("episodes")
    .select("id, episode_number, title, status, duration_seconds, seasons!inner(series_id, season_number)")
    .eq("seasons.series_id", id);

  const ordered = (all ?? []).sort(
    (a, b) =>
      one(a.seasons)!.season_number - one(b.seasons)!.season_number || a.episode_number - b.episode_number
  );
  const published = ordered
    .map((e, i) => ({ e, position: i + 1 }))
    .filter(({ e }) => e.status === "published");

  const unlocked = new Set<string>();
  const progress = new Map<string, { position: number; completed: boolean }>();
  if (userId && published.length) {
    const ids = published.map(({ e }) => e.id);
    const [{ data: unlocks }, { data: watched }] = await Promise.all([
      supabase.from("episode_unlocks").select("episode_id").in("episode_id", ids),
      supabase.from("watch_progress").select("episode_id, position_seconds, completed").in("episode_id", ids),
    ]);
    for (const u of unlocks ?? []) unlocked.add(u.episode_id);
    for (const w of watched ?? []) progress.set(w.episode_id, { position: w.position_seconds, completed: w.completed });
  }

  const production = one(series.productions);
  const covers = series.poster_url ? null : await getSeriesCovers(admin, [series]);

  return json({
    id: series.id,
    title: series.title,
    description: series.description,
    creatorName: one(production?.creator_profiles)?.creator_name ?? null,
    ageRating: production?.age_rating ?? null,
    contentWarnings: production?.content_warnings ?? [],
    poster: series.poster_url ?? covers?.get(series.id)?.thumbnail ?? null,
    episodeCoinPrice: series.episode_coin_price,
    episodes: published.map(({ e, position }) => {
      const free = position <= series.free_episode_count;
      return {
        id: e.id,
        seasonNumber: one(e.seasons)!.season_number,
        episodeNumber: e.episode_number,
        title: e.title,
        durationSeconds: e.duration_seconds,
        access: free ? "free" : unlocked.has(e.id) ? "unlocked" : "locked",
        progress: progress.get(e.id) ?? null,
      };
    }),
  });
}
