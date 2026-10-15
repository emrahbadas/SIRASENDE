import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVideoSettings } from "@/lib/settings";
import { BatchUploader } from "./batch-uploader";

// Confirming a split creates one provider clip per episode (up to ~50 calls)
export const maxDuration = 300;

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Several videos at once: each is cut into episodes (or kept whole) and appended in order. */
export default async function BatchUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { id } = await params;
  const { season: seasonId } = await searchParams;
  if (!seasonId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS limits this to the creator's own productions
  const { data: season } = await supabase
    .from("seasons")
    .select("id, season_number, series!inner(id, title, status, production_id), episodes(id)")
    .eq("id", seasonId)
    .maybeSingle();
  const series = one(season?.series);
  if (!season || !series || series.production_id !== id) notFound();

  const { data: owns } = await supabase.rpc("owns_production", { p_production_id: id });
  if (!owns) notFound();

  const settings = await getVideoSettings(supabase);
  const maxMinutes = Math.floor(settings.maxEpisodeSeconds / 60);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/studio/productions/${id}`} className="text-sm text-zinc-500 hover:text-zinc-300">
        ← {series.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Toplu video yükle</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-400">
        Sezon {season.season_number} · Birden fazla videoyu seç; sırayla yüklenir. {maxMinutes} dakikadan uzun
        olanlar konuşmadaki duraklamalardan bölümlere ayrılır, kısalar tek bölüm olur. Bölümler sezonun sonuna,
        listedeki sırayla eklenir ({season.episodes?.length ?? 0} bölümden sonra). Bitince yapım sayfasından onaya
        gönderirsin.
      </p>

      {series.status === "blocked" ? (
        <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
          Platform tarafından durdurulan diziye bölüm eklenemez.
        </p>
      ) : (
        <BatchUploader
          seasonId={season.id}
          productionId={id}
          maxEpisodeSeconds={settings.maxEpisodeSeconds}
          targetSeconds={settings.splitTargetSeconds}
          maxSourceSeconds={settings.maxSplitSourceSeconds}
        />
      )}
    </main>
  );
}
