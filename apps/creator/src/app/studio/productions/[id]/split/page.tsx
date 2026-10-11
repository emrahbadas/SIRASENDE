import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVideoSettings } from "@/lib/settings";
import { SplitEditor } from "./split-editor";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function SplitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string; job?: string }>;
}) {
  const { id } = await params;
  const { season: seasonId, job: jobId } = await searchParams;
  if (!seasonId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS limits this to the creator's own productions
  const { data: season } = await supabase
    .from("seasons")
    .select("id, season_number, series!inner(id, title, status, production_id)")
    .eq("id", seasonId)
    .maybeSingle();
  const series = one(season?.series);
  if (!season || !series || series.production_id !== id) notFound();

  const { data: owns } = await supabase.rpc("owns_production", { p_production_id: id });
  if (!owns) notFound();

  const settings = await getVideoSettings(supabase);

  const { data: job } = jobId
    ? await supabase
        .from("video_split_jobs")
        .select("id, status, duration_seconds, reserved_seconds, error_message")
        .eq("id", jobId)
        .eq("season_id", seasonId)
        .in("status", ["processing", "ready"])
        .maybeSingle()
    : { data: null };

  const editable = ["draft", "rejected", "needs_changes"].includes(series.status);
  const maxMinutes = Math.floor(settings.maxEpisodeSeconds / 60);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href={`/studio/productions/${id}`} className="text-sm text-zinc-500 hover:text-zinc-300">
        ← {series.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Uzun videoyu bölümlere ayır</h1>
      <p className="mt-2 mb-8 text-sm text-zinc-400">
        Sezon {season.season_number} · Her bölüm en fazla {maxMinutes} dakika olabilir; böylece her
        bölüm geçişinde reklam gösterilir. Kesimler konuşmadaki duraklamalara yerleştirilir, istersen
        kaydırabilirsin. Oluşan bölümler sezonun sonuna eklenir.
      </p>

      {editable ? (
        <SplitEditor
          seasonId={season.id}
          productionId={id}
          maxEpisodeSeconds={settings.maxEpisodeSeconds}
          targetSeconds={settings.splitTargetSeconds}
          resumeJob={
            job
              ? {
                  id: job.id,
                  status: job.status,
                  durationSeconds: job.duration_seconds ?? job.reserved_seconds - 1,
                  errorMessage: job.error_message,
                }
              : null
          }
        />
      ) : (
        <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-400">
          İncelemedeki veya yayındaki diziye bölüm eklenemez.
        </p>
      )}
    </main>
  );
}
