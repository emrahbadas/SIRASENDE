"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/account/delete";

export async function deleteMyAccount(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Faccount%2Fdelete");

  if (String(formData.get("confirm") ?? "").trim().toLocaleUpperCase("tr") !== "SİL") {
    redirect("/account/delete?error=" + encodeURIComponent("Onaylamak için kutuya SİL yaz"));
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) redirect("/account/delete?error=" + encodeURIComponent(result.error));

  await supabase.auth.signOut().catch(() => undefined);
  redirect("/account/delete?done=1");
}
