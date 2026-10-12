import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Signed-in creator or redirect (login / onboarding). */
export async function requireCreator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: creator } = await supabase
    .from("creator_profiles")
    .select("id, creator_name, bio, website_url")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!creator) redirect("/onboarding");

  return { supabase, user, creator };
}

export const formatTry = (minor: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);
