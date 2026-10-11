import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, type StreamVideo } from "@/lib/cloudflare/stream";
import { applyStreamVideo } from "@/lib/video/sync";

// Cloudflare Stream calls this when a video finishes processing or fails.
export async function POST(request: Request) {
  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyWebhookSignature(rawBody, request.headers.get("webhook-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let video: StreamVideo;
  try {
    video = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!video?.uid) return NextResponse.json({ ok: true });

  // Idempotent: replays and out-of-order deliveries converge to the provider state
  await applyStreamVideo(createAdminClient(), video);
  return NextResponse.json({ ok: true });
}
