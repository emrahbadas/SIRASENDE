import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { closeReport } from "../actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const REPORT_REASONS: Record<string, string> = {
  sexual: "Cinsel / müstehcen",
  violence: "Şiddet",
  hate: "Nefret söylemi",
  harassment: "Taciz / zorbalık",
  copyright: "Telif ihlali",
  misleading: "Yanıltıcı / dolandırıcılık",
  other: "Diğer",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; all?: string }>;
}) {
  const { error, all } = await searchParams;
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

  let query = supabase
    .from("content_reports")
    .select("id, reason, note, status, created_at, series_id, episode_id, series(title, status), episodes(episode_number, title)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!all) query = query.eq("status", "open");
  const { data: reports } = await query;

  // Reports per series (open), to spot content reported by many viewers
  const counts = new Map<string, number>();
  for (const r of reports ?? []) if (r.status === "open") counts.set(r.series_id, (counts.get(r.series_id) ?? 0) + 1);
  const returnTo = all ? "/admin/reports?all=1" : "/admin/reports";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">İçerik bildirimleri</h1>
      <p className="mt-1 text-sm text-zinc-500">
        İzleyicilerin uygulamadan bildirdiği diziler ve bölümler. İçeriği izleyip gerekirse yayından kaldır, sonra bildirimi
        kapat.
      </p>

      <nav className="mt-6 flex gap-2">
        <Link
          href="/admin/reports"
          className={`rounded-full border px-3 py-1 text-sm ${!all ? "border-orange-600 bg-orange-950/40 text-orange-200" : "border-zinc-800 text-zinc-400"}`}
        >
          Açık
        </Link>
        <Link
          href="/admin/reports?all=1"
          className={`rounded-full border px-3 py-1 text-sm ${all ? "border-orange-600 bg-orange-950/40 text-orange-200" : "border-zinc-800 text-zinc-400"}`}
        >
          Tümü
        </Link>
      </nav>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {!reports?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          {all ? "Henüz bildirim yok." : "Açık bildirim yok. 🎉"}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {reports.map((r) => {
            const series = one(r.series);
            const episode = one(r.episodes);
            const many = (counts.get(r.series_id) ?? 0) > 1;
            return (
              <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {series?.title ?? "Silinmiş dizi"}
                      {episode && <span className="text-sm font-normal text-zinc-400">· Bölüm {episode.episode_number}</span>}
                      <span className="rounded-full border border-rose-800 px-2 py-0.5 text-xs font-normal text-rose-300">
                        {REPORT_REASONS[r.reason] ?? r.reason}
                      </span>
                      {many && (
                        <span className="rounded-full border border-amber-800 px-2 py-0.5 text-xs font-normal text-amber-300">
                          {counts.get(r.series_id)} açık bildirim
                        </span>
                      )}
                      {r.status !== "open" && (
                        <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs font-normal text-zinc-400">
                          {r.status === "resolved" ? "Çözüldü" : "Geçersiz"}
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleString("tr-TR")} · dizi durumu: {series?.status ?? "—"}
                    </p>
                    {r.note && <p className="mt-2 text-sm text-zinc-300">“{r.note}”</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/review/${r.series_id}${r.episode_id ? `?ep=${r.episode_id}` : ""}`}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
                    >
                      ▶ İzle / yönet
                    </Link>
                    {r.status === "open" && (
                      <>
                        <form action={closeReport}>
                          <input type="hidden" name="report_id" value={r.id} />
                          <input type="hidden" name="status" value="resolved" />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <button className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-950">
                            Çözüldü
                          </button>
                        </form>
                        <form action={closeReport}>
                          <input type="hidden" name="report_id" value={r.id} />
                          <input type="hidden" name="status" value="dismissed" />
                          <input type="hidden" name="return_to" value={returnTo} />
                          <button className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-500">
                            Geçersiz
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
