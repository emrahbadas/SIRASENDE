import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEXT, dateText, money, monthLabel, statementStatus, type StatementData } from "@/lib/statements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Belge doğrulama · Sıra Senin",
  robots: { index: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public check for a scanned statement QR: number + secret token must match.
 * Shows only what is printed in the totals (no IBAN or personal contact data).
 */
export default async function VerifyStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const number = decodeURIComponent((await params).number);
  const token = (await searchParams).token ?? "";

  const admin = createAdminClient();
  const { data: statement } = UUID.test(token)
    ? await admin
        .from("creator_statements")
        .select("number, creator_id, period, issued_at")
        .eq("number", number)
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  const { data } = statement
    ? await admin.rpc("creator_statement_data", { p_creator_id: statement.creator_id, p_month: statement.period })
    : { data: null };
  const d = data as StatementData | null;
  const t = TEXT.tr;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 text-slate-800">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand-mark.svg" alt="" width={28} height={28} />
          <p className="text-xl font-extrabold tracking-tight text-slate-900">
            <span className="text-orange-600">Sıra</span> Senin
          </p>
        </div>

        {!statement || !d ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="font-semibold text-rose-800">Belge doğrulanamadı</p>
            <p className="mt-1 text-sm text-rose-700">
              Bu numara ve doğrulama kodu ile kayıtlı bir hakediş belgesi bulunamadı. Belge değiştirilmiş veya
              geçersiz olabilir.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-800">✓ Belge geçerli</p>
              <p className="mt-1 text-sm text-emerald-700">
                Bu hakediş belgesi Sıra Senin tarafından düzenlenmiştir. Tutarlar platform kayıtlarıyla güncel olarak
                eşleştirilmiştir.
              </p>
            </div>
            <dl className="mt-6 divide-y divide-slate-100 text-sm">
              <Row label={t.documentNo} value={statement.number} mono />
              <Row label={t.period} value={monthLabel(statement.period)} />
              <Row label={t.issuedAt} value={dateText(statement.issued_at)} />
              <Row label="Creator" value={d.creator.name} />
              <Row label={t.earned} value={money(d.earned)} strong />
              <Row label={t.closing} value={money(d.closing)} />
              <Row label={t.paidTotal} value={money(d.paid_total)} />
              <Row
                label="Durum"
                value={
                  {
                    open: t.statusOpen,
                    none: t.statusNone,
                    paid: t.statusPaid,
                    accrued: t.statusAccrued,
                  }[statementStatus(d)]
                }
              />
            </dl>
          </>
        )}
        <p className="mt-6 text-xs text-slate-400">sirasenin.app · Creator hakediş belgesi doğrulama</p>
      </div>
    </main>
  );
}

function Row({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono" : ""} ${strong ? "font-bold text-slate-900" : ""}`}>{value}</dd>
    </div>
  );
}
