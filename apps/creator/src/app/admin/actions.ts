"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteEpisodePermanently, deleteProductionPermanently } from "@/lib/content/manage";

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

  return { supabase, isAdmin: roles.some((r) => r.role === "admin") };
}

// Same-site return path from the form (queue, review page or productions list)
function back(formData: FormData, error?: string): never {
  const raw = String(formData.get("return_to") ?? "");
  const path = /^\/admin(\/|$|\?)/.test(raw) ? raw : "/admin";
  if (!error) redirect(path);
  redirect(path + (path.includes("?") ? "&" : "?") + "error=" + encodeURIComponent(error));
}

function revalidateAll() {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}

async function episodeIdsInReview(supabase: Awaited<ReturnType<typeof createClient>>, seriesId: string) {
  const { data } = await supabase
    .from("episodes")
    .select("id, seasons!inner(series_id)")
    .eq("seasons.series_id", seriesId)
    .eq("status", "moderating");
  return (data ?? []).map((e) => e.id);
}

/**
 * Publishes everything under review in the series: the series itself when it
 * is new, and the episodes the creator submitted.
 */
export async function approveSeries(formData: FormData) {
  const { supabase } = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");

  const { error } = await supabase
    .from("series")
    .update({ status: "published", moderation_note: null })
    .eq("id", seriesId)
    .eq("status", "moderating");
  if (error) back(formData, error.message);

  const ids = await episodeIdsInReview(supabase, seriesId);
  if (ids.length) {
    const { error: eErr } = await supabase
      .from("episodes")
      .update({ status: "published", published_at: new Date().toISOString(), moderation_note: null })
      .in("id", ids);
    if (eErr) back(formData, eErr.message);
  }

  revalidateAll();
  redirect("/admin");
}

/** Sends the reviewed content back with a note ("rejected" or "needs_changes"). */
async function sendBack(formData: FormData, status: "rejected" | "needs_changes") {
  const { supabase } = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (status === "needs_changes" && !note) back(formData, "Düzeltme isteğinde not zorunlu");

  // A new series goes back as a whole; a published one stays on air
  const { error } = await supabase
    .from("series")
    .update({ status, moderation_note: note })
    .eq("id", seriesId)
    .eq("status", "moderating");
  if (error) back(formData, error.message);

  const ids = await episodeIdsInReview(supabase, seriesId);
  if (ids.length) {
    const { error: eErr } = await supabase.from("episodes").update({ status, moderation_note: note }).in("id", ids);
    if (eErr) back(formData, eErr.message);
  }

  revalidateAll();
  redirect("/admin");
}

export async function rejectSeries(formData: FormData) {
  await sendBack(formData, "rejected");
}

export async function requestChanges(formData: FormData) {
  await sendBack(formData, "needs_changes");
}

/** Takes a series off the air (only staff can restore it) or restores it. */
export async function setSeriesBlocked(formData: FormData) {
  const { supabase } = await requireModerator();
  const seriesId = String(formData.get("series_id") ?? "");
  const block = formData.get("block") === "1";
  const note = String(formData.get("note") ?? "").trim() || null;

  const { error } = await supabase
    .from("series")
    .update(block ? { status: "blocked", moderation_note: note } : { status: "published", moderation_note: null })
    .eq("id", seriesId)
    .in("status", block ? ["published", "paused", "moderating"] : ["blocked"]);
  if (error) back(formData, error.message);

  revalidateAll();
  back(formData);
}

export async function setEpisodeBlocked(formData: FormData) {
  const { supabase } = await requireModerator();
  const episodeId = String(formData.get("episode_id") ?? "");
  const block = formData.get("block") === "1";

  const { error } = await supabase
    .from("episodes")
    .update({ status: block ? "blocked" : "published" })
    .eq("id", episodeId)
    .in("status", block ? ["published", "paused"] : ["blocked"]);
  if (error) back(formData, error.message);

  revalidateAll();
  back(formData);
}

export async function adminDeleteEpisode(formData: FormData) {
  const { isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Silme yetkisi yalnızca adminlerde");

  const result = await deleteEpisodePermanently(createAdminClient(), String(formData.get("episode_id") ?? ""));
  revalidateAll();
  back(formData, result.ok ? undefined : result.error);
}

export async function adminDeleteProduction(formData: FormData) {
  const { isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Silme yetkisi yalnızca adminlerde");

  const result = await deleteProductionPermanently(createAdminClient(), String(formData.get("production_id") ?? ""));
  if (!result.ok) back(formData, result.error);

  revalidateAll();
  redirect("/admin/productions");
}

/** Admin marks a payout as sent to the bank (with a reference) or rejects it (earnings refunded). */
export async function resolvePayout(formData: FormData) {
  const { supabase, isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Ödemeleri yalnızca adminler sonuçlandırabilir");

  const paid = formData.get("paid") === "1";
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (paid && !reference) back(formData, "Ödendi işaretlemek için banka işlem referansını gir");
  if (!paid && !note) back(formData, "Reddederken creator'a bir sebep yaz");

  const { error } = await supabase.rpc("resolve_payout", {
    p_payout_id: String(formData.get("payout_id") ?? ""),
    p_paid: paid,
    p_reference: reference,
    p_note: note,
  });
  if (error) back(formData, error.message.includes("payout_not_open") ? "Bu talep zaten sonuçlanmış" : error.message);

  revalidatePath("/admin/payouts");
  back(formData);
}

/** Admin gives a creator a time-boxed grant (storage minutes for now). */
export async function grantCreator(formData: FormData) {
  const { supabase, isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Hak atama yalnızca adminlerde");

  const minutes = Number(formData.get("minutes"));
  const days = Number(formData.get("days"));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 100000) back(formData, "Geçerli bir dakika gir");
  if (!Number.isInteger(days) || days < 1 || days > 366) back(formData, "Süre 1–366 gün olmalı");

  const { error } = await supabase.rpc("admin_grant", {
    p_creator_id: String(formData.get("creator_id") ?? ""),
    p_kind: "storage_minutes",
    p_value: minutes,
    p_days: days,
    p_note: String(formData.get("note") ?? "").trim() || null,
  });
  if (error) back(formData, error.message);

  revalidatePath("/admin/campaigns");
  back(formData);
}

export async function revokeGrant(formData: FormData) {
  const { supabase, isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Hak geri alma yalnızca adminlerde");

  const { error } = await supabase.rpc("admin_revoke_grant", { p_grant_id: String(formData.get("grant_id") ?? "") });
  if (error) back(formData, error.message);

  revalidatePath("/admin/campaigns");
  back(formData);
}

const banErrors: Record<string, string> = {
  ban_reason_required: "Ban sebebini yaz (en az 3 karakter)",
  creator_not_found_or_already_banned: "Creator bulunamadı veya zaten banlı",
  creator_not_banned: "Bu creator banlı değil",
};

/** Admin suspends a creator: their live and in-review series are blocked. */
export async function banCreator(formData: FormData) {
  const { supabase, isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Ban yalnızca adminlerde");

  const { error } = await supabase.rpc("admin_ban_creator", {
    p_creator_id: String(formData.get("creator_id") ?? ""),
    p_reason: String(formData.get("reason") ?? ""),
  });
  if (error) {
    const key = Object.keys(banErrors).find((k) => error.message.includes(k));
    back(formData, (key && banErrors[key]) || error.message);
  }

  revalidateAll();
  back(formData);
}

/** Lifts the ban and restores the series the ban had blocked. */
export async function unbanCreator(formData: FormData) {
  const { supabase, isAdmin } = await requireModerator();
  if (!isAdmin) back(formData, "Ban açma yalnızca adminlerde");

  const { error } = await supabase.rpc("admin_unban_creator", {
    p_creator_id: String(formData.get("creator_id") ?? ""),
  });
  if (error) {
    const key = Object.keys(banErrors).find((k) => error.message.includes(k));
    back(formData, (key && banErrors[key]) || error.message);
  }

  revalidateAll();
  back(formData);
}
