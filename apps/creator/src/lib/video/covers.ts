import type { SupabaseClient } from "@supabase/supabase-js";
import { previewUrl, thumbnailUrl } from "@/lib/cloudflare/stream";

export interface SeriesCover {
  /** Still frame used when the creator has not uploaded a poster. */
  thumbnail: string | null;
  /** Short silent animated preview shown on hover / long-press. */
  preview: string | null;
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

/**
 * Builds listing covers from each series' first episode. A signed image URL
 * also grants access to the full video, so covers are only generated when that
 * episode is inside the free window — locked videos never leak via listings.
 */
export async function getSeriesCovers(
  admin: SupabaseClient,
  series: { id: string; free_episode_count: number }[]
): Promise<Map<string, SeriesCover>> {
  const covers = new Map<string, SeriesCover>();
  if (series.length === 0) return covers;

  const { data: episodes } = await admin
    .from("episodes")
    .select("id, episode_number, status, seasons!inner(series_id, season_number)")
    .in(
      "seasons.series_id",
      series.map((s) => s.id)
    );

  // First published episode per series; it is position 1 (can_watch_episode counts published only)
  const firstBySeries = new Map<string, { episodeId: string; position: number }>();
  const bySeries = new Map<string, NonNullable<typeof episodes>>();
  for (const e of episodes ?? []) {
    const seriesId = one(e.seasons)!.series_id as string;
    bySeries.set(seriesId, [...(bySeries.get(seriesId) ?? []), e]);
  }
  for (const [seriesId, list] of bySeries) {
    const ordered = [...list].sort(
      (a, b) =>
        one(a.seasons)!.season_number - one(b.seasons)!.season_number || a.episode_number - b.episode_number
    );
    const first = ordered.find((e) => e.status === "published");
    if (first) firstBySeries.set(seriesId, { episodeId: first.id, position: 1 });
  }

  const freeFirst = series.filter((s) => {
    const first = firstBySeries.get(s.id);
    return first && first.position <= s.free_episode_count;
  });
  if (freeFirst.length === 0) return covers;

  const { data: assets } = await admin
    .from("video_assets")
    .select("episode_id, provider_asset_id, duration_seconds")
    .eq("status", "ready")
    .in(
      "episode_id",
      freeFirst.map((s) => firstBySeries.get(s.id)!.episodeId)
    );
  const assetByEpisode = new Map((assets ?? []).map((a) => [a.episode_id as string, a]));

  for (const s of freeFirst) {
    const asset = assetByEpisode.get(firstBySeries.get(s.id)!.episodeId);
    if (!asset?.provider_asset_id) continue;
    const duration = asset.duration_seconds ?? 10;
    // Skip the first second (often black) but stay inside very short clips
    const still = Math.max(1, Math.min(3, Math.floor(duration / 4)));
    const previewStart = duration > 8 ? 2 : 0;
    covers.set(s.id, {
      thumbnail: thumbnailUrl(asset.provider_asset_id, still),
      preview: previewUrl(asset.provider_asset_id, previewStart, Math.min(4, Math.max(1, duration - previewStart))),
    });
  }
  return covers;
}
