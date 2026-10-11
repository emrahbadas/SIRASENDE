import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { callerClient, json, one, preflight } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/** Published series for the home screen, with covers and episode counts. */
export async function GET(request: Request) {
  const { supabase } = callerClient(request);
  const { data: series, error } = await supabase
    .from("series")
    .select(
      "id, title, description, poster_url, free_episode_count, episode_coin_price, created_at, productions(age_rating, production_type, creator_profiles(creator_name), production_categories(categories(slug, name_tr))), seasons(episodes(id, status))"
    )
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return json({ error: "catalog_unavailable" }, 500);

  const covers = await getSeriesCovers(createAdminClient(), series ?? []);

  return json({
    series: (series ?? []).map((s) => {
      const production = one(s.productions);
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
        episodeCount: (s.seasons ?? []).reduce(
          (n: number, se: { episodes: { status: string }[] }) =>
            n + se.episodes.filter((e) => e.status === "published").length,
          0
        ),
        freeEpisodeCount: s.free_episode_count,
        episodeCoinPrice: s.episode_coin_price,
      };
    }),
  });
}
