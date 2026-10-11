import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { StreamApiError, createTusUpload } from "@/lib/cloudflare/stream";

// Cloudflare Stream's limit for a single resumable upload
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024 * 1024;

/**
 * tus "creation" endpoint for split sources. The browser's tus client POSTs
 * here; we open the upload on Cloudflare with server-controlled limits and
 * hand back the provider Location, so the file itself never passes through us.
 */
export async function POST(request: Request) {
  const jobId = new URL(request.url).searchParams.get("job") ?? "";
  const uploadLength = Number(request.headers.get("upload-length"));
  if (!jobId || !Number.isFinite(uploadLength) || uploadLength <= 0 || uploadLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "invalid upload" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: creator } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("video_split_jobs")
    .select("id, creator_id, status, provider_asset_id, reserved_seconds")
    .eq("id", jobId)
    .maybeSingle();

  if (!job || !creator || job.creator_id !== creator.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (job.status !== "pending_upload" || job.provider_asset_id) {
    return NextResponse.json({ error: "upload already started" }, { status: 409 });
  }

  try {
    const upload = await createTusUpload({
      uploadLength,
      maxDurationSeconds: job.reserved_seconds,
      name: `split-${job.id}`,
    });
    await admin
      .from("video_split_jobs")
      .update({ provider_asset_id: upload.uid })
      .eq("id", job.id)
      .is("provider_asset_id", null);

    return new NextResponse(null, {
      status: 201,
      headers: {
        Location: upload.location,
        "Tus-Resumable": "1.0.0",
        "Access-Control-Expose-Headers": "Location, Tus-Resumable",
      },
    });
  } catch (e) {
    const status = e instanceof StreamApiError ? 502 : 500;
    return NextResponse.json({ error: "could not start upload" }, { status });
  }
}
