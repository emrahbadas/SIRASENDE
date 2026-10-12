import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerUserId, json, preflight } from "@/lib/api/v1";
import { episodeOnAir, recordRewardedUnlock } from "@/lib/ads/admob";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

type Status = {
  unlocked: boolean;
  ads_watched: number;
  ads_required: number;
  daily_limit: number;
  daily_remaining: number;
  resets_at: string;
};

async function status(admin: ReturnType<typeof createAdminClient>, userId: string, episodeId: string) {
  const { data, error } = await admin
    .rpc("ad_unlock_status", { p_profile_id: userId, p_episode_id: episodeId })
    .single<Status>();
  if (error || !data) return null;
  return {
    unlocked: data.unlocked,
    adsWatched: data.ads_watched,
    adsRequired: data.ads_required,
    dailyLimit: data.daily_limit,
    dailyRemaining: data.daily_remaining,
    resetsAt: data.resets_at,
  };
}

/**
 * Rewarded-ad progress for one locked episode: how many verified ads count
 * towards it, how many are needed, and how many ad unlocks are left today.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await callerUserId(request);
  if (!userId) return json({ error: "not_authenticated" }, 401);

  const admin = createAdminClient();
  if (!(await episodeOnAir(admin, id))) return json({ error: "episode_not_available" }, 404);
  const s = await status(admin, userId, id);
  return s ? json(s) : json({ error: "unavailable" }, 500);
}

/**
 * Called after the viewer earned a rewarded ad. In production progress comes
 * from AdMob's signed callback (/api/v1/ads/ssv), which can land a moment
 * later, so the app polls GET until adsWatched changes. With ADS_TEST_REWARDS
 * (development only: test ads never send callbacks) the app's report is
 * recorded here as one ad.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await callerUserId(request);
  if (!userId) return json({ error: "not_authenticated" }, 401);

  const admin = createAdminClient();
  const { data: canWatch } = await supabase.rpc("can_watch_episode", { p_episode_id: id });
  if (canWatch) {
    const s = await status(admin, userId, id);
    return json({ ...s, unlocked: true });
  }
  if (!(await episodeOnAir(admin, id))) return json({ error: "episode_not_available" }, 404);

  if (process.env.ADS_TEST_REWARDS === "true") {
    const { error } = await recordRewardedUnlock(admin, {
      provider: "admob_test",
      eventId: randomUUID(),
      profileId: userId,
      episodeId: id,
    });
    if (error) return json({ error: "unlock_failed" }, 500);
  }

  const s = await status(admin, userId, id);
  return s ? json(s) : json({ error: "unavailable" }, 500);
}
