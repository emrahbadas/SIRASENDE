import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { currentMonth, money, monthLabel, parseMonth, shiftMonth, statementStatus, type StatementData } from "@/lib/statements";
import { setPayoutsEnabled } from "../actions";

export const dynamic = "force-dynamic";

const statusLabels = {
  open: { label: "Ara dönem", cls: "border-sky-800 text-sky-400" },
  none: { label: "Hareket yok", cls: "border-zinc-700 text-zinc-500" },
  paid: { label: "Ödendi", cls: "border-emerald-800 text-emerald-400" },
  accrued: { label: "Tahakkuk", cls: "border-amber-800 text-amber-400" },
} as const;

/** Monthly earnings per creator (admin): what each creator earned, how, and what is owed. */
export default async function AdminStatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const month = parseMonth(sp.month) ? sp.month! : currentMonth();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  const [{ data: rows }, { data: setting }] = await Promise.all([
    supabase.rpc("admin_statement_overview", { p_month: `${month}-01` }),
    supabase.from("platform_settings").select("value").eq("key", "payouts_enabled").maybeSingle(),
  ]);
  const list = (rows ?? []) as (StatementData & { statement: { number: string } | null })[];
  const payoutsEnabled = setting?.value === true;

  const sum = (f: (r: StatementData) => number) => list.reduce((n, r) => n + f(r), 0);
  const totals = {
    ad: sum((r) => r.ad.creator),
    coin: sum((r) => r.coin.creator),
    promo: sum((r) => r.coin.promo),
    other: sum((r) => r.download.creator + r.other),
    earned: sum((r) => r.earned),
    platform: sum((r) => r.ad.platform + r.coin.platform + r.download.platform),
    paid: sum((r) => r.paid_total),
    closing: sum((r) => r.closing),
  };
  const isCurrent = month === currentMonth();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hakediş raporu</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Her creator&apos;ın dönem kazancı kalem kalem; belgeler yazdırılabilir ve QR ile doğrulanabilir.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/admin/statements?month=${shiftMonth(month, -1)}`} className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-zinc-600">
            ←
          </Link>
          <span className="min-w-32 text-center font-medium capitalize">{monthLabel(month)}</span>
          {isCurrent ? (
            <span className="rounded-lg border border-zinc-900 px-3 py-1.5 text-zinc-700">→</span>
          ) : (
            <Link href={`/admin/statements?month=${shiftMonth(month, 1)}`} className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:border-zinc-600">
              →
            </Link>
          )}
          <Link
            href={`/admin/statements/print?month=${month}`}
            className="rounded-lg bg-orange-600 px-3 py-1.5 font-medium hover:bg-orange-500"
          >
            PDF / Yazdır
          </Link>
          <a
            href={`/admin/statements/csv?month=${month}`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 font-medium hover:border-zinc-500"
          >
            CSV indir
          </a>
        </div>
      </div>

      {sp.error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">{decodeURIComponent(sp.error)}</p>
      )}

      <section
        className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${
          payoutsEnabled ? "border-emerald-900 bg-emerald-950/20" : "border-amber-900 bg-amber-950/20"
        }`}
      >
        <div>
          <p className="font-semibold">Ödeme talepleri {payoutsEnabled ? "açık" : "kapalı"}</p>
          <p className="mt-0.5 text-sm text-zinc-400">
            {payoutsEnabled
              ? "Creator'lar bakiyelerinden ödeme talep edebiliyor."
              : "Creator'lar kazanmaya devam ediyor, bakiyeleri birikiyor; ödeme talebi açılamıyor."}
          </p>
        </div>
        <form action={setPayoutsEnabled}>
          <input type="hidden" name="enabled" value={payoutsEnabled ? "0" : "1"} />
          <ConfirmSubmit
            message={
              payoutsEnabled
                ? "Ödeme talepleri kapatılsın mı? Bekleyen talepler etkilenmez."
                : "Ödeme talepleri açılsın mı? Creator'lar IBAN'larına para çekmeyi talep edebilecek."
            }
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              payoutsEnabled ? "border border-zinc-700 hover:border-zinc-500" : "bg-emerald-600 hover:bg-emerald-500"
            }`}
          >
            {payoutsEnabled ? "Ödemeleri kapat" : "Ödemeleri aç"}
          </ConfirmSubmit>
        </form>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Creator hakedişi" value={money(totals.earned)} accent />
        <Stat label="Platform payı" value={money(totals.platform)} />
        <Stat label="Dönemde ödenen" value={money(totals.paid)} />
        <Stat label="Toplam borç (bakiye)" value={money(totals.closing)} />
      </div>

      {list.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-12 text-center text-zinc-500">
          Bu dönem için hakediş hareketi olan creator yok.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2 text-right">Devreden</th>
                <th className="px-3 py-2 text-right">Reklam</th>
                <th className="px-3 py-2 text-right">Coin</th>
                <th className="px-3 py-2 text-right">Bonus destek</th>
                <th className="px-3 py-2 text-right">Diğer</th>
                <th className="px-3 py-2 text-right">Hakediş</th>
                <th className="px-3 py-2 text-right">Ödenen</th>
                <th className="px-3 py-2 text-right">Bakiye</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {list.map((r) => {
                const st = statusLabels[statementStatus(r)];
                return (
                  <tr key={r.creator.id} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2">
                      <p className="font-medium">{r.creator.name}</p>
                      <p className="text-xs text-zinc-500">
                        {r.creator.iban_last4 ? `IBAN •••• ${r.creator.iban_last4}` : "IBAN yok"}
                        {r.statement && <span className="ml-2 font-mono">{r.statement.number}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{money(r.opening)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.ad.creator)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {money(r.coin.creator)}
                      {r.coin.unlocks > 0 && <span className="block text-xs text-zinc-500">{r.coin.unlocks} bölüm</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.coin.promo)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.download.creator + r.other)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-orange-300">{money(r.earned)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.paid_total)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(r.closing)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/statements/${r.creator.id}/${month}`}
                        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs hover:border-orange-500"
                      >
                        Belge
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-zinc-700 bg-zinc-900/40 font-semibold">
              <tr>
                <td className="px-3 py-2">Toplam</td>
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.ad)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.coin)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.promo)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.other)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-orange-300">{money(totals.earned)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(totals.closing)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Dönemler Türkiye saatine göre ayın 1&apos;i 00:00 ile ay sonu arasıdır. İçinde bulunulan ay &quot;ara dönem&quot;
        olarak görünür ve ay bitince kesinleşir.
      </p>
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-orange-300" : ""}`}>{value}</p>
    </div>
  );
}
