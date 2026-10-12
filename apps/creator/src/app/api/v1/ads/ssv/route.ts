import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { episodeOnAir, isUuid, recordRewardedUnlock, verifyAdMobCallback } from "@/lib/ads/admob";

export const dynamic = "force-dynamic";

/**
 * AdMob rewarded-ad server-side verification callback. The app requests the
 * ad with user_id = viewer profile id and custom_data = episode id; Google
 * calls this URL (signed) once the viewer earned the reward.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = url.search.slice(1);

  let params: URLSearchParams | null;
  try {
    params = await verifyAdMobCallback(rawQuery);
  } catch {
    // Could not fetch Google's keys; a non-200 makes AdMob retry
    return NextResponse.json({ error: "keys_unavailable" }, { status: 503 });
  }
  if (!params) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const transactionId = params.get("transaction_id");
  const profileId = params.get("user_id");
  const episodeId = params.get("custom_data");

  // AdMob's console "verify URL" test sends a signed request without our ids
  if (!transactionId || !isUuid(profileId) || !isUuid(episodeId)) {
    return NextResponse.json({ ok: true, ignored: "missing_ids" });
  }

  const admin = createAdminClient();
  if (!(await episodeOnAir(admin, episodeId))) {
    return NextResponse.json({ ok: true, ignored: "episode_not_available" });
  }

  const { error } = await recordRewardedUnlock(admin, {
    provider: "admob",
    eventId: transactionId,
    profileId,
    episodeId,
  });
  if (error) return NextResponse.json({ error: "record_failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
