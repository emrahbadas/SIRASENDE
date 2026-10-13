import { createAdminClient } from "@/lib/supabase/admin";
import { deleteProductionPermanently } from "@/lib/content/manage";

export type DeleteResult = { ok: true; mode: "deleted" | "anonymized" } | { ok: false; error: string };

const messages: Record<string, string> = {
  payout_pending: "Bekleyen bir ödeme talebin var. Sonuçlandıktan sonra hesabını silebilirsin.",
};

/**
 * Deletes a user's account (Google Play account deletion requirement).
 * Personal data is removed or anonymised; financial records that must be kept
 * stay without personal data. The auth user is deleted outright when nothing
 * financial references it, otherwise its email is scrubbed and sign-in blocked.
 * Caller must have verified that `userId` is the signed-in user.
 */
export async function deleteAccount(userId: string, accessToken?: string): Promise<DeleteResult> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("anonymize_account", { p_profile_id: userId }).single<{
    production_ids: string[];
  }>();
  if (error) {
    const key = Object.keys(messages).find((k) => error.message.includes(k));
    return { ok: false, error: (key && messages[key]) || "Hesap silinemedi, lütfen tekrar dene" };
  }

  // Creator content: delete the videos (frees storage, removes the footage)
  for (const productionId of data?.production_ids ?? []) {
    await deleteProductionPermanently(admin, productionId).catch(() => undefined);
  }

  if (accessToken) await admin.auth.admin.signOut(accessToken, "global").catch(() => undefined);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (!deleteError) return { ok: true, mode: "deleted" };

  // Financial rows reference the profile: keep the row, drop what identifies the person
  const { error: scrubError } = await admin.auth.admin.updateUserById(userId, {
    email: `deleted+${userId}@deleted.invalid`,
    phone: "",
    user_metadata: {},
    ban_duration: "876000h",
  });
  if (scrubError) return { ok: false, error: "Hesap silinemedi, lütfen tekrar dene" };
  return { ok: true, mode: "anonymized" };
}
