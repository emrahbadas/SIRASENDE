import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlaybackToken, iframeUrl } from "@/lib/cloudflare/stream";
import { unlockWithCoins } from "../actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ episodeId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { episodeId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: episode } = await supabase
    .from("episodes")
    .select("id, title, episode_number, seasons!inner(season_number, series!inner(id, title, episode_coin_price))")
    .eq("id", episodeId)
    .maybeSingle();
  const season = one(episode?.seasons);
  const series = one(season?.series);
  if (!episode || !season || !series) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: canWatch } = await supabase.rpc("can_watch_episode", { p_episode_id: episodeId });

  let playerUrl: string | null = null;
  let videoMissing = false;
  if (canWatch) {
    // Assets are not publicly readable; access was checked by can_watch_episode
    const { data: asset } = await createAdminClient()
      .from("video_assets")
      .select("provider_asset_id")
      .eq("episode_id", episodeId)
      .eq("status", "ready")
      .not("provider_asset_id", "is", null)
      .maybeSingle();
    if (asset?.provider_asset_id) {
      playerUrl = iframeUrl(await createPlaybackToken(asset.provider_asset_id));
    } else {
      videoMissing = true;
    }
  }

  let coinBalance: number | null = null;
  if (user && !canWatch) {
    const { data: wallet } = await supabase
      .from("wallet_accounts")
      .select("balance")
      .eq("profile_id", user.id)
      .eq("currency", "COIN")
      .maybeSingle();
    coinBalance = wallet?.balance ?? 0;
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <Link href={`/series/${series.id}`} className="text-sm text-zinc-500 hover:text-zinc-300">
        ← {series.title}
      </Link>
      <h1 className="mt-2 mb-4 text-lg font-semibold">
        S{season.season_number} · B{episode.episode_number} — {episode.title}
      </h1>

      <div className="relative aspect-9/16 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black">
        {playerUrl ? (
          <iframe
            src={playerUrl}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : videoMissing ? (
          <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-500">
            Bu bölümün videosu henüz hazır değil.
          </p>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-lg font-semibold">Bu bölüm kilitli</p>
            <p className="text-sm text-zinc-400">
              {series.episode_coin_price} coin ile hemen aç. Reklam izleyerek açma mobil uygulamada
              gelecek.
            </p>
            {user ? (
              <form action={unlockWithCoins} className="flex flex-col items-center gap-2">
                <input type="hidden" name="episode_id" value={episodeId} />
                <button
                  type="submit"
                  className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium transition hover:bg-orange-500"
                >
                  {series.episode_coin_price} coin ile aç
                </button>
                <span className="text-xs text-zinc-500">Bakiyen: {coinBalance} coin</span>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-orange-600 px-5 py-2 text-sm font-medium transition hover:bg-orange-500"
              >
                Açmak için giriş yap
              </Link>
            )}
            {error && <p className="text-sm text-rose-400">{decodeURIComponent(error)}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
