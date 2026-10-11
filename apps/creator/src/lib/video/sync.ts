import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteVideo, type StreamVideo } from "@/lib/cloudflare/stream";

// Uploads that never arrive within this window release their reserved quota.
const ABANDONED_UPLOAD_MS = 2 * 60 * 60 * 1000;

function toAssetStatus(video: StreamVideo) {
  if (video.readyToStream || video.status.state === "ready") return "ready";
  if (video.status.state === "error") return "failed";
  if (video.status.state === "pendingupload") return "pending_upload";
  return "processing";
}

const isAbandoned = (createdAt: string) =>
  Date.now() - new Date(createdAt).getTime() > ABANDONED_UPLOAD_MS;

/**
 * Applies the provider's view of a video to whichever row owns it (an episode
 * asset or a split source). Idempotent, so the webhook and the manual
 * "refresh" in the studio can both call it.
 */
export async function applyStreamVideo(admin: SupabaseClient, video: StreamVideo) {
  const asset = await applyToEpisodeAsset(admin, video);
  if (asset) return asset;
  return applyToSplitSource(admin, video);
}

async function applyToEpisodeAsset(admin: SupabaseClient, video: StreamVideo) {
  const { data: asset } = await admin
    .from("video_assets")
    .select("id, episode_id, status, created_at, split_job_id")
    .eq("provider", "cloudflare_stream")
    .eq("provider_asset_id", video.uid)
    .maybeSingle();

  // Unknown or replaced assets are ignored (deleted ones stay deleted)
  if (!asset || asset.status === "deleted") return null;

  let status = toAssetStatus(video);
  let errorMessage: string | null =
    status === "failed" ? (video.status.errorReasonText ?? "Video işlenemedi") : null;

  if (status === "pending_upload" && isAbandoned(asset.created_at)) {
    status = "failed";
    errorMessage = "Yükleme tamamlanmadı";
  }

  const duration = video.duration > 0 ? Math.ceil(video.duration) : null;
  const dims =
    video.input && video.input.width > 0 && video.input.height > 0
      ? { width: video.input.width, height: video.input.height }
      : {};

  const { error } = await admin
    .from("video_assets")
    .update({
      status,
      error_message: errorMessage,
      ...(status === "ready" && duration ? { duration_seconds: duration } : {}),
      ...(status === "ready" ? dims : {}),
    })
    .eq("id", asset.id);
  if (error) throw error;

  if (status === "ready" && duration) {
    await admin.from("episodes").update({ duration_seconds: duration }).eq("id", asset.episode_id);
  }

  if (status === "ready" && asset.split_job_id) {
    await completeSplitJobIfDone(admin, asset.split_job_id);
  }

  return { assetId: asset.id, episodeId: asset.episode_id, status };
}

async function applyToSplitSource(admin: SupabaseClient, video: StreamVideo) {
  const { data: job } = await admin
    .from("video_split_jobs")
    .select("id, status, created_at")
    .eq("provider", "cloudflare_stream")
    .eq("provider_asset_id", video.uid)
    .maybeSingle();

  // Only jobs still waiting on the source are updated
  if (!job || !["pending_upload", "processing"].includes(job.status)) {
    return job ? { jobId: job.id, status: job.status } : null;
  }

  let status = toAssetStatus(video) as string;
  let errorMessage: string | null =
    status === "failed" ? (video.status.errorReasonText ?? "Video işlenemedi") : null;
  if (status === "pending_upload") {
    status = isAbandoned(job.created_at) ? "failed" : job.status;
    if (status === "failed") errorMessage = "Yükleme tamamlanmadı";
  }

  const duration = video.duration > 0 ? Math.floor(video.duration) : null;
  await admin
    .from("video_split_jobs")
    .update({
      status,
      error_message: errorMessage,
      ...(status === "ready" && duration ? { duration_seconds: duration } : {}),
    })
    .eq("id", job.id)
    .in("status", ["pending_upload", "processing"]);

  if (status === "failed") await deleteVideo(video.uid).catch(() => undefined);
  return { jobId: job.id, status };
}

/** Once every clip of a split job is ready, the long source video is deleted. */
async function completeSplitJobIfDone(admin: SupabaseClient, jobId: string) {
  const { data: pending } = await admin
    .from("video_assets")
    .select("id")
    .eq("split_job_id", jobId)
    .not("status", "in", "(ready,deleted)")
    .limit(1);
  if (pending?.length) return;

  const { data: job } = await admin
    .from("video_split_jobs")
    .update({ status: "completed" })
    .eq("id", jobId)
    .eq("status", "splitting")
    .select("provider_asset_id")
    .maybeSingle();

  if (job?.provider_asset_id) await deleteVideo(job.provider_asset_id).catch(() => undefined);
}
