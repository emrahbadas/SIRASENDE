"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCreator } from "../require-creator";

const errors: Record<string, string> = {
  below_min_payout: "Tutar minimum ödeme limitinin altında",
  payout_already_pending: "Bekleyen bir ödeme talebin zaten var",
  insufficient_balance: "Bakiye yetersiz",
};

export async function requestPayout(formData: FormData) {
  const { supabase } = await requireCreator();
  const amount = Number(String(formData.get("amount") ?? "").replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/studio/revenue?error=" + encodeURIComponent("Geçerli bir tutar gir"));
  }

  const { error } = await supabase.rpc("request_payout", { p_amount_minor: Math.round(amount * 100) });
  if (error) {
    const key = Object.keys(errors).find((k) => error.message.includes(k));
    redirect("/studio/revenue?error=" + encodeURIComponent((key && errors[key]) || error.message));
  }

  revalidatePath("/studio/revenue");
  redirect("/studio/revenue?requested=1");
}
