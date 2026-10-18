import Link from "next/link";
import { notFound } from "next/navigation";
import { DailyChart, ErrorNote, Stats, dateTime, duration, num, pct, requireAdmin, statusLabel } from "../../shared";

type EpisodeRow = {
  episode_id: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  episode_status: string;
  duration_seconds: number | null;
  views_total: number;
  views_7d: number;
  viewers: number;
  completions: number;
  likes: number;
  coin_unlocks: number;
  ad_unlocks: number;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function AdminSeriesAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAdmin();

  const [{ data: series }, episodes, daily] = await Promise.all([
    supabase
      .from("series")
      .select("id, title, status, deleted_at, productions(creator_profiles(creator_name))")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("admin_episode_analytics", { p_series_id: id }),
    supabase.rpc("admin_daily_views", { p_series_id: id, p_days: 30 }),
  ]);
  if (!series) notFound();

  const eps = (episodes.data ?? []) as EpisodeRow[];
  const creatorName = one(one(series.productions)?.creator_profiles)?.creator_name;
  const sum = (f: (e: EpisodeRow) => number) => eps.reduce((n, e) => n + Number(f(e)), 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link
        href={series.deleted_at ? "/admin/analytics?deleted=1" : "/admin/analytics"}
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← {series.deleted_at ? "Silinenler" : "Analitik"}
      </Link>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
        {series.title}
        {series.deleted_at && (
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-normal text-zinc-400">Silinmiş</span>
        )}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {creatorName} · {series.deleted_at ? `Silindi ${dateTime(series.deleted_at)}` : statusLabel(series.status)} ·{" "}
        {eps.length} bölüm
      </p>

      <ErrorNote message={(episodes.error ?? daily.error)?.message} />

      <Stats
        items={[
          { label: "İlk bölüm izleyicisi", value: Number(eps[0]?.viewers ?? 0) },
          { label: "Tamamlanan bölüm", value: sum((e) => e.completions) },
          { label: "Beğeni", value: sum((e) => e.likes) },
          { label: "Coin / reklamla açılan", value: `${num(sum((e) => e.coin_unlocks))} / ${num(sum((e) => e.ad_unlocks))}` },
        ]}
      />

      <DailyChart days={(daily.data ?? []) as { day: string; views: number }[]} />

      <h2 className="mt-8 text-lg font-semibold">Bölümler</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Bölüm bazlı izlenme 18 Ekim 2026&apos;dan itibaren sayılıyor; öncesi yalnızca yapım toplamında. Devam: bir önceki
        bölümü izleyenlerin kaçının bu bölüme geçtiği (bölüm atlayanlar yüzünden %100+ olabilir).
      </p>
      {!eps.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">Bölüm yok.</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Bölüm</th>
                <th className="px-4 py-2 text-right font-medium">Süre</th>
                <th className="px-4 py-2 text-right font-medium">İzlenme</th>
                <th className="px-4 py-2 text-right font-medium">7 gün</th>
                <th className="px-4 py-2 text-right font-medium">İzleyici</th>
                <th className="px-4 py-2 text-right font-medium">Tamamlama</th>
                <th className="px-4 py-2 text-right font-medium">Devam</th>
                <th className="px-4 py-2 text-right font-medium">Beğeni</th>
                <th className="px-4 py-2 text-right font-medium">Coin / reklam</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {eps.map((e, i) => (
                <tr key={e.episode_id}>
                  <td className="px-4 py-2">
                    <span className="text-zinc-500">
                      S{e.season_number} B{e.episode_number}
                    </span>{" "}
                    {e.episode_title}
                    {e.episode_status !== "published" && (
                      <span className="ml-2 text-xs text-zinc-500">({statusLabel(e.episode_status)})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-zinc-400">{duration(e.duration_seconds)}</td>
                  <td className="px-4 py-2 text-right font-medium">{num(e.views_total)}</td>
                  <td className="px-4 py-2 text-right">{num(e.views_7d)}</td>
                  <td className="px-4 py-2 text-right">{num(e.viewers)}</td>
                  <td className="px-4 py-2 text-right">{pct(Number(e.completions), Number(e.viewers))}</td>
                  <td className="px-4 py-2 text-right">
                    {i === 0
                      ? "—"
                      : Number(e.viewers) > Number(eps[i - 1]?.viewers ?? 0) && Number(eps[i - 1]?.viewers)
                        ? "%100+"
                        : pct(Number(e.viewers), Number(eps[i - 1]?.viewers ?? 0))}
                  </td>
                  <td className="px-4 py-2 text-right">{num(e.likes)}</td>
                  <td className="px-4 py-2 text-right">
                    {num(e.coin_unlocks)} / {num(e.ad_unlocks)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
