import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { PrintButton } from "@/components/print-button";
import { StatementDocument } from "@/components/statement-document";
import {
  TEXT,
  currentMonth,
  dateText,
  money,
  monthLabel,
  parseLang,
  parseMonth,
  statementStatus,
  type StatementData,
} from "@/lib/statements";
import { qrSvg, statementVerifyUrl } from "@/lib/statement-qr";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ month?: string }> }): Promise<Metadata> {
  const { month } = await searchParams;
  return { title: `Dönem Hakediş Özeti · ${monthLabel(parseMonth(month) ? month! : currentMonth())}` };
}

const S = {
  tr: {
    title: "DÖNEM HAKEDİŞ ÖZETİ",
    reportNo: "Rapor No",
    creators: "Creator sayısı",
    creator: "Creator",
    opening: "Devreden",
    ad: "Reklam",
    coin: "Coin",
    promo: "Bonus destek",
    other: "Diğer",
    earned: "Hakediş",
    paid: "Ödenen",
    closing: "Bakiye",
    status: "Durum",
    total: "Toplam",
    platformBox: "PLATFORM PAYI",
    platformSub: "Reklam + coin + indirme",
    creatorBox: "CREATOR HAKEDİŞİ",
    paidBox: "DÖNEMDE ÖDENEN",
    owedBox: "TOPLAM BORÇ (BAKİYE)",
    coinBox: "COİN SATIŞ KIRILIMI",
    gross: "İzleyici ödemesi (KDV dahil)",
    vat: "KDV",
    storeFee: "Mağaza komisyonu",
    net: "Net gelir",
    delivery: "Video dağıtım maliyeti",
    unlocks: "Coin ile açılan bölüm",
    none: "Bu dönem için hakediş hareketi olan creator yok.",
    statuses: { open: "Ara dönem", none: "Hareket yok", paid: "Ödendi", accrued: "Tahakkuk" },
    note: "Bu özet, Sıra Senin platformunun muhasebe kayıtlarından otomatik hazırlanmıştır. Her creator'ın kalem kalem dökümü, numaralı ve QR ile doğrulanabilir creator hakediş belgesindedir. Dönemler Türkiye saatine göredir; içinde bulunulan ay ara dönemdir ve ay sonunda kesinleşir.",
    sign: "Hazırlayan İmza",
    footer: "Sıra Senin · Dönem Hakediş Özeti",
    withDocs: "Creator belgeleriyle",
    withoutDocs: "Yalnızca özet",
  },
  en: {
    title: "PERIOD EARNINGS SUMMARY",
    reportNo: "Report No",
    creators: "Creators",
    creator: "Creator",
    opening: "Carried",
    ad: "Ads",
    coin: "Coins",
    promo: "Bonus support",
    other: "Other",
    earned: "Earned",
    paid: "Paid",
    closing: "Balance",
    status: "Status",
    total: "Total",
    platformBox: "PLATFORM SHARE",
    platformSub: "Ads + coins + downloads",
    creatorBox: "CREATOR EARNINGS",
    paidBox: "PAID IN PERIOD",
    owedBox: "TOTAL OWED (BALANCE)",
    coinBox: "COIN SALES BREAKDOWN",
    gross: "Viewer payments (incl. VAT)",
    vat: "VAT",
    storeFee: "Store fee",
    net: "Net revenue",
    delivery: "Video delivery cost",
    unlocks: "Episodes unlocked with coins",
    none: "No creator has earnings activity in this period.",
    statuses: { open: "Interim", none: "No activity", paid: "Paid", accrued: "Accrued" },
    note: "This summary is generated automatically from the Sıra Senin platform ledger. Each creator's itemised breakdown is in their numbered, QR-verifiable creator earnings statement. Periods follow Turkey time; the current month is interim and becomes final at month end.",
    sign: "Prepared by",
    footer: "Sıra Senin · Period Earnings Summary",
    withDocs: "With creator statements",
    withoutDocs: "Summary only",
  },
} as const;

type Row = StatementData & { statement: { number: string } | null };

/** Printable admin summary of a month; optionally followed by every creator's own statement. */
export default async function AdminStatementsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; lang?: string; docs?: string }>;
}) {
  const sp = await searchParams;
  const month = parseMonth(sp.month) ? sp.month! : currentMonth();
  const lang = parseLang(sp.lang);
  const withDocs = sp.docs === "1";
  const s = S[lang];
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  const { data } = await supabase.rpc("admin_statement_overview", { p_month: `${month}-01` });
  const rows = (data ?? []) as Row[];

  // Creator statements (numbered on first print) to append after the summary
  const docs = withDocs
    ? await Promise.all(
        rows.map(async (r) => {
          const { data: issued } = await supabase
            .rpc("issue_creator_statement", { p_creator_id: r.creator.id, p_month: `${month}-01` })
            .single<{ number: string; token: string; issued_at: string }>();
          if (!issued) return null;
          return { row: r, issued, svg: await qrSvg(await statementVerifyUrl(issued.number, issued.token)) };
        }),
      )
    : [];

  const sum = (f: (r: Row) => number) => rows.reduce((n, r) => n + f(r), 0);
  const tot = {
    opening: sum((r) => r.opening),
    ad: sum((r) => r.ad.creator),
    coin: sum((r) => r.coin.creator),
    promo: sum((r) => r.coin.promo),
    other: sum((r) => r.download.creator + r.other),
    earned: sum((r) => r.earned),
    paid: sum((r) => r.paid_total),
    closing: sum((r) => r.closing),
    platform: sum((r) => r.ad.platform + r.coin.platform + r.download.platform),
    gross: sum((r) => r.coin.gross),
    vat: sum((r) => r.coin.vat),
    storeFee: sum((r) => r.coin.store_fee),
    net: sum((r) => r.coin.net),
    delivery: sum((r) => r.coin.net - r.coin.base),
    unlocks: sum((r) => r.coin.unlocks),
  };
  const m = (v: number) => money(v, lang);
  const reportNo = `SS-${month}-OZET`;
  const query = (o: Record<string, string>) =>
    "?" + new URLSearchParams({ month, lang, ...(withDocs ? { docs: "1" } : {}), ...o }).toString();

  return (
    <main className="statement-page min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .statement-page { min-height: 0; }
          .statement { width: auto !important; }
          .page-break { break-before: page; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .statement { width: 210mm; max-width: 100%; }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/admin/statements?month=${month}`} className="text-sm text-slate-600 hover:text-slate-900">
          ← Hakediş raporu
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={query({ docs: withDocs ? "0" : "1" })}
            className="rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          >
            {withDocs ? s.withoutDocs : s.withDocs}
          </Link>
          <Link
            href={query({ lang: lang === "tr" ? "en" : "tr" })}
            className="rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          >
            {TEXT[lang].langSwitch}
          </Link>
          <PrintButton label={TEXT[lang].print} />
        </div>
      </div>

      <article className="statement mx-auto bg-white px-12 py-12 text-[13px] leading-snug text-slate-800 shadow-xl print:px-0 print:py-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand-mark.svg" alt="" width={34} height={34} />
              <p className="text-3xl font-extrabold tracking-tight text-slate-900">
                <span className="text-orange-600">Sıra</span> Senin
              </p>
            </div>
            <p className="mt-2 text-[11px] font-semibold tracking-[0.25em] text-slate-600">{s.title}</p>
          </div>
          <dl className="space-y-0.5 text-right text-[12px]">
            <div>
              <dt className="inline font-semibold text-slate-700">{s.reportNo}: </dt>
              <dd className="inline font-mono text-slate-600">{reportNo}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-700">{TEXT[lang].period}: </dt>
              <dd className="inline text-slate-600">{monthLabel(month, lang)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-700">{s.creators}: </dt>
              <dd className="inline text-slate-600">{rows.length}</dd>
            </div>
          </dl>
        </header>

        <div className="mt-6 grid grid-cols-4 gap-3">
          <Box label={s.creatorBox} value={m(tot.earned)} accent />
          <Box label={s.platformBox} value={m(tot.platform)} sub={s.platformSub} />
          <Box label={s.paidBox} value={m(tot.paid)} />
          <Box label={s.owedBox} value={m(tot.closing)} />
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-500">{s.none}</p>
        ) : (
          <table className="mt-6 w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-2">{s.creator}</th>
                <th className="py-2 text-right">{s.opening}</th>
                <th className="py-2 text-right">{s.ad}</th>
                <th className="py-2 text-right">{s.coin}</th>
                <th className="py-2 text-right">{s.promo}</th>
                <th className="py-2 text-right">{s.other}</th>
                <th className="py-2 text-right">{s.earned}</th>
                <th className="py-2 text-right">{s.paid}</th>
                <th className="py-2 text-right">{s.closing}</th>
                <th className="py-2 pl-2">{s.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.creator.id} className="border-t border-slate-100 break-inside-avoid">
                  <td className="py-1.5 pr-2">
                    <p className="font-semibold text-slate-900">{r.creator.name}</p>
                    <p className="text-[9.5px] text-slate-500">
                      {r.statement?.number ?? "—"}
                      {r.creator.iban_last4 && ` · IBAN •••• ${r.creator.iban_last4}`}
                    </p>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{m(r.opening)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(r.ad.creator)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(r.coin.creator)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(r.coin.promo)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(r.download.creator + r.other)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-orange-700">{m(r.earned)}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(r.paid_total)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{m(r.closing)}</td>
                  <td className="py-1.5 pl-2 text-slate-600">{s.statuses[statementStatus(r)]}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-800 font-bold text-slate-900">
                <td className="py-2">{s.total}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.opening)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.ad)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.coin)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.promo)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.other)}</td>
                <td className="py-2 text-right tabular-nums text-orange-700">{m(tot.earned)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.paid)}</td>
                <td className="py-2 text-right tabular-nums">{m(tot.closing)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}

        <section className="mt-6 w-1/2 break-inside-avoid">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.coinBox}</h2>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-[12px]">
            <Line label={s.unlocks} value={String(tot.unlocks)} />
            <Line label={s.gross} value={m(tot.gross)} />
            <Line label={s.vat} value={`− ${m(tot.vat)}`} />
            <Line label={s.storeFee} value={`− ${m(tot.storeFee)}`} />
            <Line label={s.net} value={m(tot.net)} strong />
            <Line label={s.delivery} value={`− ${m(tot.delivery)}`} />
          </dl>
        </section>

        <p className="mt-6 text-[10.5px] leading-relaxed text-slate-500">{s.note}</p>

        <div className="mt-10 w-1/2 border-t border-slate-300 pt-2 text-[11px] text-slate-600">
          {s.sign}
          <p className="font-semibold text-slate-800">{LEGAL.controller}</p>
        </div>

        <footer className="mt-8 flex justify-between border-t border-slate-100 pt-2 text-[9.5px] text-slate-400">
          <span>
            {s.footer} · {reportNo}
          </span>
          <span>
            {TEXT[lang].printedAt}: {dateText(new Date().toISOString(), lang, true)}
          </span>
        </footer>
      </article>

      {docs.map(
        (d) =>
          d && (
            <div key={d.row.creator.id} className="page-break mt-8 print:mt-0">
              <StatementDocument data={d.row} number={d.issued.number} issuedAt={d.issued.issued_at} qrSvg={d.svg} lang={lang} />
            </div>
          ),
      )}
    </main>
  );
}

function Box({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${accent ? "text-orange-700" : "text-slate-900"}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-1.5 ${strong ? "font-bold text-slate-900" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
