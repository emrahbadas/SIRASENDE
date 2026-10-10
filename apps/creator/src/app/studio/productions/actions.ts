"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const rightsAccepted = formData.get("rights") === "on";
  if (!rightsAccepted) {
    redirect("/studio/productions/new?error=" + encodeURIComponent("Hak beyanını kabul etmelisin"));
  }

  const description = optional(formData.get("description"));
  const primaryLanguage = String(formData.get("primary_language") ?? "tr");

  const { data: production, error: pErr } = await supabase
    .from("productions")
    .insert({
      creator_id: creatorId,
      title,
      description,
      production_type: String(formData.get("production_type") ?? "human"),
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

export async function deleteEpisode(formData: FormData) {
  const { supabase } = await getCreatorId();

  const episodeId = String(formData.get("episode_id") ?? "");
  const productionId = String(formData.get("production_id") ?? "");

  // Only draft episodes can be deleted from the UI
  await supabase.from("episodes").delete().eq("id", episodeId).eq("status", "draft");

  revalidatePath(`/studio/productions/${productionId}`);
  redirect(`/studio/productions/${productionId}`);
}

export async function submitForReview(formData: FormData) {
  const { supabase } = await getCreatorId();

  const seriesId = String(formData.get("series_id") ?? "");
  const productionId = String(formData.get("production_id") ?? "");

  const { error } = await supabase
    .from("series")
    .update({ status: "moderating" })
    .eq("id", seriesId)
    .eq("status", "draft");

  if (error) {
    redirect(`/studio/productions/${productionId}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath(`/studio/productions/${productionId}`);
  redirect(`/studio/productions/${productionId}`);
}
