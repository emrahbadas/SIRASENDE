"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireModerator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", user.id)
    .in("role", ["admin", "moderator"]);

  if (!roles?.length) redirect("/");

  return supabase;
}

export async function approveSeries(formData: FormData) {
  const supabase = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");

  const { error } = await supabase
    .from("series")
    .update({ status: "published", moderation_note: null })
    .eq("id", seriesId)
    .eq("status", "moderating");

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  // Publish the series' episodes so they appear on the public page
  const { data: seasons } = await supabase
    .from("seasons")
    .select("id")
    .eq("series_id", seriesId);

  const seasonIds = (seasons ?? []).map((s) => s.id);
  if (seasonIds.length) {
    await supabase
      .from("episodes")
      .update({ status: "published", published_at: new Date().toISOString() })
      .in("season_id", seasonIds)
      .eq("status", "draft");
  }

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

export async function rejectSeries(formData: FormData) {
  const supabase = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase
    .from("series")
    .update({ status: "rejected", moderation_note: note })
    .eq("id", seriesId)
    .eq("status", "moderating");

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin");
  redirect("/admin");
}

export async function requestChanges(formData: FormData) {
  const supabase = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!note) {
    redirect("/admin?error=" + encodeURIComponent("Düzeltme isteğinde not zorunlu"));
  }

  const { error } = await supabase
    .from("series")
    .update({ status: "needs_changes", moderation_note: note })
    .eq("id", seriesId)
    .eq("status", "moderating");

  if (error) {
    redirect("/admin?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin");
  redirect("/admin");
}
