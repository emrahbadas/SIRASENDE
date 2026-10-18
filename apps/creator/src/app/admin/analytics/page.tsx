import Link from "next/link";
import { AnalyticsNav, DailyChart, ErrorNote, Stats, dateTime, num, requireAdmin, statusLabel } from "./shared";

type Overview = {
  views_today: number;
  views_7d: number;
  views_30d: number;
  views_total: number;
  viewers_total: number;
  viewers_7d: number;
  completions: number;
  users_total: number;
  users_7d: number;
  coin_unlocks: number;
  ad_unlocks: number;
};

type SeriesRow = {
  series_id: string;
  series_title: string;
  series_status: string;
  creator_name: string;
  deleted_at: string | null;
  episode_count: number;
  views_total: number;
  views_7d: number;
  viewers: number;
  completions: number;
  likes: number;
  coin_unlocks: number;
  ad_unlocks: number;
  watchlisted: number;
};

const sorts = {
  views: { label: "Toplam izlenme", key: (r: SeriesRow) => Number(r.views_total) },
  views7d: { label: "Son 7 gün", key: (r: SeriesRow) => Number(r.views_7d) },
  viewers: { label: "Tekil izleyici", key: (r: SeriesRow) => Number(r.viewers) },
  unlocks: { label: "Kilit açma", key: (r: SeriesRow) => Number(r.coin_unlocks) + Number(r.ad_unlocks) },
} as const;

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ sort?: string; deleted?: string }> }) {
  const { sort, deleted } = await searchParams;
  const showDeleted = deleted === "1";
  const base = showDeleted ? "/admin/analytics?deleted=1" : "/admin/analytics";
  const sortKey = (sort && sort in sorts ? sort : "views") as keyof typeof sorts;
  const supabase = await requireAdmin();

  const [overview, daily, series] = await Promise.all([
    supabase.rpc("admin_analytics_overview", { p_deleted: showDeleted }).single(),
    supabase.rpc("admin_daily_views", { p_days: 30, p_deleted: showDeleted }),
    supabase.rpc("admin_series_analytics", { p_deleted: showDeleted }),
  ]);
  const o = (overview.data ?? {}) as Partial<Overview>;
  const rows = ((series.data ?? []) as SeriesRow[]).sort((a, b) => sorts[sortKey].key(b) - sorts[sortKey].key(a));
  const error = overview.error ?? daily.error ?? series.error;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Analitik</h1>
      <p className="mt-1 text-sm text-zinc-500">
        İzlenme: video oynatma linki her verildiğinde sunucuda sayılır (giriş yapmayanlar dahil). İzleyici ve tamamlama:
        giriş yapmış kullanıcıların izleme kaydı. Kapalı test dönemi dahil tüm veriler.{" "}
        {showDeleted
          ? "Bu sekme yalnızca silinmiş yapımları sayar."
          : "Silinmiş yapımlar burada sayılmaz; Silinenler sekmesinde ayrı görünür."}
      </p>

      <AnalyticsNav active={showDeleted ? "deleted" : "overview"} />
      <ErrorNote message={error?.message} />

      <Stats
        items={[
          { label: "Bugün izlenme", value: o.views_today ?? 0 },
          { label: "Son 7 gün izlenme", value: o.views_7d ?? 0, hint: `30 gün: ${num(o.views_30d)}` },
          { label: "Toplam izlenme", value: o.views_total ?? 0 },
          { label: "Tamamlanan bölüm", value: o.completions ?? 0 },
          { label: "İzleyici (giriş yapmış)", value: o.viewers_total ?? 0, hint: `Son 7 gün aktif: ${num(o.viewers_7d)}` },
          ...(showDeleted
            ? []
            : [{ label: "Kayıtlı kullanıcı", value: o.users_total ?? 0, hint: `Son 7 gün yeni: ${num(o.users_7d)}` }]),
          { label: "Coin ile açılan", value: o.coin_unlocks ?? 0 },
          { label: "Reklamla açılan", value: o.ad_unlocks ?? 0 },
        ]}
      />

      <DailyChart days={(daily.data ?? []) as { day: string; views: number }[]} />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{showDeleted ? "Silinmiş yapımlar" : "Yapımlar"}</h2>
        <div className="flex flex-wrap gap-1 text-xs">
          {Object.entries(sorts).map(([key, s]) => (
            <Link
              key={key}
              href={key === "views" ? base : `${base}${showDeleted ? "&" : "?"}sort=${key}`}
              className={`rounded-full border px-2.5 py-1 ${
                sortKey === key ? "border-orange-600 text-orange-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      {!rows.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">{showDeleted ? "Silinmiş yapım yok." : "Henüz yapım yok."}</div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Yapım</th>
                <th className="px-4 py-2 text-right font-medium">İzlenme</th>
                <th className="px-4 py-2 text-right font-medium">7 gün</th>
                <th className="px-4 py-2 text-right font-medium">İzleyici</th>
                <th className="px-4 py-2 text-right font-medium">Tamamlanan</th>
                <th className="px-4 py-2 text-right font-medium">Beğeni</th>
                <th className="px-4 py-2 text-right font-medium">Coin / reklam</th>
                <th className="px-4 py-2 text-right font-medium">Listede</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((r) => (
                <tr key={r.series_id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-2">
                    <Link href={`/admin/analytics/series/${r.series_id}`} className="font-medium hover:text-orange-300">
                      {r.series_title}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {r.creator_name} · {r.deleted_at ? `Silindi ${dateTime(r.deleted_at)}` : statusLabel(r.series_status)} ·{" "}
                      {r.episode_count} bölüm
                    </p>
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{num(r.views_total)}</td>
                  <td className="px-4 py-2 text-right">{num(r.views_7d)}</td>
                  <td className="px-4 py-2 text-right">{num(r.viewers)}</td>
                  <td className="px-4 py-2 text-right">{num(r.completions)}</td>
                  <td className="px-4 py-2 text-right">{num(r.likes)}</td>
                  <td className="px-4 py-2 text-right">
                    {num(r.coin_unlocks)} / {num(r.ad_unlocks)}
                  </td>
                  <td className="px-4 py-2 text-right">{num(r.watchlisted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
