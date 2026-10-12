"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isValidTrIban, normalizeIban } from "@/lib/iban";
import { requireCreator } from "../require-creator";

const errors: Record<string, string> = {
  below_min_payout: "Tutar minimum ödeme limitinin altında",
  payout_already_pending: "Bekleyen bir ödeme talebin zaten var",
  insufficient_balance: "Bakiye yetersiz",
  payout_account_missing: "Önce ödeme alacağın IBAN'ı kaydet",
};

const fail = (msg: string): never => redirect("/studio/revenue?error=" + encodeURIComponent(msg));

export async function requestPayout(formData: FormData) {
  const { supabase } = await requireCreator();
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) fail("Geçerli bir tutar gir");

  const { error } = await supabase.rpc("request_payout", { p_amount_minor: Math.round(amount * 100) });
  if (error) {
    const key = Object.keys(errors).find((k) => error.message.includes(k));
    fail((key && errors[key]) || error.message);
  }

  revalidatePath("/studio/revenue");
  redirect("/studio/revenue?requested=1");
}

export async function savePayoutAccount(formData: FormData) {
  const { supabase, creator } = await requireCreator();
  const holder = String(formData.get("account_holder") ?? "").trim();
  const iban = normalizeIban(String(formData.get("iban") ?? ""));

  if (holder.length < 3 || holder.length > 100) fail("Hesap sahibinin adını tam yaz");
  if (!isValidTrIban(iban)) fail("IBAN geçersiz. TR ile başlayan 26 karakterlik IBAN'ını kontrol et");

  const { error } = await supabase
    .from("creator_payout_accounts")
    .upsert({ creator_id: creator.id, account_holder: holder, iban }, { onConflict: "creator_id" });
  if (error) fail(error.message);

  revalidatePath("/studio/revenue");
  redirect("/studio/revenue?saved=1");
}
