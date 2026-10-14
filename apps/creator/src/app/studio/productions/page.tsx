import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { productionTypeLabel } from "@/lib/labels";

const statusLabels: Record<string, string> = {
  draft: "Taslak",
  published: "Yayında",
  processing: "İşleniyor",
  blocked: "Engellendi",
};

export default async function ProductionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: creator } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!creator) redirect("/onboarding");

  const { data: productions } = await supabase
    .from("productions")
    .select("id, title, production_type, created_at, series(id, title, status)")
    .eq("creator_id", creator.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/studio" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-bold">My Productions</h1>
        </div>
        <Link
          href="/studio/productions/new"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium transition hover:bg-orange-500"
        >
          + Yeni Production
        </Link>
      </header>

      {!productions?.length ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center">
          <p className="text-zinc-400">Henüz production oluşturmadın.</p>
          <p className="mt-1 text-sm text-zinc-500">
            İlk dizini oluştur, bölümlerini yükle, yayınla.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {productions.map((p) => {
            const series = p.series?.[0];
            return (
              <li key={p.id}>
                <Link
                  href={`/studio/productions/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-orange-500/50"
                >
                  <div>
                    <h2 className="font-semibold">{p.title}</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {productionTypeLabel(p.production_type)} ·{" "}
                      {new Date(p.created_at).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                  {series && (
                    <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400">
                      {statusLabels[series.status] ?? series.status}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
