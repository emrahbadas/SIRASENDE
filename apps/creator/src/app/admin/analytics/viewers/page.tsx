import Link from "next/link";
import { AnalyticsNav, ErrorNote, dateTime, num, requireAdmin } from "../shared";

type Viewer = {
  profile_id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  joined_at: string;
  last_watched_at: string | null;
  series_count: number;
  episodes_started: number;
  episodes_completed: number;
  unlocks: number;
  is_reviewer: boolean;
};

export default async function AdminViewersPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const supabase = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_viewers");
  const everyone = (data ?? []) as Viewer[];
  const viewers = all ? everyone : everyone.filter((v) => v.last_watched_at);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Analitik</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Giriş yapmış kullanıcıların izleme kaydı (yalnızca admin görür; creator&apos;lar sadece toplam sayıları görür).
      </p>

      <AnalyticsNav active="viewers" />
      <ErrorNote message={error?.message} />

      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          {num(everyone.filter((v) => v.last_watched_at).length)} izleyici · {num(everyone.length)} kayıtlı kullanıcı
        </span>
        <Link
          href={all ? "/admin/analytics/viewers" : "/admin/analytics/viewers?all=1"}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          {all ? "Sadece izleyenler" : "Hiç izlemeyenleri de göster"}
        </Link>
      </div>

      {!viewers.length ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Henüz izleme kaydı yok.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">Kullanıcı</th>
                <th className="px-4 py-2 font-medium">Üyelik</th>
                <th className="px-4 py-2 font-medium">Son izleme</th>
                <th className="px-4 py-2 text-right font-medium">Yapım</th>
                <th className="px-4 py-2 text-right font-medium">Başlanan bölüm</th>
                <th className="px-4 py-2 text-right font-medium">Biten</th>
                <th className="px-4 py-2 text-right font-medium">Kilit açma</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {viewers.map((v) => (
                <tr key={v.profile_id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-2">
                    <Link href={`/admin/analytics/viewers/${v.profile_id}`} className="font-medium hover:text-orange-300">
                      {v.display_name || v.username}
                    </Link>
                    {v.is_reviewer && (
                      <span className="ml-2 rounded-full border border-sky-800 px-2 py-0.5 text-xs text-sky-300">
                        Play inceleme
                      </span>
                    )}
                    <p className="text-xs text-zinc-500">
                      @{v.username}
                      {v.email && <> · {v.email}</>}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{dateTime(v.joined_at)}</td>
                  <td className="px-4 py-2 text-zinc-400">{dateTime(v.last_watched_at)}</td>
                  <td className="px-4 py-2 text-right">{num(v.series_count)}</td>
                  <td className="px-4 py-2 text-right">{num(v.episodes_started)}</td>
                  <td className="px-4 py-2 text-right">{num(v.episodes_completed)}</td>
                  <td className="px-4 py-2 text-right">{num(v.unlocks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
