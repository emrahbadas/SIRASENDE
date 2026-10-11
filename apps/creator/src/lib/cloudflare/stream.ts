// Cloudflare Stream API client. Server-only: reads secrets from process.env.
import { createHmac, createSign, timingSafeEqual } from "node:crypto";

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
  /** Uploaded file's dimensions (pixels); -1 until known. */
  input?: { width: number; height: number };
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

/**
 * Signs a Stream token locally with the account signing key (RS256 JWT), so
 * pages listing many videos need no API call per video. Null if no key is set.
 */
function signLocally(uid: string, exp: number) {
  const keyId = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID;
  const pem = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM;
  if (!keyId || !pem) return null;

  const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");
  const header = b64url(JSON.stringify({ alg: "RS256", kid: keyId }));
  const payload = b64url(JSON.stringify({ sub: uid, kid: keyId, exp }));
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(Buffer.from(pem, "base64").toString("utf8"));
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Short-lived signed playback token (videos require signed URLs). */
export async function createPlaybackToken(uid: string, ttlSeconds = 60 * 60) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const local = signLocally(uid, exp);
  if (local) return local;

  const { token } = await call<{ token: string }>(`/${uid}/token`, {
    method: "POST",
    body: JSON.stringify({ exp }),
  });
  return token;
}

function playbackHost() {
  const code = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE;
  if (!code) throw new StreamApiError("CLOUDFLARE_STREAM_CUSTOMER_CODE is not set", 500);
  return `https://customer-${code}.cloudflarestream.com`;
}

/**
 * Token for listing images. Expiry is rounded to the hour so the URL stays the
 * same for a while and browsers/CDN can cache the image (valid 1–2 hours).
 */
function listingToken(uid: string) {
  const hour = 60 * 60;
  const exp = (Math.floor(Date.now() / 1000 / hour) + 2) * hour;
  return signLocally(uid, exp);
}

/** Still frame from the video, or null when no signing key is configured. */
export function thumbnailUrl(uid: string, atSeconds: number, height = 640) {
  const token = listingToken(uid);
  if (!token) return null;
  return `${playbackHost()}/${token}/thumbnails/thumbnail.jpg?time=${atSeconds}s&height=${height}`;
}

/** Short silent animated preview (GIF) for hover, or null without a signing key. */
export function previewUrl(uid: string, startSeconds: number, durationSeconds = 4, height = 360) {
  const token = listingToken(uid);
  if (!token) return null;
  return `${playbackHost()}/${token}/thumbnails/thumbnail.gif?time=${startSeconds}s&duration=${durationSeconds}s&height=${height}&fps=10`;
}

// The account-specific playback domain. The legacy videodelivery.net domain
// is unreachable from some Turkish networks, so it is never used.
/** HLS manifest for native players (iOS requires the .m3u8 suffix). */
export function hlsUrl(token: string) {
  return `${playbackHost()}/${token}/manifest/video.m3u8`;
}

export function iframeUrl(token: string) {
  return `${playbackHost()}/${token}/iframe`;
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
