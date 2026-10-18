import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ModerationForm } from "./moderation-form";
import { productionTypeLabel } from "@/lib/labels";

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

  // New series under review, plus published series with new episodes to review
  const [{ data: newSeries }, { data: newEpisodes }, { count: openReports }] = await Promise.all([
    supabase.from("series").select("id").eq("status", "moderating").is("deleted_at", null),
    supabase.from("episodes").select("seasons!inner(series_id)").eq("status", "moderating"),
    supabase.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const ids = [
    ...new Set([
      ...(newSeries ?? []).map((s) => s.id),
      ...(newEpisodes ?? []).map((e) => one(e.seasons)!.series_id as string),
    ]),
  ];

  const { data: pending } = ids.length
    ? await supabase
        .from("series")
        .select(
          "id, title, description, status, primary_language, updated_at, productions(title, production_type, age_rating, content_warnings, creator_profiles(creator_name), production_categories(categories(name_tr))), seasons(episodes(id, status))"
        )
        .in("id", ids)
        .is("deleted_at", null)
        .order("updated_at", { ascending: true })
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
            ← Vitrin
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            <Link
              href="/admin/reports"
              className={`rounded-lg border px-3 py-1.5 text-sm hover:border-zinc-600 ${
                openReports ? "border-rose-800 text-rose-300" : "border-zinc-800 text-zinc-300"
              }`}
            >
              Bildirimler{openReports ? ` (${openReports})` : ""} →
            </Link>
            <Link
              href="/admin/analytics"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Analitik →
            </Link>
            <Link
              href="/admin/creators"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Creator&apos;lar →
            </Link>
            <Link
              href="/admin/campaigns"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Kampanyalar →
            </Link>
            <Link
              href="/admin/feedback"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Geri bildirim →
            </Link>
            <Link
              href="/admin/statements"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Hakediş →
            </Link>
            <Link
              href="/admin/payouts"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Ödemeler →
            </Link>
            <Link
              href="/admin/productions"
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              Tüm yapımlar →
            </Link>
          </div>
        </div>
        <h1 className="mt-1 text-2xl font-bold">Moderasyon Kuyruğu</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Yeni diziler ve yayındaki dizilere eklenen yeni bölümler burada. Onaylanan içerik vitrine
          çıkar; reddedilen veya düzeltme istenen creator&apos;a notla döner.
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
            const episodes = (s.seasons ?? []).flatMap((se) => se.episodes);
            const episodeCount = episodes.length;
            const reviewCount = episodes.filter((e) => e.status === "moderating").length;
            const isNew = s.status === "moderating";
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
                  <h2 className="flex items-center gap-2 font-semibold">
                    {s.title}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-normal ${
                        isNew ? "border-sky-800 text-sky-300" : "border-emerald-800 text-emerald-300"
                      }`}
                    >
                      {isNew ? "Yeni dizi" : `Yayında · ${reviewCount} yeni bölüm`}
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {creatorName} · {productionTypeLabel(production?.production_type)} ·{" "}
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

                <div className="mt-4 flex items-center gap-3">
                  <Link
                    href={`/admin/review/${s.id}`}
                    className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-white"
                  >
                    ▶ Bölümleri izle ve incele
                  </Link>
                  <span className="text-xs text-zinc-500">Onaydan önce tüm bölümleri izle.</span>
                </div>

                <div className="mt-4">
                  <ModerationForm seriesId={s.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
