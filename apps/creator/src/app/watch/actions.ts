"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const unlockErrors: Record<string, string> = {
  insufficient_coins: "Yeterli coinin yok",
  episode_not_locked: "Bu bölüm zaten açık",
  episode_not_available: "Bu bölüm şu an yayında değil",
};

export async function unlockWithCoins(formData: FormData) {
  const episodeId = String(formData.get("episode_id") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("unlock_episode_with_coins", { p_episode_id: episodeId });
  if (error) {
    const key = Object.keys(unlockErrors).find((k) => error.message.includes(k));
    redirect(
      `/watch/${episodeId}?error=` + encodeURIComponent(key ? unlockErrors[key]! : "Bölüm açılamadı")
    );
  }

  revalidatePath(`/watch/${episodeId}`);
  redirect(`/watch/${episodeId}`);
}
