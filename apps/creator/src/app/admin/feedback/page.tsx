import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const kinds: Record<string, { label: string; cls: string }> = {
  feedback: { label: "Öneri", cls: "border-sky-800 text-sky-300" },
  bug: { label: "Hata", cls: "border-amber-800 text-amber-300" },
  content: { label: "İçerik bildirimi", cls: "border-rose-800 text-rose-300" },
};

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  let query = supabase
    .from("feedback")
    .select("id, kind, message, app_version, platform, created_at, profiles(username, display_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (kind && kinds[kind]) query = query.eq("kind", kind);
  const { data: items } = await query;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Geri bildirimler</h1>
      <p className="mt-1 text-sm text-zinc-500">Uygulamadaki Profil → Geri bildirim gönder formundan gelenler.</p>

      <nav className="mt-6 flex flex-wrap gap-2">
        {[{ key: "", label: "Tümü" }, ...Object.entries(kinds).map(([key, v]) => ({ key, label: v.label }))].map((f) => {
          const active = (kind ?? "") === f.key;
          return (
            <Link
              key={f.key}
              href={f.key ? `/admin/feedback?kind=${f.key}` : "/admin/feedback"}
              className={`rounded-full border px-3 py-1 text-sm ${
                active ? "border-orange-600 bg-orange-950/40 text-orange-200" : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {!items?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Henüz geri bildirim yok.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((f) => {
            const k = kinds[f.kind] ?? { label: f.kind, cls: "border-zinc-700 text-zinc-400" };
            const who = one(f.profiles);
            return (
              <li key={f.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className={`rounded-full border px-2 py-0.5 ${k.cls}`}>{k.label}</span>
                  <span>{who?.display_name || (who?.username ? `@${who.username}` : "—")}</span>
                  <span>· {new Date(f.created_at).toLocaleString("tr-TR")}</span>
                  {f.platform && (
                    <span>
                      · {f.platform} {f.app_version}
                    </span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{f.message}</p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
