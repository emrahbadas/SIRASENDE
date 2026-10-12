import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { formatIban } from "@/lib/iban";
import { formatTry } from "@/app/studio/require-creator";
import { resolvePayout } from "../actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const statusLabels: Record<string, { label: string; cls: string }> = {
  requested: { label: "Bekliyor", cls: "border-amber-800 text-amber-400" },
  processing: { label: "İşleniyor", cls: "border-sky-800 text-sky-400" },
  paid: { label: "Ödendi", cls: "border-emerald-800 text-emerald-400" },
  rejected: { label: "Reddedildi", cls: "border-rose-800 text-rose-400" },
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; all?: string }>;
}) {
  const { error, all } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Payout data (amounts, IBANs) is admin-only
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("profile_id", user.id)
    .eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  let query = supabase
    .from("payout_requests")
    .select("id, amount_minor, status, account_holder, iban, provider_reference, admin_note, created_at, creator_profiles(creator_name)")
    .order("created_at", { ascending: !all })
    .limit(100);
  if (!all) query = query.in("status", ["requested", "processing"]);
  const { data: payouts } = await query;

  const openTotal = (payouts ?? [])
    .filter((p) => p.status === "requested" || p.status === "processing")
    .reduce((n, p) => n + p.amount_minor, 0);
  const returnTo = all ? "/admin/payouts?all=1" : "/admin/payouts";

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Creator ödemeleri</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Parayı bankadan IBAN&apos;a gönderdikten sonra işlem referansıyla &quot;Ödendi&quot; işaretle. Reddedilen
        talebin tutarı creator&apos;ın bakiyesine geri döner.
      </p>

      <nav className="mt-6 flex items-center gap-2">
        <Link
          href="/admin/payouts"
          className={`rounded-full border px-3 py-1 text-sm ${!all ? "border-orange-600 bg-orange-950/40 text-orange-200" : "border-zinc-800 text-zinc-400"}`}
        >
          Bekleyenler
        </Link>
        <Link
          href="/admin/payouts?all=1"
          className={`rounded-full border px-3 py-1 text-sm ${all ? "border-orange-600 bg-orange-950/40 text-orange-200" : "border-zinc-800 text-zinc-400"}`}
        >
          Tümü
        </Link>
        {!all && openTotal > 0 && (
          <span className="ml-auto text-sm text-zinc-400">Bekleyen toplam: {formatTry(openTotal)}</span>
        )}
      </nav>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      {!payouts?.length ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          {all ? "Henüz ödeme talebi yok." : "Bekleyen ödeme talebi yok."}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {payouts.map((p) => {
            const st = statusLabels[p.status] ?? { label: p.status, cls: "border-zinc-700 text-zinc-400" };
            const open = p.status === "requested" || p.status === "processing";
            return (
              <li key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 font-semibold">
                      {formatTry(p.amount_minor)}
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-normal ${st.cls}`}>{st.label}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {one(p.creator_profiles)?.creator_name} · {new Date(p.created_at).toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-sm">
                      {p.account_holder ?? "—"} ·{" "}
                      <span className="font-mono">{p.iban ? formatIban(p.iban) : "IBAN yok"}</span>
                    </p>
                    {p.provider_reference && <p className="mt-1 text-xs text-zinc-500">Referans: {p.provider_reference}</p>}
                    {p.admin_note && <p className="mt-1 text-xs text-zinc-500">Not: {p.admin_note}</p>}
                  </div>
                </div>

                {open && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <form action={resolvePayout} className="flex gap-2">
                      <input type="hidden" name="payout_id" value={p.id} />
                      <input type="hidden" name="paid" value="1" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input
                        name="reference"
                        placeholder="Banka işlem referansı"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-emerald-600"
                      />
                      <ConfirmSubmit
                        message={`${formatTry(p.amount_minor)} ödendi olarak işaretlensin mi? Para gerçekten gönderildiyse onayla.`}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500"
                      >
                        Ödendi
                      </ConfirmSubmit>
                    </form>
                    <form action={resolvePayout} className="flex gap-2">
                      <input type="hidden" name="payout_id" value={p.id} />
                      <input type="hidden" name="paid" value="0" />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <input
                        name="note"
                        placeholder="Red sebebi (creator görür)"
                        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-orange-500"
                      />
                      <ConfirmSubmit
                        message="Talep reddedilsin mi? Tutar creator'ın bakiyesine geri döner."
                        className="shrink-0 rounded-lg border border-rose-800 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-950"
                      >
                        Reddet
                      </ConfirmSubmit>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
