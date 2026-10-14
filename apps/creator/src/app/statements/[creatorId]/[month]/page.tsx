import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { StatementDocument } from "@/components/statement-document";
import { TEXT, monthLabel, parseLang, parseMonth, type StatementData } from "@/lib/statements";
import { qrSvg, statementVerifyUrl } from "@/lib/statement-qr";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  return { title: `Hakediş Belgesi · ${monthLabel(month)}` };
}

/** Printable monthly statement; readable by admins and the creator themself (enforced by the RPCs). */
export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string; month: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { creatorId, month } = await params;
  const lang = parseLang((await searchParams).lang);
  const period = parseMonth(month);
  if (!period) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: issued, error: issueError } = await supabase
    .rpc("issue_creator_statement", { p_creator_id: creatorId, p_month: period })
    .single<{ number: string; token: string; issued_at: string }>();
  if (issueError || !issued) notFound();

  const { data, error } = await supabase.rpc("creator_statement_data", { p_creator_id: creatorId, p_month: period });
  if (error || !data) notFound();

  const { data: own } = await supabase
    .from("creator_profiles")
    .select("id")
    .eq("profile_id", user.id)
    .eq("id", creatorId)
    .maybeSingle();
  const ownStatement = !!own;
  const backHref = ownStatement ? "/studio/revenue" : `/admin/statements?month=${month}`;

  const svg = await qrSvg(await statementVerifyUrl(issued.number, issued.token));
  const t = TEXT[lang];
  const otherLang = lang === "tr" ? "en" : "tr";

  return (
    <main className="statement-page min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .statement-page { min-height: 0; }
          .statement { width: auto !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .statement { width: 210mm; max-width: 100%; }
      `}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={backHref} className="text-sm text-slate-600 hover:text-slate-900">
          ← {ownStatement ? "Gelir" : "Hakediş raporu"}
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href={`/statements/${creatorId}/${month}?lang=${otherLang}`}
            className="rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-700 hover:bg-white"
          >
            {t.langSwitch}
          </Link>
          <PrintButton label={t.print} />
        </div>
      </div>

      <StatementDocument
        data={data as StatementData}
        number={issued.number}
        issuedAt={issued.issued_at}
        qrSvg={svg}
        lang={lang}
      />
    </main>
  );
}
