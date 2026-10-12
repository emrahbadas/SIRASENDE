import { deleteVideo } from "@/lib/cloudflare/stream";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/** Statuses a creator can still edit (upload/replace video, submit). */
export const EDITABLE_STATUSES = ["draft", "rejected", "needs_changes"];

/** Removes videos at the provider (best-effort) after the DB stopped referencing them. */
async function deleteProviderVideos(uids: (string | null)[]) {
  await Promise.all(uids.filter(Boolean).map((uid) => deleteVideo(uid!).catch(() => undefined)));
}

/**
 * Permanently deletes an episode and its video, then closes the numbering gap
 * so the series reads 1, 2, 3… again. Caller must have checked permission.
 */
export async function deleteEpisodePermanently(admin: Admin, episodeId: string) {
  const { data: episode } = await admin
    .from("episodes")
    .select("id, season_id, episode_number, video_assets(provider_asset_id)")
    .eq("id", episodeId)
    .maybeSingle();
  if (!episode) return { ok: false as const, error: "Bölüm bulunamadı" };

  const { error } = await admin.from("episodes").delete().eq("id", episodeId);
  if (error) return { ok: false as const, error: error.message };

  // One row at a time, ascending, so (season_id, episode_number) stays unique
  const { data: later } = await admin
    .from("episodes")
    .select("id, episode_number")
    .eq("season_id", episode.season_id)
    .gt("episode_number", episode.episode_number)
    .order("episode_number", { ascending: true });
  for (const e of later ?? []) {
    await admin.from("episodes").update({ episode_number: e.episode_number - 1 }).eq("id", e.id);
  }

  await deleteProviderVideos((episode.video_assets ?? []).map((a) => a.provider_asset_id));
  return { ok: true as const };
}

/**
 * Takes a production off the platform: soft-deletes it and its series (viewer
 * history and the ledger keep their references) and deletes every video so the
 * creator's storage is freed.
 */
export async function deleteProductionPermanently(admin: Admin, productionId: string) {
  const now = new Date().toISOString();
  const { data: series } = await admin.from("series").select("id").eq("production_id", productionId);
  const seriesIds = (series ?? []).map((s) => s.id);

  const { error } = await admin.from("productions").update({ deleted_at: now }).eq("id", productionId);
  if (error) return { ok: false as const, error: error.message };
  if (seriesIds.length) await admin.from("series").update({ deleted_at: now }).in("id", seriesIds);

  const { data: seasons } = seriesIds.length
    ? await admin.from("seasons").select("id").in("series_id", seriesIds)
    : { data: [] };
  const { data: episodes } = seasons?.length
    ? await admin.from("episodes").select("id").in("season_id", seasons.map((s) => s.id))
    : { data: [] };
  const episodeIds = (episodes ?? []).map((e) => e.id);

  if (episodeIds.length) {
    const { data: assets } = await admin
      .from("video_assets")
      .select("id, provider_asset_id")
      .in("episode_id", episodeIds)
      .neq("status", "deleted");
    if (assets?.length) {
      await admin.from("video_assets").update({ status: "deleted" }).in("id", assets.map((a) => a.id));
      await deleteProviderVideos(assets.map((a) => a.provider_asset_id));
    }
  }

  // Unsplit source uploads of this production's seasons
  if (seasons?.length) {
    const { data: jobs } = await admin
      .from("video_split_jobs")
      .select("id, provider_asset_id")
      .in("season_id", seasons.map((s) => s.id))
      .not("status", "in", "(completed,canceled)");
    if (jobs?.length) {
      await admin.from("video_split_jobs").update({ status: "canceled" }).in("id", jobs.map((j) => j.id));
      await deleteProviderVideos(jobs.map((j) => j.provider_asset_id));
    }
  }

  return { ok: true as const };
}
