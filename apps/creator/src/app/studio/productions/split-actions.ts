"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StreamApiError, deleteVideo, getVideo } from "@/lib/cloudflare/stream";
import { applyStreamVideo } from "@/lib/video/sync";
import { executeSplit } from "@/lib/video/split";
import { getVideoSettings } from "@/lib/settings";

const EDITABLE_SERIES_STATUSES = ["draft", "rejected", "needs_changes"];

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface SplitJobState {
  id: string;
  status: string;
  durationSeconds: number | null;
  errorMessage: string | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Confirms the signed-in creator owns the season's production. */
async function requireOwnedSeason(seasonId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: season }, { data: creator }] = await Promise.all([
    supabase
      .from("seasons")
      .select("id, series!inner(id, status, production_id)")
      .eq("id", seasonId)
      .maybeSingle(),
    supabase.from("creator_profiles").select("id").eq("profile_id", user.id).maybeSingle(),
  ]);
  const series = one(season?.series);
  if (!season || !series || !creator) return null;

  const { data: owns } = await supabase.rpc("owns_production", {
    p_production_id: series.production_id,
  });
  if (!owns) return null;
  return { supabase, creatorId: creator.id as string, series };
}

async function requireOwnedJob(jobId: string) {
  const admin = createAdminClient();
  const { data: job } = await admin
    .from("video_split_jobs")
    .select("id, creator_id, season_id, provider_asset_id, status, duration_seconds, error_message")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;

  const owned = await requireOwnedSeason(job.season_id);
  if (!owned || owned.creatorId !== job.creator_id) return null;
  return { admin, job, ...owned };
}

const toState = (job: {
  id: string;
  status: string;
  duration_seconds: number | null;
  error_message: string | null;
}): SplitJobState => ({
  id: job.id,
  status: job.status,
  durationSeconds: job.duration_seconds,
  errorMessage: job.error_message,
});

export async function startSplitUpload(input: {
  seasonId: string;
  durationSeconds: number;
  fileSize: number;
}): Promise<Result<{ jobId: string }>> {
  const owned = await requireOwnedSeason(input.seasonId);
  if (!owned) return { ok: false, error: "Bu sezona video yükleme yetkin yok" };
  if (!EDITABLE_SERIES_STATUSES.includes(owned.series.status)) {
    return { ok: false, error: "İncelemedeki veya yayındaki diziye bölüm eklenemez" };
  }

  const settings = await getVideoSettings(owned.supabase);
  if (!(input.durationSeconds > 0) || !(input.fileSize > 0)) {
    return { ok: false, error: "Videonun süresi okunamadı" };
  }
  if (input.durationSeconds <= settings.maxEpisodeSeconds) {
    return { ok: false, error: "Bu video zaten tek bölüm uzunluğunda; normal yüklemeyi kullan" };
  }
  if (input.durationSeconds > settings.maxSplitSourceSeconds) {
    return {
      ok: false,
      error: `Bölünecek video en fazla ${Math.floor(settings.maxSplitSourceSeconds / 60)} dakika olabilir`,
    };
  }

  const admin = createAdminClient();
  const { data: job, error } = await admin
    .from("video_split_jobs")
    .insert({
      creator_id: owned.creatorId,
      season_id: input.seasonId,
      reserved_seconds: Math.ceil(input.durationSeconds) + 1,
    })
    .select("id")
    .single();

  if (error || !job) {
    if (error?.message.includes("storage_quota_exceeded")) {
      return {
        ok: false,
        error: "Depolama kotan bu video için yetersiz. Depolama planını yükseltmelisin.",
      };
    }
    return { ok: false, error: error?.message ?? "Yükleme başlatılamadı" };
  }
  return { ok: true, jobId: job.id };
}

/** Called by the browser once the tus upload finished. */
export async function markSplitUploaded(jobId: string): Promise<Result<{ job: SplitJobState }>> {
  const owned = await requireOwnedJob(jobId);
  if (!owned) return { ok: false, error: "Bölme işi bulunamadı" };
  await owned.admin
    .from("video_split_jobs")
    .update({ status: "processing" })
    .eq("id", jobId)
    .eq("status", "pending_upload");
  return refreshSplitJob(jobId);
}

/** Pulls provider state for the source (or, while splitting, for each clip). */
export async function refreshSplitJob(jobId: string): Promise<Result<{ job: SplitJobState }>> {
  const owned = await requireOwnedJob(jobId);
  if (!owned) return { ok: false, error: "Bölme işi bulunamadı" };
  const { admin, job } = owned;

  try {
    if (["pending_upload", "processing"].includes(job.status) && job.provider_asset_id) {
      await applyStreamVideo(admin, await getVideo(job.provider_asset_id));
    } else if (job.status === "splitting") {
      const { data: clips } = await admin
        .from("video_assets")
        .select("provider_asset_id")
        .eq("split_job_id", jobId)
        .not("status", "in", "(ready,deleted,failed)");
      for (const c of clips ?? []) {
        if (c.provider_asset_id) await applyStreamVideo(admin, await getVideo(c.provider_asset_id));
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof StreamApiError ? e.message : "Durum alınamadı" };
  }

  const { data: fresh } = await admin
    .from("video_split_jobs")
    .select("id, status, duration_seconds, error_message")
    .eq("id", jobId)
    .single();
  return { ok: true, job: toState(fresh!) };
}

/** Creates one clip + episode per segment between the confirmed cut points. */
export async function confirmSplit(
  jobId: string,
  cuts: number[]
): Promise<Result<{ productionId: string; episodes: number }>> {
  const owned = await requireOwnedJob(jobId);
  if (!owned) return { ok: false, error: "Bölme işi bulunamadı" };
  const { admin, job, series } = owned;

  if (!EDITABLE_SERIES_STATUSES.includes(series.status)) {
    return { ok: false, error: "İncelemedeki veya yayındaki diziye bölüm eklenemez" };
  }
  const settings = await getVideoSettings(owned.supabase);
  const result = await executeSplit(admin, job, cuts, settings.maxEpisodeSeconds);

  revalidatePath(`/studio/productions/${series.production_id}`);
  if (!result.ok) return result;
  return { ok: true, productionId: series.production_id, episodes: result.episodes };
}

export async function cancelSplitJob(jobId: string): Promise<Result> {
  const owned = await requireOwnedJob(jobId);
  if (!owned) return { ok: false, error: "Bölme işi bulunamadı" };

  const { data: canceled } = await owned.admin
    .from("video_split_jobs")
    .update({ status: "canceled" })
    .eq("id", jobId)
    .in("status", ["pending_upload", "processing", "ready"])
    .select("provider_asset_id")
    .maybeSingle();
  if (!canceled) return { ok: false, error: "Bu iş artık iptal edilemez" };

  if (canceled.provider_asset_id) await deleteVideo(canceled.provider_asset_id).catch(() => undefined);
  revalidatePath(`/studio/productions/${owned.series.production_id}`);
  return { ok: true };
}
