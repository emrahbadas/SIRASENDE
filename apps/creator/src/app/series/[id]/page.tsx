import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";

// PostgREST to-one relations are inferred as arrays without generated DB types
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const warningLabels: Record<string, string> = {
  violence: "Şiddet",
  fear: "Korku",
  profanity: "Argo/Küfür",
  sensitive_themes: "Hassas temalar",
  substance_use: "Madde kullanımı",
};

export default async function PublicSeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: series } = await supabase
    .from("series")
    .select(
      "id, title, description, poster_url, primary_language, status, free_episode_count, episode_coin_price, productions(production_type, age_rating, content_warnings, creator_profiles(creator_name)), seasons(season_number, episodes(id, episode_number, title, status, duration_seconds))"
    )
    .eq("id", id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  if (!series) notFound();

  const seasons = (series.seasons ?? []).sort((a, b) => a.season_number - b.season_number);
  const cover = series.poster_url
    ? null
    : (await getSeriesCovers(createAdminClient(), [series])).get(series.id);
  const posterSrc = series.poster_url ?? cover?.thumbnail ?? null;
  const production = one(series.productions);
  const creatorName = one(production?.creator_profiles)?.creator_name;

  // Position among published episodes decides the free window (matches can_watch_episode)
  const positions = new Map(
    seasons
      .flatMap((s) => [...s.episodes].sort((a, b) => a.episode_number - b.episode_number))
      .filter((e) => e.status === "published")
      .map((e, i) => [e.id, i + 1])
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Keşfet
      </Link>

      <header className="mt-4 flex gap-6">
        <div className="flex aspect-9/13 w-40 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-linear-to-br from-zinc-900 to-zinc-950">
          {posterSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterSrc}
              alt={series.title}
              className="h-full w-full rounded-xl object-cover"
            />
          ) : (
            <span className="px-3 text-center font-bold text-zinc-700">{series.title}</span>
          )}
        </div>
        <div>
          <h1 className="text-3xl font-bold">{series.title}</h1>
          {creatorName && <p className="mt-1 text-sm text-rose-400">{creatorName}</p>}
          <p className="mt-1 flex items-center gap-2 text-xs uppercase text-zinc-600">
            <span>
              {series.primary_language} · {production?.production_type}
            </span>
            {production?.age_rating && (
              <span className="rounded border border-amber-700/60 px-1.5 py-0.5 text-amber-400">
                {production.age_rating}
              </span>
            )}
          </p>
          {series.description && <p className="mt-4 text-zinc-400">{series.description}</p>}
          {(production?.content_warnings?.length ?? 0) > 0 && (
            <p className="mt-3 flex flex-wrap gap-1">
              {production!.content_warnings.map((w: string) => (
                <span
                  key={w}
                  className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400"
                >
                  {warningLabels[w] ?? w}
                </span>
              ))}
            </p>
          )}
        </div>
      </header>

      {seasons.map((season) => {
        const episodes = season.episodes
          .filter((e) => e.status === "published")
          .sort((a, b) => a.episode_number - b.episode_number);
        if (episodes.length === 0) return null;
        return (
          <section key={season.season_number} className="mt-10">
            <h2 className="mb-4 text-lg font-semibold">Sezon {season.season_number}</h2>
            <ul className="space-y-2">
              {episodes.map((ep) => {
                const locked = (positions.get(ep.id) ?? 0) > series.free_episode_count;
                return (
                  <li key={ep.id}>
                    <Link
                      href={`/watch/${ep.id}`}
                      className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition hover:border-rose-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-center font-mono text-sm text-zinc-500">
                          {ep.episode_number}
                        </span>
                        <span className="font-medium">{ep.title}</span>
                      </div>
                      <span className={`text-xs ${locked ? "text-amber-400" : "text-emerald-400"}`}>
                        {locked ? `🔒 ${series.episode_coin_price} coin` : "Ücretsiz izle"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
