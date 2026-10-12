"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EDITABLE_STATUSES, deleteEpisodePermanently, deleteProductionPermanently } from "@/lib/content/manage";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

async function getCreatorId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: creator } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!creator) redirect("/onboarding");

  return { supabase, creatorId: creator.id };
}

const optional = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

export async function createProduction(formData: FormData) {
  const { supabase, creatorId } = await getCreatorId();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) {
    redirect("/studio/productions/new?error=" + encodeURIComponent("Başlık en az 2 karakter olmalı"));
  }

  const categoryId = String(formData.get("category_id") ?? "");
  if (!categoryId) {
    redirect("/studio/productions/new?error=" + encodeURIComponent("Tür (kategori) seçimi zorunlu"));
  }

  const ageRating = String(formData.get("age_rating") ?? "");
  if (!["7+", "13+", "16+", "18+"].includes(ageRating)) {
    redirect("/studio/productions/new?error=" + encodeURIComponent("Yaş aralığı seçimi zorunlu"));
  }

  const policyAccepted =
    formData.get("policy_content") === "on" &&
    formData.get("policy_fiction") === "on" &&
    formData.get("policy_copyright") === "on";
  if (!policyAccepted) {
    redirect(
      "/studio/productions/new?error=" +
        encodeURIComponent("Yayın için tüm içerik politikası beyanlarını kabul etmelisin")
    );
  }

  const description = optional(formData.get("description"));
  const primaryLanguage = String(formData.get("primary_language") ?? "tr");

  const ALLOWED_WARNINGS = ["violence", "fear", "profanity", "sensitive_themes", "substance_use"];
  const contentWarnings = formData
    .getAll("content_warnings")
    .map(String)
    .filter((w) => ALLOWED_WARNINGS.includes(w));

  const { data: production, error: pErr } = await supabase
    .from("productions")
    .insert({
      creator_id: creatorId,
      title,
      description,
      production_type: String(formData.get("production_type") ?? "human"),
      age_rating: ageRating,
      content_warnings: contentWarnings,
      script_source: optional(formData.get("script_source")),
      video_source: optional(formData.get("video_source")),
      voice_source: optional(formData.get("voice_source")),
      music_source: optional(formData.get("music_source")),
      rights_declared_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (pErr || !production) {
    redirect("/studio/productions/new?error=" + encodeURIComponent(pErr?.message ?? "Production oluşturulamadı"));
  }

  await supabase
    .from("production_categories")
    .insert({ production_id: production.id, category_id: categoryId });

  const { data: series, error: sErr } = await supabase
    .from("series")
    .insert({
      production_id: production.id,
      title,
      description,
      primary_language: primaryLanguage,
    })
    .select("id")
    .single();

  if (sErr || !series) {
    redirect("/studio/productions/new?error=" + encodeURIComponent(sErr?.message ?? "Series oluşturulamadı"));
  }

  await supabase.from("seasons").insert({ series_id: series.id, season_number: 1 });

  revalidatePath("/studio/productions");
  redirect(`/studio/productions/${production.id}`);
}

export async function createEpisode(formData: FormData) {
  const { supabase } = await getCreatorId();

  const seasonId = String(formData.get("season_id") ?? "");
  const productionId = String(formData.get("production_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (title.length < 1) {
    redirect(`/studio/productions/${productionId}?error=` + encodeURIComponent("Bölüm başlığı gerekli"));
  }

  const { data: last } = await supabase
    .from("episodes")
    .select("episode_number")
    .eq("season_id", seasonId)
    .order("episode_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = (last?.episode_number ?? 0) + 1;

  const { error } = await supabase.from("episodes").insert({
    season_id: seasonId,
    episode_number: nextNumber,
    title,
    description: optional(formData.get("description")),
  });

  if (error) {
    redirect(`/studio/productions/${productionId}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath(`/studio/productions/${productionId}`);
  redirect(`/studio/productions/${productionId}`);
}

/** Loads an episode the caller owns, with its series and production. */
async function ownedEpisode(episodeId: string) {
  const { supabase } = await getCreatorId();
  const { data: episode } = await supabase
    .from("episodes")
    .select("id, status, seasons!inner(series!inner(id, status, production_id))")
    .eq("id", episodeId)
    .maybeSingle();
  const series = one(one(episode?.seasons)?.series);
  if (!episode || !series) return null;
  const { data: owns } = await supabase.rpc("owns_production", { p_production_id: series.production_id });
  return owns ? { supabase, episode, series } : null;
}

const back = (productionId: string, error?: string): never =>
  redirect(`/studio/productions/${productionId}` + (error ? `?error=${encodeURIComponent(error)}` : ""));

function revalidateContent(productionId: string) {
  revalidatePath(`/studio/productions/${productionId}`);
  revalidatePath("/");
}

/** Permanently deletes an episode (any status) and its video. */
export async function deleteEpisode(formData: FormData) {
  const productionId = String(formData.get("production_id") ?? "");
  const owned = await ownedEpisode(String(formData.get("episode_id") ?? ""));
  if (!owned) back(productionId, "Bölüm bulunamadı");

  const result = await deleteEpisodePermanently(createAdminClient(), owned!.episode.id);
  revalidateContent(productionId);
  back(productionId, result.ok ? undefined : result.error);
}

/** Pauses a published episode or resumes a paused one (the status guard enforces the rest). */
export async function setEpisodePaused(formData: FormData) {
  const productionId = String(formData.get("production_id") ?? "");
  const pause = formData.get("pause") === "1";
  const owned = await ownedEpisode(String(formData.get("episode_id") ?? ""));
  if (!owned) back(productionId, "Bölüm bulunamadı");

  const { error } = await owned!.supabase
    .from("episodes")
    .update({ status: pause ? "paused" : "published" })
    .eq("id", owned!.episode.id)
    .eq("status", pause ? "published" : "paused");
  revalidateContent(productionId);
  back(productionId, error ? "Bu bölümün durumu değiştirilemez" : undefined);
}

export async function setSeriesPaused(formData: FormData) {
  const { supabase } = await getCreatorId();
  const productionId = String(formData.get("production_id") ?? "");
  const pause = formData.get("pause") === "1";

  const { error } = await supabase
    .from("series")
    .update({ status: pause ? "paused" : "published" })
    .eq("production_id", productionId)
    .eq("status", pause ? "published" : "paused");
  revalidateContent(productionId);
  back(productionId, error ? "Dizinin durumu değiştirilemez" : undefined);
}

export async function deleteProduction(formData: FormData) {
  const { supabase } = await getCreatorId();
  const productionId = String(formData.get("production_id") ?? "");

  const { data: owns } = await supabase.rpc("owns_production", { p_production_id: productionId });
  if (!owns) back(productionId, "Yapım bulunamadı");

  const result = await deleteProductionPermanently(createAdminClient(), productionId);
  if (!result.ok) back(productionId, result.error);

  revalidatePath("/studio/productions");
  revalidatePath("/");
  redirect("/studio/productions");
}

/**
 * Sends every pending episode that has a ready video to review. A new series
 * goes to review with them; a published series stays on air while only the
 * new episodes are reviewed.
 */
export async function submitForReview(formData: FormData) {
  const { supabase } = await getCreatorId();

  const seriesId = String(formData.get("series_id") ?? "");
  const productionId = String(formData.get("production_id") ?? "");

  const { data: series } = await supabase.from("series").select("id, status").eq("id", seriesId).maybeSingle();
  if (!series) back(productionId, "Dizi bulunamadı");
  if (series!.status === "blocked") back(productionId, "Bu dizi platform tarafından durduruldu");

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, status, seasons!inner(series_id), video_assets(status)")
    .eq("seasons.series_id", seriesId)
    .in("status", EDITABLE_STATUSES);
  const ready = (episodes ?? []).filter((e) =>
    (e.video_assets ?? []).some((a: { status: string }) => a.status === "ready")
  );
  if (!ready.length) {
    back(
      productionId,
      episodes?.length
        ? "Onaya göndermek için en az bir bölümün videosu hazır olmalı"
        : "Onaya gönderilecek yeni bölüm yok"
    );
  }

  const { error } = await supabase
    .from("episodes")
    .update({ status: "moderating", moderation_note: null })
    .in("id", ready.map((e) => e.id));
  if (error) back(productionId, error.message);

  if (EDITABLE_STATUSES.includes(series!.status)) {
    const { error: sErr } = await supabase
      .from("series")
      .update({ status: "moderating", moderation_note: null })
      .eq("id", seriesId);
    if (sErr) back(productionId, sErr.message);
  }

  revalidatePath(`/studio/productions/${productionId}`);
  back(productionId);
}
