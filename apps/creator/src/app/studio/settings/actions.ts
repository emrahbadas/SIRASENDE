"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCreator } from "../require-creator";

export async function updateCreatorProfile(formData: FormData) {
  const { supabase, creator } = await requireCreator();

  const name = String(formData.get("creator_name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const website = String(formData.get("website_url") ?? "").trim();

  const fail = (msg: string) => redirect("/studio/settings?error=" + encodeURIComponent(msg));
  if (name.length < 2 || name.length > 60) fail("Creator adı 2–60 karakter olmalı");
  if (bio.length > 500) fail("Biyografi en fazla 500 karakter olabilir");
  if (website && !/^https?:\/\/\S+\.\S+/.test(website)) fail("Web sitesi http:// veya https:// ile başlamalı");

  const { error } = await supabase
    .from("creator_profiles")
    .update({ creator_name: name, bio: bio || null, website_url: website || null })
    .eq("id", creator.id);
  if (error) fail(error.message);

  revalidatePath("/studio", "layout");
  redirect("/studio/settings?saved=1");
}
