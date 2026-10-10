import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { approveSeries, rejectSeries, requestChanges } from "./actions";

const warningLabels: Record<string, string> = {
  violence: "Şiddet",
  fear: "Korku",
  profanity: "Argo/Küfür",
  sensitive_themes: "Hassas temalar",
  substance_use: "Madde kullanımı",
};

// PostgREST to-one relations are inferred as arrays without generated DB types
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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

  const { data: pending } = await supabase
    .from("series")
    .select(
      "id, title, description, primary_language, updated_at, productions(title, production_type, age_rating, content_warnings, creator_profiles(creator_name), production_categories(categories(name_tr))), seasons(episodes(id))"
    )
    .eq("status", "moderating")
    .order("updated_at", { ascending: true });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← Vitrin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Moderasyon Kuyruğu</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Onaylanan diziler vitrine çıkar; reddedilenler taslağa döner. Moderatörler tüm
          bölümleri reklam ve kilit engeline takılmadan izler (video önizleme Phase 3&apos;te
          aktifleşecek).
        </p>
      </header>

      {error && (
        <p className="mb-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {!pending?.length ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          İncelenecek içerik yok. 🎉
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((s) => {
            const episodeCount = (s.seasons ?? []).reduce(
              (sum, se) => sum + se.episodes.length,
              0
            );
            const production = one(s.productions);
            const creatorName = one(production?.creator_profiles)?.creator_name;
            const categoryName = one(
              one(production?.production_categories)?.categories
            )?.name_tr;
            return (
              <li
                key={s.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div>
                  <h2 className="font-semibold">{s.title}</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {creatorName} · {production?.production_type} ·{" "}
                    {s.primary_language.toUpperCase()} · {episodeCount} bölüm
                    {categoryName && <> · {categoryName}</>}
                    {production?.age_rating && (
                      <span className="ml-2 rounded border border-amber-700 px-1.5 py-0.5 text-xs text-amber-400">
                        {production.age_rating}
                      </span>
                    )}
                  </p>
                  {(production?.content_warnings?.length ?? 0) > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {production!.content_warnings.map((w: string) => (
                        <span
                          key={w}
                          className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400"
                        >
                          {warningLabels[w] ?? w}
                        </span>
                      ))}
                    </p>
                  )}
                  {s.description && (
                    <p className="mt-2 text-sm text-zinc-400">{s.description}</p>
                  )}
                </div>

                <form className="mt-4 space-y-3" action={approveSeries}>
                  <input type="hidden" name="series_id" value={s.id} />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Red / düzeltme notu — creator bu notu görecek (onayda boş bırakılabilir)"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium transition hover:bg-emerald-500"
                    >
                      Onayla
                    </button>
                    <button
                      type="submit"
                      formAction={requestChanges}
                      className="rounded-lg border border-sky-800 px-4 py-2 text-sm text-sky-400 transition hover:bg-sky-950"
                    >
                      Düzeltme iste
                    </button>
                    <button
                      type="submit"
                      formAction={rejectSeries}
                      className="rounded-lg border border-rose-800 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-950"
                    >
                      Reddet
                    </button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
