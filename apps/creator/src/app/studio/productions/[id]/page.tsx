import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEpisode, deleteEpisode, submitForReview } from "../actions";

const statusLabels: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "border-zinc-700 text-zinc-400" },
  uploading: { label: "Yükleniyor", cls: "border-amber-700 text-amber-400" },
  processing: { label: "İşleniyor", cls: "border-amber-700 text-amber-400" },
  moderating: { label: "İncelemede", cls: "border-sky-700 text-sky-400" },
  rejected: { label: "Reddedildi", cls: "border-rose-700 text-rose-400" },
  needs_changes: { label: "Düzeltme bekliyor", cls: "border-amber-700 text-amber-400" },
  ready: { label: "Hazır", cls: "border-emerald-700 text-emerald-400" },
  published: { label: "Yayında", cls: "border-emerald-600 text-emerald-300" },
  blocked: { label: "Engellendi", cls: "border-rose-700 text-rose-400" },
  failed: { label: "Hata", cls: "border-rose-700 text-rose-400" },
};

export default async function ProductionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: production } = await supabase
    .from("productions")
    .select(
      "id, title, description, production_type, series(id, title, status, moderation_note, primary_language, seasons(id, season_number, episodes(id, episode_number, title, status, created_at)))"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!production) notFound();

  const series = production.series?.[0];
  const seasons = (series?.seasons ?? []).sort((a, b) => a.season_number - b.season_number);
  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/studio/productions" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← My Productions
      </Link>

      <header className="mt-2 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{production.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
            <span>{production.production_type}</span>
            {series && <span>· {series.primary_language.toUpperCase()}</span>}
            {series && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  statusLabels[series.status]?.cls ?? "border-zinc-700 text-zinc-400"
                }`}
              >
                {statusLabels[series.status]?.label ?? series.status}
              </span>
            )}
          </p>
          {production.description && (
            <p className="mt-3 text-zinc-400">{production.description}</p>
          )}
        </div>
        {series && ["draft", "rejected", "needs_changes"].includes(series.status) && totalEpisodes > 0 && (
          <form action={submitForReview}>
            <input type="hidden" name="series_id" value={series.id} />
            <input type="hidden" name="production_id" value={production.id} />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500"
            >
              {series.status === "draft" ? "Onaya gönder" : "Tekrar onaya gönder"}
            </button>
          </form>
        )}
        {series?.status === "moderating" && (
          <p className="shrink-0 rounded-lg border border-sky-800 bg-sky-950/50 px-4 py-2 text-sm text-sky-300">
            Platform incelemesinde
          </p>
        )}
      </header>

      {series?.moderation_note && ["rejected", "needs_changes"].includes(series.status) && (
        <div className="mb-6 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-sm">
          <p className="font-semibold text-amber-300">Moderasyon notu</p>
          <p className="mt-1 text-amber-200/90">{series.moderation_note}</p>
        </div>
      )}

      {error && (
        <p className="mb-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {seasons.map((season) => {
        const episodes = [...season.episodes].sort(
          (a, b) => a.episode_number - b.episode_number
        );
        return (
          <section key={season.id} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">Sezon {season.season_number}</h2>

            {episodes.length === 0 ? (
              <p className="mb-4 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                Bu sezonda henüz bölüm yok.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {episodes.map((ep) => {
                  const st = statusLabels[ep.status] ?? statusLabels.draft!;
                  return (
                    <li
                      key={ep.id}
                      className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 text-center font-mono text-sm text-zinc-500">
                          {ep.episode_number}
                        </span>
                        <span className="font-medium">{ep.title}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-600">
                          Video yükleme Phase 3&apos;te
                        </span>
                        {ep.status === "draft" && (
                          <form action={deleteEpisode}>
                            <input type="hidden" name="episode_id" value={ep.id} />
                            <input type="hidden" name="production_id" value={production.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-rose-800 hover:text-rose-400"
                            >
                              Sil
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <form
              action={createEpisode}
              className="flex gap-2 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3"
            >
              <input type="hidden" name="season_id" value={season.id} />
              <input type="hidden" name="production_id" value={production.id} />
              <input
                name="title"
                type="text"
                required
                placeholder={`Bölüm ${episodes.length + 1} başlığı`}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500"
              >
                + Bölüm ekle
              </button>
            </form>
          </section>
        );
      })}
    </main>
  );
}
