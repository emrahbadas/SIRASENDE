import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createEpisode,
  deleteEpisode,
  deleteProduction,
  setEpisodePaused,
  setSeriesPaused,
  submitForReview,
} from "../actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EDITABLE_STATUSES } from "@/lib/content/manage";
import { EpisodeVideo, type EpisodeAsset } from "./episode-video";
import { getVideoSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { PosterEditor } from "./poster-editor";

const statusLabels: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "border-zinc-700 text-zinc-400" },
  uploading: { label: "Yükleniyor", cls: "border-amber-700 text-amber-400" },
  processing: { label: "İşleniyor", cls: "border-amber-700 text-amber-400" },
  moderating: { label: "İncelemede", cls: "border-sky-700 text-sky-400" },
  rejected: { label: "Reddedildi", cls: "border-rose-700 text-rose-400" },
  needs_changes: { label: "Düzeltme bekliyor", cls: "border-amber-700 text-amber-400" },
  ready: { label: "Hazır", cls: "border-emerald-700 text-emerald-400" },
  published: { label: "Yayında", cls: "border-emerald-600 text-emerald-300" },
  paused: { label: "Durduruldu", cls: "border-zinc-600 text-zinc-300" },
  blocked: { label: "Platform durdurdu", cls: "border-rose-700 text-rose-400" },
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
      "id, title, description, production_type, series(id, title, status, moderation_note, primary_language, poster_url, free_episode_count, seasons(id, season_number, episodes(id, episode_number, title, status, moderation_note, created_at, video_assets(id, status, duration_seconds, error_message, created_at))))"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!production) notFound();

  const series = production.series?.[0];
  const seasons = (series?.seasons ?? []).sort((a, b) => a.season_number - b.season_number);
  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  // Poster and series details lock once the series is reviewed; episodes have their own status
  const editable = !!series && EDITABLE_STATUSES.includes(series.status);
  const blocked = series?.status === "blocked";
  const allEpisodes = seasons.flatMap((s) => s.episodes);
  const pendingCount = allEpisodes.filter((e) => EDITABLE_STATUSES.includes(e.status)).length;
  const inReview = series?.status === "moderating" || allEpisodes.some((e) => e.status === "moderating");
  const onAir = series?.status === "published" || series?.status === "paused";

  // Latest non-deleted video per episode
  const currentAsset = (assets: (EpisodeAsset & { created_at: string })[] | null) =>
    (assets ?? [])
      .filter((a) => a.status !== "deleted")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const settings = await getVideoSettings(supabase);

  // Same rule as the vitrine: auto cover only from a free, published first episode
  const autoCover =
    series && !series.poster_url
      ? ((await getSeriesCovers(createAdminClient(), [series])).get(series.id)?.thumbnail ?? null)
      : null;
  const maxMinutes = Math.floor(settings.maxEpisodeSeconds / 60);

  // Split jobs still in progress, per season
  const { data: splitJobs } = await supabase
    .from("video_split_jobs")
    .select("id, season_id, status, duration_seconds, reserved_seconds, error_message, created_at")
    .in("season_id", seasons.map((s) => s.id))
    .in("status", ["pending_upload", "processing", "ready", "splitting", "failed"])
    .order("created_at", { ascending: false });

  const { data: storage } = await supabase.rpc("my_storage_summary").maybeSingle<{
    quota_minutes: number;
    used_seconds: number;
  }>();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/studio/productions" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← My Productions
      </Link>

      <header className="mt-2 mb-8 flex items-start justify-between gap-4">
        {series && (
          <PosterEditor
            seriesId={series.id}
            title={series.title}
            posterUrl={series.poster_url}
            autoCoverUrl={autoCover}
            editable={editable}
          />
        )}
        <div className="flex-1">
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
        {series && !blocked && pendingCount > 0 && totalEpisodes > 0 && (
          <form action={submitForReview}>
            <input type="hidden" name="series_id" value={series.id} />
            <input type="hidden" name="production_id" value={production.id} />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium transition hover:bg-orange-500"
            >
              {onAir || series.status === "moderating"
                ? `Yeni bölümleri onaya gönder (${pendingCount})`
                : series.status === "draft"
                  ? "Onaya gönder"
                  : "Tekrar onaya gönder"}
            </button>
          </form>
        )}
        {inReview && pendingCount === 0 && (
          <p className="shrink-0 rounded-lg border border-sky-800 bg-sky-950/50 px-4 py-2 text-sm text-sky-300">
            Platform incelemesinde
          </p>
        )}
      </header>

      {storage && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Depolama</span>
            <span>
              {Math.ceil(storage.used_seconds / 60)} / {storage.quota_minutes} dk
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full ${
                storage.used_seconds >= storage.quota_minutes * 60 * 0.9 ? "bg-rose-500" : "bg-emerald-500"
              }`}
              style={{
                width: `${Math.min(100, (storage.used_seconds / Math.max(1, storage.quota_minutes * 60)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {blocked && (
        <div className="mb-6 rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-sm">
          <p className="font-semibold text-rose-300">Bu dizi platform tarafından yayından kaldırıldı</p>
          {series?.moderation_note && <p className="mt-1 text-rose-200/90">{series.moderation_note}</p>}
        </div>
      )}

      {onAir && pendingCount > 0 && (
        <p className="mb-6 rounded-xl border border-sky-900/60 bg-sky-950/20 p-4 text-sm text-sky-200">
          Dizin yayında kalırken yeni bölümlerin ayrıca incelenir. Videolarını yükleyip &quot;Yeni bölümleri onaya
          gönder&quot;e bas; onaylanınca izleyicilere açılırlar.
        </p>
      )}

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
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sezon {season.season_number}</h2>
              {!blocked && (
                <Link
                  href={`/studio/productions/${production.id}/split?season=${season.id}`}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-orange-600 hover:text-orange-300"
                >
                  ✂ Uzun videoyu bölümlere ayır
                </Link>
              )}
            </div>

            {(splitJobs ?? [])
              .filter((j) => j.season_id === season.id)
              .map((j) => {
                const minutes = Math.ceil((j.duration_seconds ?? j.reserved_seconds) / 60);
                const label: Record<string, string> = {
                  pending_upload: "Yükleme yarım kaldı",
                  processing: "Kaynak video işleniyor",
                  ready: "Kesimler onay bekliyor",
                  splitting: "Bölümler oluşturuluyor",
                  failed: j.error_message ?? "Bölme başarısız",
                };
                const resumable = j.status === "processing" || j.status === "ready";
                return (
                  <div
                    key={j.id}
                    className="mb-3 flex items-center justify-between rounded-xl border border-sky-900/60 bg-sky-950/20 px-4 py-2 text-sm"
                  >
                    <span className="text-sky-300">
                      ✂ {minutes} dk video · {label[j.status]}
                    </span>
                    {resumable && (
                      <Link
                        href={`/studio/productions/${production.id}/split?season=${season.id}&job=${j.id}`}
                        className="text-xs text-sky-300 underline hover:text-sky-200"
                      >
                        Devam et
                      </Link>
                    )}
                  </div>
                );
              })}

            {episodes.length === 0 ? (
              <p className="mb-4 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                Bu sezonda henüz bölüm yok.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {episodes.map((ep) => {
                  const st = statusLabels[ep.status] ?? statusLabels.draft!;
                  const epEditable = !blocked && EDITABLE_STATUSES.includes(ep.status);
                  const live = ep.status === "published" || ep.status === "paused";
                  return (
                    <li
                      key={ep.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
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
                          <EpisodeVideo
                            episodeId={ep.id}
                            asset={currentAsset(ep.video_assets)}
                            editable={epEditable}
                            maxEpisodeSeconds={settings.maxEpisodeSeconds}
                            splitHref={`/studio/productions/${production.id}/split?season=${season.id}`}
                          />
                          {live && (
                            <form action={setEpisodePaused}>
                              <input type="hidden" name="episode_id" value={ep.id} />
                              <input type="hidden" name="production_id" value={production.id} />
                              <input type="hidden" name="pause" value={ep.status === "published" ? "1" : "0"} />
                              <button
                                type="submit"
                                className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
                              >
                                {ep.status === "published" ? "Durdur" : "Yayına al"}
                              </button>
                            </form>
                          )}
                          {ep.status !== "moderating" && (
                            <form action={deleteEpisode}>
                              <input type="hidden" name="episode_id" value={ep.id} />
                              <input type="hidden" name="production_id" value={production.id} />
                              <ConfirmSubmit
                                message={
                                  live
                                    ? `"${ep.title}" kalıcı olarak silinecek. İzleyiciler bu bölüme artık erişemez ve sonraki bölümlerin numarası bir azalır. Emin misin?`
                                    : `"${ep.title}" ve videosu silinecek. Emin misin?`
                                }
                                className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-rose-800 hover:text-rose-400"
                              >
                                Sil
                              </ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      </div>
                      {ep.moderation_note && ["rejected", "needs_changes"].includes(ep.status) && (
                        <p className="mt-2 rounded-lg bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
                          Moderasyon notu: {ep.moderation_note}
                        </p>
                      )}
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
                placeholder={`Bölüm ${episodes.length + 1} başlığı (video en fazla ${maxMinutes} dk)`}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium transition hover:bg-orange-500"
              >
                + Bölüm ekle
              </button>
            </form>
          </section>
        );
      })}
      {series && (
        <section className="mt-12 rounded-xl border border-rose-950 p-5">
          <h2 className="font-semibold">Yayın yönetimi</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onAir && (
              <form action={setSeriesPaused}>
                <input type="hidden" name="production_id" value={production.id} />
                <input type="hidden" name="pause" value={series.status === "published" ? "1" : "0"} />
                {series.status === "published" ? (
                  <ConfirmSubmit
                    message="Dizi vitrinden ve uygulamadan kaldırılacak. İstediğin zaman tekrar yayına alabilirsin. Devam edilsin mi?"
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition hover:border-zinc-500"
                  >
                    Diziyi yayından durdur
                  </ConfirmSubmit>
                ) : (
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
                  >
                    Diziyi tekrar yayına al
                  </button>
                )}
              </form>
            )}
            <form action={deleteProduction}>
              <input type="hidden" name="production_id" value={production.id} />
              <ConfirmSubmit
                message={`"${production.title}" ve tüm bölüm videoları kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misin?`}
                className="rounded-lg border border-rose-800 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-950"
              >
                Yapımı sil
              </ConfirmSubmit>
            </form>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Durdurulan dizi izleyicilere görünmez, verileri korunur. Silme, videoları kalıcı olarak kaldırır ve
            depolama alanını boşaltır.
          </p>
        </section>
      )}
    </main>
  );
}
