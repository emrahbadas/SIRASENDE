import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { adminDeleteProduction, setSeriesBlocked } from "../actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const statusLabels: Record<string, { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "border-zinc-700 text-zinc-400" },
  moderating: { label: "İncelemede", cls: "border-sky-700 text-sky-400" },
  rejected: { label: "Reddedildi", cls: "border-rose-700 text-rose-400" },
  needs_changes: { label: "Düzeltme bekliyor", cls: "border-amber-700 text-amber-400" },
  published: { label: "Yayında", cls: "border-emerald-600 text-emerald-300" },
  paused: { label: "Creator durdurdu", cls: "border-zinc-600 text-zinc-300" },
  blocked: { label: "Yayından kaldırıldı", cls: "border-rose-700 text-rose-400" },
};

const filters = [
  { key: "", label: "Tümü" },
  { key: "published", label: "Yayında" },
  { key: "moderating", label: "İncelemede" },
  { key: "paused", label: "Durdurulan" },
  { key: "blocked", label: "Kaldırılan" },
  { key: "draft", label: "Taslak" },
];

export default async function AdminProductionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
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
  const isAdmin = roles.some((r) => r.role === "admin");

  let query = supabase
    .from("series")
    .select(
      "id, title, status, moderation_note, updated_at, production_id, productions!inner(title, deleted_at, creator_profiles(creator_name)), seasons(episodes(id, status))"
    )
    .is("deleted_at", null)
    .is("productions.deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status && statusLabels[status]) query = query.eq("status", status);
  const { data: series } = await query;

  const returnTo = `/admin/productions${status ? `?status=${status}` : ""}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Tüm yapımlar</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Yayından kaldırılan dizi izleyicilere görünmez ve creator tekrar yayına alamaz; yalnızca platform geri
        alabilir. Silme videoları kalıcı olarak kaldırır.
      </p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = (status ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={f.key ? `/admin/productions?status=${f.key}` : "/admin/productions"}
              className={`rounded-full border px-3 py-1 text-sm ${
                active ? "border-rose-600 bg-rose-950/40 text-rose-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {!series?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Bu filtrede yapım yok.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {series.map((s) => {
            const production = one(s.productions);
            const episodes = (s.seasons ?? []).flatMap((se) => se.episodes);
            const live = episodes.filter((e) => e.status === "published").length;
            const st = statusLabels[s.status] ?? { label: s.status, cls: "border-zinc-700 text-zinc-400" };
            const canBlock = ["published", "paused", "moderating"].includes(s.status);
            return (
              <li key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {s.title}
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-normal ${st.cls}`}>{st.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {one(production?.creator_profiles)?.creator_name} · {episodes.length} bölüm ({live} yayında)
                    </p>
                    {s.status === "blocked" && s.moderation_note && (
                      <p className="mt-1 text-xs text-rose-300/80">Not: {s.moderation_note}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/review/${s.id}`}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
                    >
                      ▶ İzle / yönet
                    </Link>
                    {canBlock && (
                      <form action={setSeriesBlocked} className="flex items-center gap-2">
                        <input type="hidden" name="series_id" value={s.id} />
                        <input type="hidden" name="block" value="1" />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <input
                          name="note"
                          placeholder="Sebep (creator görür)"
                          className="w-40 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-rose-500"
                        />
                        <ConfirmSubmit
                          message={`"${s.title}" yayından kaldırılsın mı? Creator tekrar yayına alamaz.`}
                          className="rounded-lg border border-amber-800 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-950"
                        >
                          Yayından kaldır
                        </ConfirmSubmit>
                      </form>
                    )}
                    {s.status === "blocked" && (
                      <form action={setSeriesBlocked}>
                        <input type="hidden" name="series_id" value={s.id} />
                        <input type="hidden" name="block" value="0" />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <button
                          type="submit"
                          className="rounded-lg border border-emerald-800 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-950"
                        >
                          Yayına geri al
                        </button>
                      </form>
                    )}
                    {isAdmin && (
                      <form action={adminDeleteProduction}>
                        <input type="hidden" name="production_id" value={s.production_id} />
                        <input type="hidden" name="return_to" value={returnTo} />
                        <ConfirmSubmit
                          message={`"${s.title}" ve tüm videoları kalıcı olarak silinecek. Geri alınamaz. Emin misin?`}
                          className="rounded-lg border border-rose-800 px-3 py-1.5 text-sm text-rose-400 hover:bg-rose-950"
                        >
                          Sil
                        </ConfirmSubmit>
                      </form>
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
