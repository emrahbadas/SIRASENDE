import { LEGAL } from "@/lib/legal";
import {
  TEXT,
  dateText,
  money,
  monthLabel,
  statementSections,
  statementStatus,
  type Lang,
  type StatementData,
} from "@/lib/statements";

const statusClass = {
  open: "text-sky-700",
  none: "text-slate-500",
  paid: "text-emerald-700",
  accrued: "text-amber-700",
} as const;

/** A4 print layout of a monthly creator statement (light, print-friendly). */
export function StatementDocument({
  data,
  number,
  issuedAt,
  qrSvg,
  lang,
}: {
  data: StatementData;
  number: string;
  issuedAt: string;
  qrSvg: string;
  lang: Lang;
}) {
  const t = TEXT[lang];
  const status = statementStatus(data);
  const statusText = {
    open: t.statusOpen,
    none: t.statusNone,
    paid: t.statusPaid,
    accrued: t.statusAccrued,
  }[status];
  const sections = statementSections(data, lang);
  const m = (v: number) => money(v, lang);

  return (
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
          <p className="mt-2 text-[11px] font-semibold tracking-[0.25em] text-slate-600">{t.title}</p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-center">
            <div
              className="h-[88px] w-[88px] rounded border border-slate-200 p-1 [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-1 text-[9px] text-slate-500">{t.verify}</p>
          </div>
          <dl className="space-y-0.5 text-right text-[12px]">
            <div>
              <dt className="inline font-semibold text-slate-700">{t.documentNo}: </dt>
              <dd className="inline font-mono text-slate-600">{number}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-700">{t.period}: </dt>
              <dd className="inline text-slate-600">{monthLabel(data.period, lang)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-700">{t.issuedAt}: </dt>
              <dd className="inline text-slate-600">{dateText(issuedAt, lang)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <InfoBox label={t.payer} value={t.payerValue} sub={`${t.payerSub}: ${LEGAL.controller} · ${LEGAL.email}`} />
        <InfoBox label={t.creator} value={data.creator.name} sub={`@${data.creator.username}`} />
        <InfoBox
          label={t.payoutAccount}
          value={data.creator.account_holder ?? "—"}
          sub={data.creator.iban_last4 ? `IBAN •••• ${data.creator.iban_last4}` : t.noAccount}
        />
        <InfoBox label={t.status} value={statusText} valueClass={statusClass[status]} />
      </div>

      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="w-8 py-2">#</th>
            <th className="py-2">{t.item}</th>
            <th className="py-2 text-right">{t.qty}</th>
            <th className="py-2 text-right">{t.amount}</th>
          </tr>
        </thead>
        {sections.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={4} className="border-t border-slate-100 py-6 text-center text-slate-500">
                {t.statusNone}
              </td>
            </tr>
          </tbody>
        ) : (
          sections.map((s, si) => (
            <tbody key={s.title} className="break-inside-avoid">
              <tr>
                <td className="pt-4 pb-1 font-semibold text-slate-400">{si + 1}</td>
                <td colSpan={3} className="pt-4 pb-1 font-bold text-slate-900">
                  {s.title}
                </td>
              </tr>
              {s.lines.map((l) => (
                <tr
                  key={l.label}
                  className={`border-t border-slate-100 ${l.kind === "share" ? "bg-orange-50/70 font-semibold text-slate-900" : ""}`}
                >
                  <td />
                  <td className={`py-1.5 ${l.kind === "minus" ? "pl-4 text-slate-500" : ""} ${l.kind === "subtotal" ? "font-medium" : ""}`}>
                    {l.label}
                  </td>
                  <td className="py-1.5 text-right text-slate-500">{l.qty ?? ""}</td>
                  <td className={`py-1.5 text-right tabular-nums ${l.kind === "minus" ? "text-slate-500" : ""}`}>{m(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          ))
        )}
        <tbody>
          <tr className="border-t-2 border-slate-800">
            <td />
            <td className="py-2.5 text-base font-bold text-slate-900">{t.earned}</td>
            <td />
            <td className="py-2.5 text-right text-base font-bold tabular-nums text-orange-700">{m(data.earned)}</td>
          </tr>
        </tbody>
      </table>

      <section className="mt-6 grid grid-cols-2 gap-6 break-inside-avoid">
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.summary}</h2>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-[12px]">
            <Row label={t.opening} value={m(data.opening)} />
            <Row label={t.earned} value={`+ ${m(data.earned)}`} />
            <Row label={t.requested} value={`− ${m(data.requested)}`} />
            {data.returned > 0 && <Row label={t.returned} value={`+ ${m(data.returned)}`} />}
            <Row label={t.closing} value={m(data.closing)} strong />
          </dl>
        </div>
        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.paidHeader}</h2>
          {data.payouts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-[12px] text-slate-500">—</p>
          ) : (
            <table className="w-full rounded-lg border border-slate-200 text-[11px]">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="px-2 py-1">{t.paidDate}</th>
                  <th className="px-2 py-1">{t.paidRef}</th>
                  <th className="px-2 py-1 text-right">{t.amount}</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{dateText(p.paid_at, lang)}</td>
                    <td className="px-2 py-1 font-mono">
                      {p.reference ?? "—"}
                      {p.iban_last4 && <span className="text-slate-400"> · •••• {p.iban_last4}</span>}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{m(p.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-300 font-semibold">
                  <td className="px-2 py-1" colSpan={2}>
                    {t.paidTotal}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{m(data.paid_total)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </section>

      <p className="mt-6 text-[10.5px] leading-relaxed text-slate-500">{t.note(data.rates)}</p>

      <div className="mt-10 grid grid-cols-2 gap-10 break-inside-avoid text-[11px] text-slate-600">
        <div className="border-t border-slate-300 pt-2">
          {t.signPayer}
          <p className="font-semibold text-slate-800">{LEGAL.controller}</p>
        </div>
        <div className="border-t border-slate-300 pt-2">
          {t.signCreator}
          <p className="font-semibold text-slate-800">{data.creator.account_holder ?? data.creator.name}</p>
        </div>
      </div>

      <footer className="mt-8 flex justify-between border-t border-slate-100 pt-2 text-[9.5px] text-slate-400">
        <span>
          {t.footer} · {number}
        </span>
        <span>
          {t.printedAt}: {dateText(new Date().toISOString(), lang, true)}
        </span>
      </footer>
    </article>
  );
}

function InfoBox({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3 break-inside-avoid">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${valueClass ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-1.5 ${strong ? "font-bold text-slate-900" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
