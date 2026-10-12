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
      "id, title, description, poster_url, free_episode_count, episode_coin_price, productions(age_rating, content_warnings, creator_profiles(id, creator_name))"
    )
    .eq("id", id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (!series) return json({ error: "not_found" }, 404);

  // Positions count published episodes only (as can_watch_episode does)
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
    .filter((e) => e.status === "published")
    .map((e, i) => ({ e, position: i + 1 }));

  const production = one(series.productions);
  const creator = one(production?.creator_profiles);
  const ids = published.map(({ e }) => e.id);

  // Public counts
  const [{ data: likeCounts }, { data: followers }] = await Promise.all([
    ids.length
      ? supabase.rpc("episode_like_counts", { p_episode_ids: ids })
      : Promise.resolve({ data: [] as { episode_id: string; likes: number }[] }),
    creator ? supabase.rpc("creator_follower_count", { p_creator_id: creator.id }) : Promise.resolve({ data: 0 }),
  ]);
  const likes = new Map(
    ((likeCounts ?? []) as { episode_id: string; likes: number }[]).map((l) => [l.episode_id, Number(l.likes)])
  );

  // The caller's own state (RLS returns only their rows)
  const unlocked = new Set<string>();
  const liked = new Set<string>();
  const progress = new Map<string, { position: number; completed: boolean }>();
  let inWatchlist = false;
  let following = false;
  if (userId) {
    const [{ data: unlocks }, { data: watched }, { data: myLikes }, { data: listed }, { data: follow }] =
      await Promise.all([
        supabase.from("episode_unlocks").select("episode_id").in("episode_id", ids),
        supabase.from("watch_progress").select("episode_id, position_seconds, completed").in("episode_id", ids),
        supabase.from("episode_likes").select("episode_id").in("episode_id", ids),
        supabase.from("watchlist").select("series_id").eq("series_id", id).maybeSingle(),
        creator
          ? supabase.from("creator_follows").select("creator_id").eq("creator_id", creator.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
    for (const u of unlocks ?? []) unlocked.add(u.episode_id);
    for (const w of watched ?? []) progress.set(w.episode_id, { position: w.position_seconds, completed: w.completed });
    for (const l of myLikes ?? []) liked.add(l.episode_id);
    inWatchlist = !!listed;
    following = !!follow;
  }

  const covers = series.poster_url ? null : await getSeriesCovers(admin, [series]);

  return json({
    id: series.id,
    title: series.title,
    description: series.description,
    creatorName: creator?.creator_name ?? null,
    creator: creator
      ? { id: creator.id, name: creator.creator_name, followers: Number(followers ?? 0), following }
      : null,
    inWatchlist,
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
        likes: likes.get(e.id) ?? 0,
        liked: liked.has(e.id),
      };
    }),
  });
}
