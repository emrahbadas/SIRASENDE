import Link from "next/link";
import { requireCreator } from "../require-creator";

type Row = {
  series_id: string;
  series_title: string;
  series_status: string;
  watchlisted: number;
  episode_id: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  viewers: number;
  completions: number;
  likes: number;
  coin_unlocks: number;
  ad_unlocks: number;
};

const pct = (part: number, whole: number) => (whole ? `%${Math.round((part / whole) * 100)}` : "—");

export default async function AnalyticsPage() {
  const { supabase, creator } = await requireCreator();

  const [{ data, error }, { count: followers }] = await Promise.all([
    supabase.rpc("my_creator_analytics"),
    supabase.from("creator_follows").select("creator_id", { count: "exact", head: true }).eq("creator_id", creator.id),
  ]);
  const rows = (data ?? []) as Row[];

  const series = [...new Map(rows.map((r) => [r.series_id, r])).values()].map((s) => {
    const eps = rows.filter((r) => r.series_id === s.series_id);
    return {
      ...s,
      eps,
      viewers: eps[0]?.viewers ?? 0,
      completions: eps.reduce((n, e) => n + e.completions, 0),
      likes: eps.reduce((n, e) => n + e.likes, 0),
      unlocks: eps.reduce((n, e) => n + e.coin_unlocks + e.ad_unlocks, 0),
    };
  });

  const totals = [
    { label: "Takipçi", value: followers ?? 0 },
    { label: "İzleyici (1. bölüm)", value: series.reduce((n, s) => n + s.viewers, 0) },
    { label: "Beğeni", value: series.reduce((n, s) => n + s.likes, 0) },
    { label: "Açılan kilitli bölüm", value: series.reduce((n, s) => n + s.unlocks, 0) },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/studio" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Studio
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Analytics</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Giriş yapmış izleyicilerin verisi. Bölüm geçişi: bir önceki bölümü izleyenlerin kaçının bu bölüme devam ettiği.
      </p>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">{error.message}</p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {totals.map((t) => (
          <div key={t.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-2xl font-bold">{t.value.toLocaleString("tr-TR")}</p>
            <p className="mt-1 text-xs text-zinc-500">{t.label}</p>
          </div>
        ))}
      </div>

      {!series.length ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Henüz dizin yok.{" "}
          <Link href="/studio/productions/new" className="text-orange-400 hover:underline">
            İlk yapımını oluştur
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {series.map((s) => (
            <section key={s.series_id}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-lg font-semibold">{s.series_title}</h2>
                <span className="text-xs text-zinc-500">
                  {s.series_status} · {s.watchlisted} kişinin listesinde
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Bölüm</th>
                      <th className="px-4 py-2 text-right font-medium">İzleyici</th>
                      <th className="px-4 py-2 text-right font-medium">Tamamlama</th>
                      <th className="px-4 py-2 text-right font-medium">Bölüm geçişi</th>
                      <th className="px-4 py-2 text-right font-medium">Beğeni</th>
                      <th className="px-4 py-2 text-right font-medium">Coin / reklam ile açılan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {s.eps.map((e, i) => (
                      <tr key={e.episode_id}>
                        <td className="px-4 py-2">
                          <span className="text-zinc-500">
                            S{e.season_number} B{e.episode_number}
                          </span>{" "}
                          {e.episode_title}
                        </td>
                        <td className="px-4 py-2 text-right">{e.viewers}</td>
                        <td className="px-4 py-2 text-right">{pct(e.completions, e.viewers)}</td>
                        <td className="px-4 py-2 text-right">{i === 0 ? "—" : pct(e.viewers, s.eps[i - 1]?.viewers ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{e.likes}</td>
                        <td className="px-4 py-2 text-right">
                          {e.coin_unlocks} / {e.ad_unlocks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
