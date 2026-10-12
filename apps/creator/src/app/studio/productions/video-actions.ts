"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  StreamApiError,
  createDirectUpload,
  deleteVideo,
  getVideo,
} from "@/lib/cloudflare/stream";
import { applyStreamVideo } from "@/lib/video/sync";
import { getVideoSettings } from "@/lib/settings";
import { EDITABLE_STATUSES } from "@/lib/content/manage";

// Basic (single POST) uploads are limited to 200 MB by Cloudflare Stream.
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_DURATION_SECONDS = 6 * 60 * 60;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/** Loads the episode and confirms the signed-in user owns its production. */
async function requireOwnedEpisode(episodeId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: episode } = await supabase
    .from("episodes")
    .select("id, season_id, status, seasons!inner(series!inner(id, status, production_id))")
    .eq("id", episodeId)
    .maybeSingle();
  const series = one(one(episode?.seasons)?.series);
  if (!episode || !series) return null;

  const { data: owns } = await supabase.rpc("owns_production", {
    p_production_id: series.production_id,
  });
  if (!owns) return null;

  // Video can change until the episode is sent to review (or after it is sent back)
  const editable = EDITABLE_STATUSES.includes(episode.status) && series.status !== "blocked";
  return { episodeId: episode.id, series, editable };
}

async function requireOwnedAsset(assetId: string) {
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("video_assets")
    .select("id, episode_id, provider_asset_id, status")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) return null;

  const owned = await requireOwnedEpisode(asset.episode_id);
  if (!owned) return null;
  return { admin, asset, ...owned };
}

function revalidateStudio(productionId: string) {
  revalidatePath(`/studio/productions/${productionId}`);
}

/** Retires the episode's current video (DB first, then provider, best-effort). */
async function retireActiveAssets(admin: ReturnType<typeof createAdminClient>, episodeId: string) {
  const { data: active } = await admin
    .from("video_assets")
    .select("id, provider_asset_id")
    .eq("episode_id", episodeId)
    .not("status", "in", "(failed,deleted)");

  for (const a of active ?? []) {
    await admin.from("video_assets").update({ status: "deleted" }).eq("id", a.id);
    if (a.provider_asset_id) await deleteVideo(a.provider_asset_id).catch(() => undefined);
  }
}

export async function startEpisodeUpload(input: {
  episodeId: string;
  durationSeconds: number;
  fileSize: number;
}): Promise<Result<{ assetId: string; uploadURL: string }>> {
  const owned = await requireOwnedEpisode(input.episodeId);
  if (!owned) return { ok: false, error: "Bu bölüme video yükleme yetkin yok" };

  if (!owned.editable) {
    return { ok: false, error: "İncelemedeki veya yayındaki bölümün videosu değiştirilemez" };
  }
  if (!(input.fileSize > 0) || input.fileSize > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Video en fazla 200 MB olabilir" };
  }
  if (!(input.durationSeconds > 0) || input.durationSeconds > MAX_DURATION_SECONDS) {
    return { ok: false, error: "Videonun süresi okunamadı" };
  }
  const { maxEpisodeSeconds } = await getVideoSettings(await createClient());
  if (input.durationSeconds > maxEpisodeSeconds) {
    return {
      ok: false,
      error: `Bölüm en fazla ${Math.floor(maxEpisodeSeconds / 60)} dakika olabilir. Uzun videoyu "bölümlere ayır" ile yükle.`,
    };
  }

  const admin = createAdminClient();
  await retireActiveAssets(admin, owned.episodeId);

  // Reserve quota for the declared length; the provider rejects longer files.
  const reservedSeconds = Math.ceil(input.durationSeconds) + 1;
  const { data: asset, error: insertError } = await admin
    .from("video_assets")
    .insert({
      episode_id: owned.episodeId,
      provider: "cloudflare_stream",
      status: "pending_upload",
      reserved_seconds: reservedSeconds,
    })
    .select("id")
    .single();

  if (insertError || !asset) {
    if (insertError?.message.includes("episode_too_long")) {
      return { ok: false, error: 'Bölüm çok uzun. Uzun videoyu "bölümlere ayır" ile yükle.' };
    }
    if (insertError?.message.includes("storage_quota_exceeded")) {
      return {
        ok: false,
        error: "Depolama kotan doldu. Daha fazla video için depolama planını yükseltmelisin.",
      };
    }
    return { ok: false, error: insertError?.message ?? "Yükleme başlatılamadı" };
  }

  try {
    const upload = await createDirectUpload({
      maxDurationSeconds: reservedSeconds,
      meta: { asset_id: asset.id, episode_id: owned.episodeId },
    });
    await admin
      .from("video_assets")
      .update({ provider_asset_id: upload.uid })
      .eq("id", asset.id);

    revalidateStudio(owned.series.production_id);
    return { ok: true, assetId: asset.id, uploadURL: upload.uploadURL };
  } catch (e) {
    // Release the reservation if the provider refused the upload
    await admin
      .from("video_assets")
      .update({ status: "failed", error_message: "Yükleme başlatılamadı" })
      .eq("id", asset.id);
    const message = e instanceof StreamApiError ? e.message : "Video servisine ulaşılamadı";
    return { ok: false, error: message };
  }
}

/** Called by the browser after the file finished uploading. */
export async function completeEpisodeUpload(assetId: string): Promise<Result<{ status: string }>> {
  const owned = await requireOwnedAsset(assetId);
  if (!owned) return { ok: false, error: "Video bulunamadı" };

  if (owned.asset.status === "pending_upload") {
    await owned.admin
      .from("video_assets")
      .update({ status: "processing" })
      .eq("id", assetId)
      .eq("status", "pending_upload");
  }

  return refreshWith(owned);
}

/** Pulls the latest state from the provider (fallback when webhooks can't reach us). */
export async function refreshEpisodeVideo(assetId: string): Promise<Result<{ status: string }>> {
  const owned = await requireOwnedAsset(assetId);
  if (!owned) return { ok: false, error: "Video bulunamadı" };
  return refreshWith(owned);
}

async function refreshWith(
  owned: NonNullable<Awaited<ReturnType<typeof requireOwnedAsset>>>
): Promise<Result<{ status: string }>> {
  if (!owned.asset.provider_asset_id) return { ok: true, status: owned.asset.status };
  try {
    const video = await getVideo(owned.asset.provider_asset_id);
    const applied = await applyStreamVideo(owned.admin, video);
    revalidateStudio(owned.series.production_id);
    return { ok: true, status: applied?.status ?? owned.asset.status };
  } catch (e) {
    const message = e instanceof StreamApiError ? e.message : "Durum alınamadı";
    return { ok: false, error: message };
  }
}

export async function removeEpisodeVideo(assetId: string): Promise<Result> {
  const owned = await requireOwnedAsset(assetId);
  if (!owned) return { ok: false, error: "Video bulunamadı" };
  if (!owned.editable) {
    return { ok: false, error: "İncelemedeki veya yayındaki bölümün videosu silinemez" };
  }

  await owned.admin.from("video_assets").update({ status: "deleted" }).eq("id", assetId);
  if (owned.asset.provider_asset_id) {
    await deleteVideo(owned.asset.provider_asset_id).catch(() => undefined);
  }
  revalidateStudio(owned.series.production_id);
  return { ok: true };
}
