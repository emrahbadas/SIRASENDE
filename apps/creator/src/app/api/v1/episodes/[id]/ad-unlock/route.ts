import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { callerUserId, json, preflight } from "@/lib/api/v1";
import { episodeOnAir, recordRewardedUnlock } from "@/lib/ads/admob";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * Called by the app after the viewer earned a rewarded ad. In production the
 * unlock comes from AdMob's signed callback (/api/v1/ads/ssv), which can land
 * a moment later, so this answers `pending` until it has. With
 * ADS_TEST_REWARDS=true (development only: test ads never send callbacks) the
 * app's report is trusted and the episode is unlocked directly.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await callerUserId(request);
  if (!userId) return json({ error: "not_authenticated" }, 401);

  const { data: canWatch } = await supabase.rpc("can_watch_episode", { p_episode_id: id });
  if (canWatch) return json({ unlocked: true });

  const admin = createAdminClient();
  if (!(await episodeOnAir(admin, id))) return json({ error: "episode_not_available" }, 404);

  if (process.env.ADS_TEST_REWARDS !== "true") return json({ pending: true }, 202);

  const { error } = await recordRewardedUnlock(admin, {
    provider: "admob_test",
    eventId: randomUUID(),
    profileId: userId,
    episodeId: id,
  });
  if (error) return json({ error: "unlock_failed" }, 500);
  return json({ unlocked: true });
}
