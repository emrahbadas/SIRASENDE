// Cloudflare Stream API client. Server-only: reads secrets from process.env.
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.cloudflare.com/client/v4";

export interface StreamVideo {
  uid: string;
  readyToStream: boolean;
  duration: number; // seconds, -1 until known
  status: {
    state: "pendingupload" | "downloading" | "queued" | "inprogress" | "ready" | "error";
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  meta?: Record<string, string>;
  created: string;
}

export class StreamApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !token) {
    throw new StreamApiError("Cloudflare Stream is not configured", 500);
  }
  return { accountId, token };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accountId, token } = config();
  const res = await fetch(`${API}/accounts/${accountId}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const message = body?.errors?.[0]?.message ?? `Cloudflare Stream request failed (${res.status})`;
    throw new StreamApiError(message, res.status);
  }
  return body.result as T;
}

/** One-time upload URL the browser posts the file to directly. */
export function createDirectUpload(params: {
  maxDurationSeconds: number;
  meta: Record<string, string>;
}) {
  return call<{ uid: string; uploadURL: string }>("/direct_upload", {
    method: "POST",
    body: JSON.stringify({
      maxDurationSeconds: params.maxDurationSeconds,
      requireSignedURLs: true,
      meta: params.meta,
    }),
  });
}

/**
 * Starts a resumable (tus) upload for large files. Returns the provider's
 * upload Location the browser continues with, plus the new video uid.
 */
export async function createTusUpload(params: {
  uploadLength: number;
  maxDurationSeconds: number;
  name: string;
}) {
  const { accountId, token } = config();
  const b64 = (v: string) => Buffer.from(v).toString("base64");
  const res = await fetch(`${API}/accounts/${accountId}/stream?direct_user=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(params.uploadLength),
      "Upload-Metadata": [
        `maxdurationseconds ${b64(String(params.maxDurationSeconds))}`,
        "requiresignedurls",
        `name ${b64(params.name)}`,
      ].join(","),
    },
    cache: "no-store",
  });
  const location = res.headers.get("location");
  const uid = res.headers.get("stream-media-id");
  if (!res.ok || !location || !uid) {
    throw new StreamApiError(`Cloudflare Stream tus request failed (${res.status})`, res.status);
  }
  return { location, uid };
}

/** Cuts [start, end) of an existing video into a new, separately stored video. */
export function createClip(params: {
  sourceUid: string;
  startSeconds: number;
  endSeconds: number;
  meta: Record<string, string>;
}) {
  return call<{ uid: string }>("/clip", {
    method: "POST",
    body: JSON.stringify({
      clippedFromVideoUID: params.sourceUid,
      startTimeSeconds: params.startSeconds,
      endTimeSeconds: params.endSeconds,
      requireSignedURLs: true,
      meta: params.meta,
    }),
  });
}

export function getVideo(uid: string) {
  return call<StreamVideo>(`/${uid}`);
}

export async function deleteVideo(uid: string) {
  const { accountId, token } = config();
  await fetch(`${API}/accounts/${accountId}/stream/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Short-lived signed playback token (videos require signed URLs). */
export async function createPlaybackToken(uid: string, ttlSeconds = 60 * 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const { token } = await call<{ token: string }>(`/${uid}/token`, {
    method: "POST",
    body: JSON.stringify({ exp }),
  });
  return token;
}

// The account-specific playback domain. The legacy videodelivery.net domain
// is unreachable from some Turkish networks, so it is never used.
export function iframeUrl(token: string) {
  const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!code) throw new StreamApiError("CLOUDFLARE_STREAM_CUSTOMER_CODE is not set", 500);
  return `https://customer-${code}.cloudflarestream.com/${token}/iframe`;
}

/**
 * Verifies the `Webhook-Signature: time=…,sig1=…` header against the raw body.
 * Rejects signatures older than 5 minutes to block replays.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const time = Number(parts.time);
  if (!parts.sig1 || !Number.isFinite(time)) return false;
  if (Math.abs(Date.now() / 1000 - time) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${parts.time}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.sig1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
