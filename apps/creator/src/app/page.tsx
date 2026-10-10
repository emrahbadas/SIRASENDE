import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: categories }, { data: seriesList }] = await Promise.all([
    supabase.from("categories").select("slug, name_tr").order("name_tr"),
    supabase
      .from("series")
      .select(
        "id, title, description, poster_url, primary_language, productions(production_type, age_rating, production_categories(categories(slug)))"
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

  return (
    <main className="min-h-screen">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold">
            <span className="text-rose-500">Sıra</span> Sende
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user ? (
              <Link
                href="/studio"
                className="rounded-lg bg-rose-600 px-4 py-2 font-medium transition hover:bg-rose-500"
              >
                Creator Studio
              </Link>
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
              <Link
                key={s.id}
                href={`/series/${s.id}`}
                className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 transition hover:border-rose-500/50"
              >
                <div className="flex aspect-9/13 items-center justify-center bg-linear-to-br from-zinc-900 to-zinc-950">
                  {s.poster_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.poster_url} alt={s.title} className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-4 text-center text-lg font-bold text-zinc-700 transition group-hover:text-rose-500/70">
                      {s.title}
                    </span>
                  )}
                </div>
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
