export const VIDEO_ASSET_STATUSES = [
  "pending_upload",
  "uploading",
  "processing",
  "ready",
  "failed",
  "deleted",
] as const;

export type VideoAssetStatus = (typeof VIDEO_ASSET_STATUSES)[number];

export interface VideoAsset {
  id: string;
  episodeId: string;
  provider: string;
  providerAssetId: string | null;
  status: VideoAssetStatus;
  durationSeconds: number | null;
  playbackUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Provider-agnostic contract; Cloudflare Stream is the initial implementation. */
export interface VideoProvider {
  createUploadSession(input: {
    episodeId: string;
    maxDurationSeconds?: number;
  }): Promise<{ uploadUrl: string; providerAssetId: string }>;
  getAssetStatus(providerAssetId: string): Promise<VideoAssetStatus>;
  getPlaybackUrl(providerAssetId: string): Promise<string>;
  deleteAsset(providerAssetId: string): Promise<void>;
}
