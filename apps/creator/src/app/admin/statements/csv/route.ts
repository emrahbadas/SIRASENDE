import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentMonth, parseMonth, type StatementData } from "@/lib/statements";

export const dynamic = "force-dynamic";

// Turkish Excel: ";" separated, decimal comma, UTF-8 with BOM
const amount = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");
const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const COLUMNS: [string, (r: StatementData & { statement: { number: string } | null }) => string | number | null][] = [
  ["Belge No", (r) => r.statement?.number ?? ""],
  ["Creator", (r) => r.creator.name],
  ["Kullanıcı adı", (r) => r.creator.username],
  ["Hesap sahibi", (r) => r.creator.account_holder],
  ["IBAN son 4", (r) => r.creator.iban_last4],
  ["Devreden", (r) => amount(r.opening)],
  ["Reklam gösterim", (r) => r.ad.impressions],
  ["Reklam brüt", (r) => amount(r.ad.gross)],
  ["Reklam platform payı", (r) => amount(r.ad.platform)],
  ["Reklam creator payı", (r) => amount(r.ad.creator)],
  ["Coin ile açılan bölüm", (r) => r.coin.unlocks],
  ["Coin izleyici ödemesi (KDV dahil)", (r) => amount(r.coin.gross)],
  ["KDV", (r) => amount(r.coin.vat)],
  ["Mağaza komisyonu", (r) => amount(r.coin.store_fee)],
  ["Coin net gelir", (r) => amount(r.coin.net)],
  ["Video dağıtım maliyeti", (r) => amount(r.coin.net - r.coin.base)],
  ["Paylaşım matrahı", (r) => amount(r.coin.base)],
  ["Coin platform payı", (r) => amount(r.coin.platform)],
  ["Coin creator payı", (r) => amount(r.coin.creator)],
  ["Bonus destek ödemesi", (r) => amount(r.coin.promo)],
  ["İndirme net", (r) => amount(r.download.net)],
  ["İndirme creator payı", (r) => amount(r.download.creator)],
  ["Düzeltmeler", (r) => amount(r.other)],
  ["Dönem hakedişi", (r) => amount(r.earned)],
  ["Talep edilen ödeme", (r) => amount(r.requested)],
  ["İade edilen", (r) => amount(r.returned)],
  ["Dönemde ödenen", (r) => amount(r.paid_total)],
  ["Dönem sonu bakiye", (r) => amount(r.closing)],
];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("month");
  const month = parseMonth(raw) ? raw! : currentMonth();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // admin_statement_overview itself rejects non-admins
  const { data, error } = await supabase.rpc("admin_statement_overview", { p_month: `${month}-01` });
  if (error) return new NextResponse("Forbidden", { status: 403 });

  const rows = (data ?? []) as (StatementData & { statement: { number: string } | null })[];
  const lines = [
    COLUMNS.map(([h]) => cell(h)).join(";"),
    ...rows.map((r) => COLUMNS.map(([, f]) => cell(f(r))).join(";")),
  ];

  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sirasenin-hakedis-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
