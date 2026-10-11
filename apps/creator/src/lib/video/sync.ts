import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreamVideo } from "@/lib/cloudflare/stream";

// Uploads that never arrive within this window release their reserved quota.
const ABANDONED_UPLOAD_MS = 2 * 60 * 60 * 1000;

function toAssetStatus(video: StreamVideo) {
  if (video.readyToStream || video.status.state === "ready") return "ready";
  if (video.status.state === "error") return "failed";
  if (video.status.state === "pendingupload") return "pending_upload";
  return "processing";
}

/**
 * Applies the provider's view of a video to its asset row. Idempotent, so the
 * webhook and the manual "refresh" in the studio can both call it.
 */
export async function applyStreamVideo(admin: SupabaseClient, video: StreamVideo) {
  const { data: asset } = await admin
    .from("video_assets")
    .select("id, episode_id, status, created_at")
    .eq("provider", "cloudflare_stream")
    .eq("provider_asset_id", video.uid)
    .maybeSingle();

  // Unknown or replaced assets are ignored (deleted ones stay deleted)
  if (!asset || asset.status === "deleted") return null;

  let status = toAssetStatus(video);
  let errorMessage: string | null =
    status === "failed" ? (video.status.errorReasonText ?? "Video işlenemedi") : null;

  if (
    status === "pending_upload" &&
    Date.now() - new Date(asset.created_at).getTime() > ABANDONED_UPLOAD_MS
  ) {
    status = "failed";
    errorMessage = "Yükleme tamamlanmadı";
  }

  const duration = video.duration > 0 ? Math.ceil(video.duration) : null;

  const { error } = await admin
    .from("video_assets")
    .update({
      status,
      error_message: errorMessage,
      ...(status === "ready" && duration ? { duration_seconds: duration } : {}),
    })
    .eq("id", asset.id);
  if (error) throw error;

  if (status === "ready" && duration) {
    await admin.from("episodes").update({ duration_seconds: duration }).eq("id", asset.episode_id);
  }

  return { assetId: asset.id, episodeId: asset.episode_id, status };
}
