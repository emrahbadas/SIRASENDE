import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorNote, Stats, dateTime, duration, num, pct, requireAdmin } from "../../shared";

type HistoryRow = {
  series_id: string;
  series_title: string;
  episode_id: string;
  season_number: number;
  episode_number: number;
  episode_title: string;
  duration_seconds: number | null;
  position_seconds: number;
  completed: boolean;
  liked: boolean;
  unlock_method: string | null;
  updated_at: string;
};

const unlockLabels: Record<string, string> = { coins: "Coin", rewarded_ad: "Reklam" };

export default async function AdminViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await requireAdmin();

  const [{ data: viewers, error: viewersError }, history] = await Promise.all([
    supabase.rpc("admin_viewers"),
    supabase.rpc("admin_viewer_history", { p_profile_id: id }),
  ]);
  const viewer = (viewers ?? []).find((v: { profile_id: string }) => v.profile_id === id);
  if (!viewer && !viewersError) notFound();

  const rows = (history.data ?? []) as HistoryRow[];
  const bySeries = [...new Map(rows.map((r) => [r.series_id, r.series_title])).entries()].map(([sid, title]) => ({
    sid,
    title,
    eps: rows.filter((r) => r.series_id === sid),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/admin/analytics/viewers" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← İzleyiciler
      </Link>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
        {viewer?.display_name || viewer?.username}
        {viewer?.is_reviewer && (
          <span className="rounded-full border border-sky-800 px-2 py-0.5 text-xs font-normal text-sky-300">Play inceleme</span>
        )}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        @{viewer?.username}
        {viewer?.email && <> · {viewer.email}</>} · üyelik {dateTime(viewer?.joined_at ?? null)}
      </p>

      <ErrorNote message={(viewersError ?? history.error)?.message} />

      <Stats
        items={[
          { label: "Yapım", value: bySeries.length },
          { label: "Başlanan bölüm", value: rows.length },
          { label: "Biten bölüm", value: rows.filter((r) => r.completed).length },
          { label: "Kilit açma", value: Number(viewer?.unlocks ?? 0) },
        ]}
      />

      {!bySeries.length ? (
        <div className="mt-8 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Bu kullanıcının izleme kaydı yok.
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {bySeries.map((s) => (
            <section key={s.sid}>
              <h2 className="mb-2 font-semibold">
                <Link href={`/admin/analytics/series/${s.sid}`} className="hover:text-orange-300">
                  {s.title}
                </Link>
                <span className="ml-2 text-xs font-normal text-zinc-500">{num(s.eps.length)} bölüm</span>
              </h2>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Bölüm</th>
                      <th className="px-4 py-2 text-right font-medium">İlerleme</th>
                      <th className="px-4 py-2 font-medium">Durum</th>
                      <th className="px-4 py-2 font-medium">Son izleme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {s.eps.map((e) => (
                      <tr key={e.episode_id}>
                        <td className="px-4 py-2">
                          <span className="text-zinc-500">
                            S{e.season_number} B{e.episode_number}
                          </span>{" "}
                          {e.episode_title}
                        </td>
                        <td className="px-4 py-2 text-right text-zinc-400">
                          {e.completed
                            ? duration(e.duration_seconds)
                            : `${duration(e.position_seconds)} / ${duration(e.duration_seconds)}`}
                          {!e.completed && e.duration_seconds ? (
                            <span className="ml-1 text-xs text-zinc-600">
                              ({pct(e.position_seconds, e.duration_seconds)})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <span className={e.completed ? "text-emerald-400" : "text-zinc-400"}>
                            {e.completed ? "Bitirdi" : "Yarım"}
                          </span>
                          {e.liked && <span className="ml-2 text-rose-300">♥ beğendi</span>}
                          {e.unlock_method && (
                            <span className="ml-2 text-amber-300">
                              {unlockLabels[e.unlock_method] ?? e.unlock_method} ile açtı
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-zinc-400">{dateTime(e.updated_at)}</td>
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
