// Monthly creator statements (hakediş belgesi): figures come from the
// creator_statement_data RPC; this file turns them into labelled lines.

export type Lang = "tr" | "en";

export type StatementData = {
  creator: { id: string; name: string; username: string; account_holder: string | null; iban_last4: string | null };
  period: string; // YYYY-MM-01
  period_start: string;
  period_end: string;
  closed: boolean;
  rates: { sales_tax_bps: number; store_fee_bps: number };
  ad: { impressions: number; gross: number; platform: number; creator: number };
  coin: {
    unlocks: number;
    paid_unlocks: number;
    bonus_unlocks: number;
    coins: number;
    bonus_coins: number;
    gross: number;
    vat: number;
    store_fee: number;
    net: number;
    delivery: number;
    base: number;
    platform: number;
    creator: number;
    promo: number;
  };
  download: { count: number; net: number; platform: number; creator: number };
  other: number;
  earned: number;
  opening: number;
  requested: number;
  returned: number;
  closing: number;
  payouts: { amount: number; paid_at: string; reference: string | null; iban_last4: string | null }[];
  paid_total: number;
  statement?: { number: string } | null;
};

export const TEXT = {
  tr: {
    title: "CREATOR HAKEDİŞ BELGESİ",
    documentNo: "Belge No",
    period: "Dönem",
    issuedAt: "Düzenlenme",
    printedAt: "Yazdırma",
    verify: "QR ile doğrula",
    payer: "ÖDEYEN",
    payerValue: "Sıra Senin",
    payerSub: "Veri sorumlusu",
    creator: "CREATOR",
    payoutAccount: "ÖDEME HESABI",
    noAccount: "IBAN kaydedilmedi",
    status: "DURUM",
    statusOpen: "Ara dönem · dönem sonunda kesinleşir",
    statusAccrued: "Tahakkuk etti · ödeme bekliyor",
    statusPaid: "Dönem içinde ödeme yapıldı",
    statusNone: "Bu dönemde hareket yok",
    item: "Kalem",
    qty: "Adet",
    amount: "Tutar",
    sectionAd: "Reklam gelirleri",
    sectionCoin: "Coin ile açılan bölümler",
    sectionDownload: "İndirme satışları",
    sectionOther: "Diğer",
    adGross: "Reklam ağı geliri",
    adPlatform: "Platform payı",
    adCreator: "Creator payı (reklam)",
    impressions: "gösterim",
    coinGross: "İzleyici ödemesi (KDV dahil, hesaplanan)",
    coinVat: "KDV",
    coinStoreFee: "Mağaza komisyonu",
    coinNet: "Net gelir",
    coinDelivery: "Video dağıtım maliyeti",
    coinBase: "Paylaşım matrahı",
    coinPlatform: "Platform payı",
    coinCreator: "Creator payı (coin)",
    coinPromo: "Bonus coin destek ödemesi",
    unlocks: "bölüm",
    downloadNet: "İndirme net geliri",
    downloadPlatform: "Platform payı",
    downloadCreator: "Creator payı (indirme)",
    other: "Düzeltmeler",
    earned: "Dönem hakedişi",
    summary: "Hesap özeti",
    opening: "Önceki dönemden devreden",
    requested: "Dönemde talep edilen ödemeler",
    returned: "Reddedilip bakiyeye dönen",
    closing: "Dönem sonu bakiye",
    paidHeader: "Dönem içinde yapılan ödemeler",
    paidDate: "Tarih",
    paidRef: "Banka referansı",
    paidIban: "IBAN",
    paidTotal: "Ödenen toplam",
    note: (rates: StatementData["rates"]) =>
      `Bu belge, Sıra Senin platformunun muhasebe kayıtlarından otomatik olarak hazırlanmıştır. Coin ile açılan bölümlerde izleyici ödemesi; net gelirden KDV (%${rates.sales_tax_bps / 100}) ve mağaza komisyonu (%${rates.store_fee_bps / 100}) oranlarıyla hesaplanır. Creator payı, net gelirden bölümün video dağıtım maliyeti düşüldükten sonra yürürlükteki gelir paylaşım oranıyla hesaplanır. Bonus coinler izleyiciye ücretsiz verildiği için gelir doğurmaz; bunlarla açılan bölümler için platform creator'a destek ödemesi yapar.`,
    signPayer: "Ödeyen Yetkilisi İmza",
    signCreator: "Creator İmza",
    footer: "Sıra Senin · Creator Hakediş Belgesi",
    print: "Yazdır / PDF olarak kaydet",
    langSwitch: "English",
  },
  en: {
    title: "CREATOR EARNINGS STATEMENT",
    documentNo: "Document No",
    period: "Period",
    issuedAt: "Issued",
    printedAt: "Printed",
    verify: "Verify with QR",
    payer: "PAYER",
    payerValue: "Sıra Senin",
    payerSub: "Data controller",
    creator: "CREATOR",
    payoutAccount: "PAYOUT ACCOUNT",
    noAccount: "No IBAN on file",
    status: "STATUS",
    statusOpen: "Interim · final at period end",
    statusAccrued: "Accrued · awaiting payout",
    statusPaid: "Paid during the period",
    statusNone: "No activity in this period",
    item: "Item",
    qty: "Qty",
    amount: "Amount",
    sectionAd: "Ad revenue",
    sectionCoin: "Episodes unlocked with coins",
    sectionDownload: "Download sales",
    sectionOther: "Other",
    adGross: "Ad network revenue",
    adPlatform: "Platform share",
    adCreator: "Creator share (ads)",
    impressions: "impressions",
    coinGross: "Viewer payment (incl. VAT, computed)",
    coinVat: "VAT",
    coinStoreFee: "Store fee",
    coinNet: "Net revenue",
    coinDelivery: "Video delivery cost",
    coinBase: "Revenue share base",
    coinPlatform: "Platform share",
    coinCreator: "Creator share (coins)",
    coinPromo: "Bonus coin support payment",
    unlocks: "episodes",
    downloadNet: "Download net revenue",
    downloadPlatform: "Platform share",
    downloadCreator: "Creator share (downloads)",
    other: "Adjustments",
    earned: "Earnings for the period",
    summary: "Account summary",
    opening: "Carried over from previous periods",
    requested: "Payouts requested in the period",
    returned: "Rejected and returned to balance",
    closing: "Closing balance",
    paidHeader: "Payouts made during the period",
    paidDate: "Date",
    paidRef: "Bank reference",
    paidIban: "IBAN",
    paidTotal: "Total paid",
    note: (rates: StatementData["rates"]) =>
      `This document is generated automatically from the Sıra Senin platform ledger. For coin unlocks, the viewer payment is computed from the net revenue using the VAT (${rates.sales_tax_bps / 100}%) and store fee (${rates.store_fee_bps / 100}%) rates. The creator share is calculated on the net revenue after the episode's video delivery cost, at the revenue share rate in force. Bonus coins are given to viewers for free and produce no revenue; for episodes unlocked with them the platform pays the creator a support payment.`,
    signPayer: "Payer Signature",
    signCreator: "Creator Signature",
    footer: "Sıra Senin · Creator Earnings Statement",
    print: "Print / Save as PDF",
    langSwitch: "Türkçe",
  },
} as const;

export const parseLang = (v?: string): Lang => (v === "en" ? "en" : "tr");

/** "2026-10" → "2026-10-01"; null when malformed. */
export function parseMonth(v?: string | null): string | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  return `${v}-01`;
}

/** Current month in Turkey time, as YYYY-MM. */
export function currentMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

/** Shift a YYYY-MM month by n months. */
export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const monthLabel = (month: string, lang: Lang = "tr") =>
  new Date(`${month.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-GB" : "tr-TR", {
    month: "long",
    year: "numeric",
  });

export const money = (minor: number, lang: Lang = "tr") =>
  new Intl.NumberFormat(lang === "en" ? "en-GB" : "tr-TR", { style: "currency", currency: "TRY" }).format(minor / 100);

export const dateText = (iso: string, lang: Lang = "tr", time = false) =>
  new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

export type StatementStatus = "open" | "none" | "paid" | "accrued";

export function statementStatus(d: StatementData): StatementStatus {
  if (!d.closed) return "open";
  if (d.paid_total > 0) return "paid";
  if (d.earned === 0 && d.closing === 0) return "none";
  return "accrued";
}

export type Line = { label: string; qty?: string; amount: number; kind?: "minus" | "subtotal" | "share" };

/** Itemised lines grouped by source; sources without activity are left out. */
export function statementSections(d: StatementData, lang: Lang) {
  const t = TEXT[lang];
  const sections: { title: string; lines: Line[] }[] = [];

  if (d.ad.gross || d.ad.creator) {
    sections.push({
      title: t.sectionAd,
      lines: [
        { label: t.adGross, qty: `${d.ad.impressions} ${t.impressions}`, amount: d.ad.gross },
        { label: t.adPlatform, amount: -d.ad.platform, kind: "minus" },
        { label: t.adCreator, amount: d.ad.creator, kind: "share" },
      ],
    });
  }

  if (d.coin.unlocks) {
    const lines: Line[] = [
      { label: t.coinGross, qty: `${d.coin.unlocks} ${t.unlocks}`, amount: d.coin.gross },
      { label: t.coinVat, amount: -d.coin.vat, kind: "minus" },
      { label: t.coinStoreFee, amount: -d.coin.store_fee, kind: "minus" },
      { label: t.coinNet, amount: d.coin.net, kind: "subtotal" },
      { label: t.coinDelivery, amount: -(d.coin.net - d.coin.base), kind: "minus" },
      { label: t.coinBase, amount: d.coin.base, kind: "subtotal" },
      { label: t.coinPlatform, amount: -d.coin.platform, kind: "minus" },
      { label: t.coinCreator, amount: d.coin.creator, kind: "share" },
    ];
    if (d.coin.promo) {
      lines.push({ label: t.coinPromo, qty: `${d.coin.bonus_unlocks} ${t.unlocks}`, amount: d.coin.promo, kind: "share" });
    }
    sections.push({ title: t.sectionCoin, lines });
  }

  if (d.download.count) {
    sections.push({
      title: t.sectionDownload,
      lines: [
        { label: t.downloadNet, qty: String(d.download.count), amount: d.download.net },
        { label: t.downloadPlatform, amount: -d.download.platform, kind: "minus" },
        { label: t.downloadCreator, amount: d.download.creator, kind: "share" },
      ],
    });
  }

  if (d.other) {
    sections.push({ title: t.sectionOther, lines: [{ label: t.other, amount: d.other, kind: "share" }] });
  }

  return sections;
}
