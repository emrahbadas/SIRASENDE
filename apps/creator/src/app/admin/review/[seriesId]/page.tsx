import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createPlaybackToken, iframeUrl } from "@/lib/cloudflare/stream";
import { ModerationForm } from "../../moderation-form";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type Asset = {
  provider_asset_id: string | null;
  status: string;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
};

const formatDuration = (s: number | null | undefined) =>
  s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—";

// Moderators watch every episode of a series under review, with no lock or ad
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>;
  searchParams: Promise<{ ep?: string }>;
}) {
  const { seriesId } = await params;
  const { ep } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", user.id)
    .in("role", ["admin", "moderator"]);
  if (!roles?.length) redirect("/");

  const { data: series } = await supabase
    .from("series")
    .select(
      "id, title, description, status, poster_url, productions(title, creator_profiles(creator_name)), seasons(season_number, episodes(id, episode_number, title, description, duration_seconds, video_assets(provider_asset_id, status, duration_seconds, width, height)))"
    )
    .eq("id", seriesId)
    .maybeSingle();
  if (!series) notFound();

  const episodes = (series.seasons ?? [])
    .flatMap((se) =>
      se.episodes.map((e) => {
        // A failed upload can leave older rows; prefer the ready asset
        const assets: Asset[] = e.video_assets ?? [];
        const asset = assets.find((a) => a.status === "ready") ?? assets[0] ?? null;
        return { ...e, season: se.season_number, asset };
      })
    )
    .sort((a, b) => a.season - b.season || a.episode_number - b.episode_number);

  const current = episodes.find((e) => e.id === ep) ?? episodes[0] ?? null;
  const currentIndex = current ? episodes.indexOf(current) : -1;
  const next = currentIndex >= 0 ? episodes[currentIndex + 1] : undefined;

  const uid = current?.asset?.status === "ready" ? current.asset.provider_asset_id : null;
  const playerUrl = uid ? `${iframeUrl(await createPlaybackToken(uid))}?autoplay=true` : null;
  const landscape = !!current?.asset?.width && current.asset.width > (current.asset.height ?? 0);

  const notReady = episodes.filter((e) => e.asset?.status !== "ready").length;
  const totalSeconds = episodes.reduce(
    (sum, e) => sum + (e.asset?.duration_seconds ?? e.duration_seconds ?? 0),
    0
  );
  const production = one(series.productions);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">{series.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {one(production?.creator_profiles)?.creator_name} · {episodes.length} bölüm · toplam{" "}
        {formatDuration(totalSeconds)}
        {series.status !== "moderating" && (
          <span className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
            Durum: {series.status}
          </span>
        )}
      </p>
      {notReady > 0 && (
        <p className="mt-3 rounded-lg border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-300">
          {notReady} bölümün videosu hazır değil; bunlar izlenemez.
        </p>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
        <div>
          <div
            className={`relative w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black ${
              landscape ? "aspect-video" : "aspect-9/16"
            }`}
          >
            {playerUrl ? (
              <iframe
                key={current!.id}
                src={playerUrl}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-500">
                {current ? "Bu bölümün videosu hazır değil." : "Bu dizide bölüm yok."}
              </p>
            )}
          </div>
          {current && (
            <div className="mt-3">
              <p className="font-medium">
                S{current.season} · B{current.episode_number} — {current.title}
              </p>
              {current.description && <p className="mt-1 text-sm text-zinc-400">{current.description}</p>}
              {next && (
                <Link
                  href={`/admin/review/${series.id}?ep=${next.id}`}
                  className="mt-3 inline-block rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500"
                >
                  Sonraki bölüm →
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <ol className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {episodes.map((e) => {
              const active = e.id === current?.id;
              const ready = e.asset?.status === "ready";
              return (
                <li key={e.id}>
                  <Link
                    href={`/admin/review/${series.id}?ep=${e.id}`}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition ${
                      active ? "bg-rose-950/40" : "hover:bg-zinc-900"
                    }`}
                  >
                    <span className="w-14 shrink-0 text-zinc-500">
                      S{e.season} B{e.episode_number}
                    </span>
                    <span className="flex-1 truncate">{e.title}</span>
                    <span className="text-zinc-500">
                      {formatDuration(e.asset?.duration_seconds ?? e.duration_seconds)}
                    </span>
                    {!ready && (
                      <span className="rounded border border-amber-800 px-1.5 text-xs text-amber-400">
                        {e.asset?.status ?? "video yok"}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>

          {series.status === "moderating" && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h2 className="mb-3 font-semibold">Karar</h2>
              <ModerationForm seriesId={series.id} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
