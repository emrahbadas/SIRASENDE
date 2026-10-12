import { createPublicKey, verify } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Google's public keys for rewarded-ad server-side verification (SSV)
const KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;

let keyCache: { at: number; keys: Map<string, string> } | null = null;

async function verifierKeys(force = false) {
  if (!force && keyCache && Date.now() - keyCache.at < KEYS_TTL_MS) return keyCache.keys;
  const res = await fetch(KEYS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`verifier keys: HTTP ${res.status}`);
  const body = (await res.json()) as { keys: { keyId: number | string; pem: string }[] };
  keyCache = { at: Date.now(), keys: new Map(body.keys.map((k) => [String(k.keyId), k.pem])) };
  return keyCache.keys;
}

/**
 * Verifies an AdMob SSV callback. The signed message is the raw query string
 * up to `&signature=`; `signature` (web-safe base64, DER ECDSA/SHA-256) and
 * `key_id` are always the last two parameters.
 */
export async function verifyAdMobCallback(rawQuery: string): Promise<URLSearchParams | null> {
  const cut = rawQuery.indexOf("&signature=");
  if (cut < 0) return null;
  const message = rawQuery.slice(0, cut);
  const params = new URLSearchParams(rawQuery);
  const signature = params.get("signature");
  const keyId = params.get("key_id");
  if (!signature || !keyId) return null;

  let pem = (await verifierKeys()).get(keyId);
  if (!pem) pem = (await verifierKeys(true)).get(keyId); // keys rotate
  if (!pem) return null;

  const ok = verify(
    "sha256",
    Buffer.from(message, "utf8"),
    { key: createPublicKey(pem), dsaEncoding: "der" },
    Buffer.from(signature, "base64url")
  );
  return ok ? params : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);

/** Is the episode on air (published episode of a published, not deleted series)? */
export async function episodeOnAir(admin: Admin, episodeId: string) {
  const { data } = await admin
    .from("episodes")
    .select("id, seasons!inner(series!inner(status, deleted_at))")
    .eq("id", episodeId)
    .eq("status", "published")
    .eq("seasons.series.status", "published")
    .is("seasons.series.deleted_at", null)
    .maybeSingle();
  return !!data;
}

/** Records a rewarded impression and unlocks the episode (idempotent per event id). */
export async function recordRewardedUnlock(
  admin: Admin,
  input: { provider: string; eventId: string; profileId: string; episodeId: string }
) {
  return admin.rpc("record_ad_impression", {
    p_provider: input.provider,
    p_provider_event_id: input.eventId,
    p_placement: "rewarded",
    p_profile_id: input.profileId,
    p_episode_id: input.episodeId,
    p_revenue_micros: null,
    p_unlock_episode: true,
  });
}
