import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { callerClient, json, one, preflight } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

type SeasonRow = { season_number: number; episodes: { id: string; status: string; episode_number: number }[] };

/**
 * Published series for the home screen, with covers, episode counts, view
 * stats (all-time and last 7 days) and the first episode for the Shorts feed.
 */
export async function GET(request: Request) {
  const { supabase } = callerClient(request);
  const [{ data: series, error }, { data: stats }] = await Promise.all([
    supabase
      .from("series")
      .select(
        "id, title, description, poster_url, free_episode_count, episode_coin_price, created_at, productions(age_rating, production_type, creator_profiles(creator_name), production_categories(categories(slug, name_tr))), seasons(season_number, episodes(id, status, episode_number))"
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.rpc("series_view_stats"),
  ]);
  if (error) return json({ error: "catalog_unavailable" }, 500);

  const statsBy = new Map(
    ((stats ?? []) as { series_id: string; views: number; views_7d: number; first_published_at: string | null }[]).map(
      (s) => [s.series_id, s]
    )
  );
  const covers = await getSeriesCovers(createAdminClient(), series ?? []);

  return json({
    series: (series ?? []).map((s) => {
      const production = one(s.productions);
      const published = ((s.seasons ?? []) as SeasonRow[])
        .flatMap((se) => se.episodes.map((e) => ({ ...e, season: se.season_number })))
        .filter((e) => e.status === "published")
        .sort((a, b) => a.season - b.season || a.episode_number - b.episode_number);
      const stat = statsBy.get(s.id);
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        creatorName: one(production?.creator_profiles)?.creator_name ?? null,
        ageRating: production?.age_rating ?? null,
        categories: (production?.production_categories ?? [])
          .map((pc: { categories: unknown }) => one(pc.categories as { slug: string; name_tr: string }))
          .filter(Boolean),
        poster: s.poster_url ?? covers.get(s.id)?.thumbnail ?? null,
        preview: covers.get(s.id)?.preview ?? null,
        episodeCount: published.length,
        firstEpisodeId: published[0]?.id ?? null,
        freeEpisodeCount: s.free_episode_count,
        episodeCoinPrice: s.episode_coin_price,
        views: Number(stat?.views ?? 0),
        views7d: Number(stat?.views_7d ?? 0),
        publishedAt: stat?.first_published_at ?? s.created_at,
      };
    }),
  });
}
