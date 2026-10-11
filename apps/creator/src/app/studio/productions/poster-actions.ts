"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "posters";
// Vercel caps request bodies at 4.5 MB, so posters stay under it
const MAX_BYTES = 4 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const EDITABLE_SERIES_STATUSES = ["draft", "rejected", "needs_changes"];

export type PosterResult = { ok: true; url: string | null } | { ok: false; error: string };

async function requireEditableSeries(seriesId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: series } = await supabase
    .from("series")
    .select("id, status, poster_url, production_id")
    .eq("id", seriesId)
    .maybeSingle();
  if (!series) return null;

  const { data: owns } = await supabase.rpc("owns_production", { p_production_id: series.production_id });
  if (!owns) return null;
  return series;
}

/** Storage path of a poster we uploaded, from its public URL. */
function storagePath(url: string | null) {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  return url?.includes(marker) ? decodeURIComponent(url.split(marker)[1]!) : null;
}

export async function uploadPoster(formData: FormData): Promise<PosterResult> {
  const seriesId = String(formData.get("series_id") ?? "");
  const file = formData.get("poster");

  const series = await requireEditableSeries(seriesId);
  if (!series) return { ok: false, error: "Bu diziyi düzenleme yetkin yok" };
  if (!EDITABLE_SERIES_STATUSES.includes(series.status)) {
    return { ok: false, error: "İncelemedeki veya yayındaki dizinin posteri değiştirilemez" };
  }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Bir resim seç" };
  const ext = EXTENSIONS[file.type];
  if (!ext) return { ok: false, error: "Poster JPG, PNG veya WebP olmalı" };
  if (file.size > MAX_BYTES) return { ok: false, error: "Poster en fazla 4 MB olabilir" };

  const admin = createAdminClient();
  const path = `${seriesId}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (uploadError) return { ok: false, error: uploadError.message };

  const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await admin.from("series").update({ poster_url: url }).eq("id", seriesId);
  if (updateError) {
    await admin.storage.from(BUCKET).remove([path]);
    return { ok: false, error: updateError.message };
  }

  const old = storagePath(series.poster_url);
  if (old) await admin.storage.from(BUCKET).remove([old]);

  revalidatePath(`/studio/productions/${series.production_id}`);
  return { ok: true, url };
}

export async function removePoster(seriesId: string): Promise<PosterResult> {
  const series = await requireEditableSeries(seriesId);
  if (!series) return { ok: false, error: "Bu diziyi düzenleme yetkin yok" };
  if (!EDITABLE_SERIES_STATUSES.includes(series.status)) {
    return { ok: false, error: "İncelemedeki veya yayındaki dizinin posteri değiştirilemez" };
  }

  const admin = createAdminClient();
  await admin.from("series").update({ poster_url: null }).eq("id", seriesId);
  const old = storagePath(series.poster_url);
  if (old) await admin.storage.from(BUCKET).remove([old]);

  revalidatePath(`/studio/productions/${series.production_id}`);
  return { ok: true, url: null };
}
