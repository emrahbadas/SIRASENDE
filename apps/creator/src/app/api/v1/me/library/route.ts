import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { callerUserId, json, one, preflight } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 30;

export function OPTIONS() {
  return preflight();
}

type SeriesRow = {
  id: string;
  title: string;
  poster_url: string | null;
  free_episode_count: number;
  status: string;
  deleted_at: string | null;
};

/** The signed-in viewer's watchlist, watch history and followed creators. */
export async function GET(request: Request) {
  const { supabase, userId } = await callerUserId(request);
  if (!userId) return json({ error: "not_authenticated" }, 401);

  const seriesCols = "id, title, poster_url, free_episode_count, status, deleted_at";
  const [{ data: listed }, { data: history }, { data: follows }] = await Promise.all([
    supabase
      .from("watchlist")
      .select(`created_at, series(${seriesCols})`)
      .order("created_at", { ascending: false }),
    supabase
      .from("watch_progress")
      .select(
        `episode_id, position_seconds, completed, updated_at, series(${seriesCols}), episodes(episode_number, title, duration_seconds, status)`
      )
      .order("updated_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("creator_follows")
      .select("created_at, creator_profiles(id, creator_name)")
      .order("created_at", { ascending: false }),
  ]);

  const visible = (s: SeriesRow | null): s is SeriesRow => !!s && s.status === "published" && !s.deleted_at;
  const watchlistSeries = (listed ?? []).map((w) => one(w.series as unknown as SeriesRow)).filter(visible);
  const historyRows = (history ?? []).filter(
    (h) => visible(one(h.series as unknown as SeriesRow)) && one(h.episodes)?.status === "published"
  );

  // Posters (or auto covers) for every series shown
  const allSeries = new Map<string, SeriesRow>();
  for (const s of watchlistSeries) allSeries.set(s.id, s);
  for (const h of historyRows) {
    const s = one(h.series as unknown as SeriesRow)!;
    allSeries.set(s.id, s);
  }
  const needCovers = [...allSeries.values()].filter((s) => !s.poster_url);
  const covers = needCovers.length ? await getSeriesCovers(createAdminClient(), needCovers) : new Map();
  const poster = (s: SeriesRow) => s.poster_url ?? covers.get(s.id)?.thumbnail ?? null;

  return json({
    watchlist: watchlistSeries.map((s) => ({ id: s.id, title: s.title, poster: poster(s) })),
    history: historyRows.map((h) => {
      const s = one(h.series as unknown as SeriesRow)!;
      const e = one(h.episodes)!;
      return {
        seriesId: s.id,
        seriesTitle: s.title,
        poster: poster(s),
        episodeId: h.episode_id,
        episodeNumber: e.episode_number,
        episodeTitle: e.title,
        durationSeconds: e.duration_seconds,
        position: h.position_seconds,
        completed: h.completed,
        updatedAt: h.updated_at,
      };
    }),
    following: (follows ?? [])
      .map((f) => one(f.creator_profiles))
      .filter(Boolean)
      .map((c) => ({ id: c!.id, name: c!.creator_name })),
  });
}
