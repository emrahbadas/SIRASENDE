import Link from "next/link";
import { formatTry, requireCreator } from "../require-creator";
import { requestPayout } from "./actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const txnLabels: Record<string, string> = {
  episode_unlock_coins: "Coin ile bölüm açma",
  download_purchase: "İndirme satışı",
  ad_revenue_settlement: "Reklam geliri",
  payout_request: "Ödeme talebi",
  payout_paid: "Ödeme yapıldı",
  payout_rejected: "Ödeme iadesi",
  adjustment: "Düzeltme",
};

const payoutLabels: Record<string, { text: string; cls: string }> = {
  requested: { text: "Talep edildi", cls: "text-amber-400 border-amber-800" },
  processing: { text: "İşleniyor", cls: "text-sky-400 border-sky-800" },
  paid: { text: "Ödendi", cls: "text-emerald-400 border-emerald-800" },
  rejected: { text: "Reddedildi", cls: "text-rose-400 border-rose-800" },
};

// Only these move money into the creator's earnings
const EARNING_TYPES = ["ad_revenue_settlement", "episode_unlock_coins", "download_purchase"];

const bps = (v: number) => `%${v / 100}`;

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; requested?: string }>;
}) {
  const { error, requested } = await searchParams;
  const { supabase, creator } = await requireCreator();

  const [{ data: wallet }, { data: payouts }, { data: policy }, { data: storage }] = await Promise.all([
    supabase
      .from("wallet_accounts")
      .select("id, balance")
      .eq("creator_id", creator.id)
      .eq("currency", "TRY")
      .maybeSingle(),
    supabase
      .from("payout_requests")
      .select("id, amount_minor, status, admin_note, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("revenue_policies")
      .select("version, ad_creator_share_bps, download_creator_share_bps, coin_unlock_creator_share_bps, coin_value_minor, min_payout_minor")
      .lte("effective_from", new Date().toISOString())
      .order("effective_from", { ascending: false })
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("my_storage_summary").maybeSingle<{ quota_minutes: number; used_seconds: number }>(),
  ]);

  const { data: entries } = wallet
    ? await supabase
        .from("ledger_entries")
        .select("id, amount, created_at, ledger_transactions(txn_type)")
        .eq("account_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };

  const rows = (entries ?? []).map((e) => ({ ...e, type: one(e.ledger_transactions)?.txn_type ?? "adjustment" }));
  const bySource = EARNING_TYPES.map((t) => ({
    type: t,
    total: rows.filter((r) => r.type === t).reduce((n, r) => n + r.amount, 0),
  }));
  const lifetime = bySource.reduce((n, s) => n + s.total, 0);

  const balance = wallet?.balance ?? 0;
  const minPayout = policy?.min_payout_minor ?? 50000;
  const pending = (payouts ?? []).some((p) => p.status === "requested" || p.status === "processing");
  const canRequest = balance >= minPayout && !pending;

  const usedMinutes = Math.ceil((storage?.used_seconds ?? 0) / 60);
  const quota = storage?.quota_minutes ?? 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/studio" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Studio
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Gelir</h1>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}
      {requested && (
        <p className="mt-6 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          Ödeme talebin alındı. Admin onayından sonra hesabına aktarılır.
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-sm text-zinc-500">Çekilebilir bakiye</p>
          <p className="mt-1 text-3xl font-bold">{formatTry(balance)}</p>
          <p className="mt-1 text-xs text-zinc-500">Toplam kazanç: {formatTry(lifetime)}</p>

          <form action={requestPayout} className="mt-5 flex gap-2">
            <input
              name="amount"
              type="number"
              min={minPayout / 100}
              max={balance / 100}
              step="0.01"
              defaultValue={canRequest ? (balance / 100).toFixed(2) : undefined}
              placeholder="Tutar (₺)"
              disabled={!canRequest}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canRequest}
              className="shrink-0 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Ödeme talep et
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            {pending
              ? "Bekleyen bir talebin var; sonuçlanınca yenisini açabilirsin."
              : `Minimum ödeme: ${formatTry(minPayout)}`}
          </p>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-sm text-zinc-500">Gelir kaynakları</p>
          <ul className="mt-3 space-y-2 text-sm">
            {bySource.map((s) => (
              <li key={s.type} className="flex justify-between">
                <span className="text-zinc-400">{txnLabels[s.type]}</span>
                <span>{formatTry(s.total)}</span>
              </li>
            ))}
          </ul>
          {policy && (
            <p className="mt-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
              Senin payın: reklam {bps(policy.ad_creator_share_bps)} · coin ile açma{" "}
              {bps(policy.coin_unlock_creator_share_bps)} · indirme {bps(policy.download_creator_share_bps)}. 1 coin ={" "}
              {formatTry(policy.coin_value_minor)}.
            </p>
          )}
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-zinc-500">Depolama</p>
          <p className="text-sm">
            {usedMinutes} / {quota} dk
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full ${quota && usedMinutes / quota > 0.9 ? "bg-amber-500" : "bg-rose-600"}`}
            style={{ width: `${quota ? Math.min(100, (usedMinutes / quota) * 100) : 0}%` }}
          />
        </div>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">Son hareketler</h2>
          {!rows.length ? (
            <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              Henüz gelir hareketi yok.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-sm">
              {rows.slice(0, 20).map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                  <span>
                    {txnLabels[r.type] ?? r.type}
                    <span className="ml-2 text-xs text-zinc-500">
                      {new Date(r.created_at).toLocaleDateString("tr-TR")}
                    </span>
                  </span>
                  <span className={r.amount > 0 ? "text-emerald-400" : "text-zinc-400"}>
                    {r.amount > 0 ? "+" : ""}
                    {formatTry(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Ödeme talepleri</h2>
          {!payouts?.length ? (
            <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
              Henüz ödeme talebin yok.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-sm">
              {payouts.map((p) => {
                const label = payoutLabels[p.status] ?? { text: p.status, cls: "text-zinc-400 border-zinc-700" };
                return (
                  <li key={p.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <span>
                        {formatTry(p.amount_minor)}
                        <span className="ml-2 text-xs text-zinc-500">
                          {new Date(p.created_at).toLocaleDateString("tr-TR")}
                        </span>
                      </span>
                      <span className={`rounded border px-1.5 py-0.5 text-xs ${label.cls}`}>{label.text}</span>
                    </div>
                    {p.admin_note && <p className="mt-1 text-xs text-zinc-500">{p.admin_note}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
