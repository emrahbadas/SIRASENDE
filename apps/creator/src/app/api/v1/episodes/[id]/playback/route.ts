import { createAdminClient } from "@/lib/supabase/admin";
import { createPlaybackToken, hlsUrl } from "@/lib/cloudflare/stream";
import { callerUserId, json, one, preflight } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

const TOKEN_TTL_SECONDS = 60 * 60;

export function OPTIONS() {
  return preflight();
}

/**
 * Short-lived HLS URL for an episode the caller may watch (free window,
 * unlocked, or own content). Locked episodes get 403 with the unlock price.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await callerUserId(request);

  const { data: canWatch, error } = await supabase.rpc("can_watch_episode", { p_episode_id: id });
  if (error) return json({ error: "unavailable" }, 500);

  if (!canWatch) {
    const { data: episode } = await supabase
      .from("episodes")
      .select("id, seasons!inner(series!inner(episode_coin_price))")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (!episode) return json({ error: "not_found" }, 404);
    const price = one(one(episode.seasons)?.series)?.episode_coin_price ?? null;
    return json({ error: "locked", coinPrice: price, signedIn: !!userId }, 403);
  }

  // Assets are not readable by viewers; access was checked above
  const { data: asset } = await createAdminClient()
    .from("video_assets")
    .select("provider_asset_id, duration_seconds")
    .eq("episode_id", id)
    .eq("status", "ready")
    .not("provider_asset_id", "is", null)
    .maybeSingle();
  if (!asset?.provider_asset_id) return json({ error: "video_not_ready" }, 404);

  const token = await createPlaybackToken(asset.provider_asset_id, TOKEN_TTL_SECONDS);

  let resumeAt = 0;
  if (userId) {
    const { data: progress } = await supabase
      .from("watch_progress")
      .select("position_seconds, completed")
      .eq("episode_id", id)
      .maybeSingle();
    if (progress && !progress.completed) resumeAt = progress.position_seconds;
  }

  return json({
    hlsUrl: hlsUrl(token),
    durationSeconds: asset.duration_seconds,
    resumeAt,
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  });
}
