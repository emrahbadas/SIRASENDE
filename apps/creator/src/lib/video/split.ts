import type { SupabaseClient } from "@supabase/supabase-js";
import { createClip, deleteVideo } from "@/lib/cloudflare/stream";
import { segmentsFromCuts, validateCuts } from "@/lib/video/cuts";

export interface SplitJobRow {
  id: string;
  season_id: string;
  status: string;
  duration_seconds: number | null;
  provider_asset_id: string | null;
}

type SplitResult = { ok: true; episodes: number } | { ok: false; error: string };

/**
 * Turns a processed split source into episodes: one provider clip, episode and
 * asset per segment, appended to the season. Callers check ownership first.
 */
export async function executeSplit(
  admin: SupabaseClient,
  job: SplitJobRow,
  cuts: number[],
  maxEpisodeSeconds: number
): Promise<SplitResult> {
  if (job.status !== "ready" || !job.duration_seconds || !job.provider_asset_id) {
    return { ok: false, error: "Video henüz işleniyor, biraz bekle" };
  }
  const invalid = validateCuts(cuts, job.duration_seconds, maxEpisodeSeconds);
  if (invalid) return { ok: false, error: invalid };

  // Claim the job (also releases the source's quota reservation to the clips)
  const { data: claimed } = await admin
    .from("video_split_jobs")
    .update({ status: "splitting", cut_points: [...cuts].sort((a, b) => a - b) })
    .eq("id", job.id)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: "Bu video zaten bölünüyor" };

  const { data: last } = await admin
    .from("episodes")
    .select("episode_number")
    .eq("season_id", job.season_id)
    .order("episode_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextNumber = (last?.episode_number ?? 0) + 1;

  const segments = segmentsFromCuts(cuts, job.duration_seconds);
  let created = 0;
  try {
    for (const seg of segments) {
      const { data: episode, error: epErr } = await admin
        .from("episodes")
        .insert({ season_id: job.season_id, episode_number: nextNumber, title: `Bölüm ${nextNumber}` })
        .select("id")
        .single();
      if (epErr || !episode) throw new Error(epErr?.message ?? "Bölüm oluşturulamadı");

      const clip = await createClip({
        sourceUid: job.provider_asset_id,
        startSeconds: seg.start,
        endSeconds: seg.end,
        meta: { split_job_id: job.id, episode_id: episode.id },
      });

      const { error: assetErr } = await admin.from("video_assets").insert({
        episode_id: episode.id,
        provider: "cloudflare_stream",
        provider_asset_id: clip.uid,
        status: "processing",
        reserved_seconds: seg.end - seg.start,
        split_job_id: job.id,
      });
      if (assetErr) throw new Error(assetErr.message);

      created++;
      nextNumber++;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bölme başarısız";
    await admin
      .from("video_split_jobs")
      .update({
        status: "failed",
        error_message: `Bölme yarıda kaldı (${created}/${segments.length} bölüm oluşturuldu): ${message}`,
      })
      .eq("id", job.id);
    await deleteVideo(job.provider_asset_id).catch(() => undefined);
    return { ok: false, error: `Bölme yarıda kaldı: ${created}/${segments.length} bölüm oluşturuldu` };
  }

  return { ok: true, episodes: created };
}
