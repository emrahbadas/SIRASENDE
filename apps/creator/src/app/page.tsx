import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSeriesCovers } from "@/lib/video/covers";
import { SeriesCard } from "./series-card";

export const dynamic = "force-dynamic";

// PostgREST to-one relations are inferred as arrays without generated DB types
const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: creatorProfile } = user
    ? await supabase
        .from("creator_profiles")
        .select("id")
        .eq("profile_id", user.id)
        .maybeSingle()
    : { data: null };

  const { data: staffRoles } = user
    ? await supabase
        .from("user_roles")
        .select("role")
        .eq("profile_id", user.id)
        .in("role", ["admin", "moderator"])
    : { data: null };
  const isStaff = (staffRoles?.length ?? 0) > 0;

  // Moderators can read series under review (series_moderation_read)
  const { count: pendingReview } = isStaff
    ? await supabase
        .from("series")
        .select("id", { count: "exact", head: true })
        .eq("status", "moderating")
    : { count: 0 };

  const [{ data: categories }, { data: seriesList }] = await Promise.all([
    supabase.from("categories").select("slug, name_tr").order("name_tr"),
    supabase
      .from("series")
      .select(
        "id, title, description, poster_url, primary_language, free_episode_count, productions(production_type, age_rating, production_categories(categories(slug)))"
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const filtered = (seriesList ?? []).filter((s) => {
    if (!category) return true;
    const slugs =
      one(s.productions)?.production_categories?.map((pc) => one(pc.categories)?.slug) ?? [];
    return slugs.includes(category);
  });

  // Video assets are not public; covers only use episodes inside the free window
  const covers = await getSeriesCovers(createAdminClient(), filtered);

  return (
    <main className="min-h-screen">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold">
            <span className="text-rose-500">Sıra</span> Sende
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                {isStaff && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-zinc-300 transition hover:border-zinc-500"
                  >
                    Admin
                    {(pendingReview ?? 0) > 0 && (
                      <span className="rounded-full bg-sky-600 px-1.5 text-xs font-semibold text-white">
                        {pendingReview}
                      </span>
                    )}
                  </Link>
                )}
                {creatorProfile ? (
                  <Link
                    href="/studio"
                    className="rounded-lg bg-rose-600 px-4 py-2 font-medium transition hover:bg-rose-500"
                  >
                    Creator Studio
                  </Link>
                ) : (
                  <Link
                    href="/onboarding"
                    className="rounded-lg border border-rose-600/60 px-4 py-2 font-medium text-rose-400 transition hover:bg-rose-600/10"
                  >
                    Creator Ol
                  </Link>
                )}
                <form action={logout}>
                  <button
                    type="submit"
                    className="text-zinc-400 transition hover:text-zinc-200"
                  >
                    Çıkış
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className="text-zinc-400 transition hover:text-zinc-200">
                  Giriş yap
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-rose-600 px-4 py-2 font-medium transition hover:bg-rose-500"
                >
                  Üye ol
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">İzledin. Şimdi sıra sende.</h1>
        <p className="mt-2 text-zinc-400">
          Kısa dikey diziler — bölüm bölüm izle, hikâyeni üret, yayınla, kazan.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/"
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              !category
                ? "border-rose-500 bg-rose-500/10 text-rose-300"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            Tümü
          </Link>
          {(categories ?? []).map((c) => (
            <Link
              key={c.slug}
              href={`/?category=${c.slug}`}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                category === c.slug
                  ? "border-rose-500 bg-rose-500/10 text-rose-300"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {c.name_tr}
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-12 rounded-xl border border-dashed border-zinc-800 p-16 text-center">
            <p className="text-zinc-400">Bu kategoride henüz yayında dizi yok.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Creator mısın?{" "}
              <Link href="/signup" className="text-rose-400 hover:underline">
                İlk dizini sen yayınla.
              </Link>
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {filtered.map((s) => (
              <SeriesCard
                key={s.id}
                href={`/series/${s.id}`}
                title={s.title}
                poster={s.poster_url ?? covers.get(s.id)?.thumbnail ?? null}
                preview={covers.get(s.id)?.preview ?? null}
              >
                <div className="p-4">
                  <h2 className="font-semibold">{s.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{s.description}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs uppercase text-zinc-600">
                    <span>
                      {s.primary_language} · {one(s.productions)?.production_type}
                    </span>
                    {one(s.productions)?.age_rating && (
                      <span className="rounded border border-amber-700/60 px-1.5 py-0.5 text-amber-400">
                        {one(s.productions)?.age_rating}
                      </span>
                    )}
                  </p>
                </div>
              </SeriesCard>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
