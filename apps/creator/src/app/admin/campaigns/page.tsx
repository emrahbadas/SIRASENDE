import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { grantCreator, revokeGrant } from "../actions";

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

const fmt = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });

type Grant = {
  id: string;
  kind: string;
  value: number;
  source: string;
  note: string | null;
  starts_at: string;
  ends_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  creator_profiles: { creator_name: string } | { creator_name: string }[] | null;
};

function grantState(g: Grant, now: number) {
  if (g.revoked_at) return { label: "Geri alındı", cls: "border-zinc-700 text-zinc-500" };
  if (new Date(g.ends_at).getTime() <= now) return { label: "Süresi doldu", cls: "border-zinc-700 text-zinc-500" };
  if (g.source === "founder_100" && !g.activated_at)
    return { label: "Yayın bekleniyor", cls: "border-amber-800 text-amber-300" };
  return { label: "Aktif", cls: "border-emerald-800 text-emerald-300" };
}

export default async function AdminCampaignsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");

  const [{ data: grants }, { data: used }, { data: settings }, { data: creators }] = await Promise.all([
    supabase
      .from("creator_grants")
      .select("id, kind, value, source, note, starts_at, ends_at, activated_at, revoked_at, creator_profiles(creator_name)")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.rpc("founder_slots_used"),
    supabase.from("platform_settings").select("key, value").like("key", "founder_%"),
    supabase.from("creator_profiles").select("id, creator_name").order("creator_name"),
  ]);
  const setting = (k: string) => Number((settings ?? []).find((s) => s.key === k)?.value ?? 0);
  const slots = setting("founder_campaign_slots");
  const now = Date.now();
  const list = (grants ?? []) as Grant[];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/admin" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Moderasyon kuyruğu
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Kampanyalar ve creator hakları</h1>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">İlk 100 kurucu creator</h2>
          <span className="text-sm text-zinc-400">
            {used ?? 0} / {slots} kontenjan
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-orange-600" style={{ width: `${slots ? Math.min(100, ((used ?? 0) / slots) * 100) : 0}%` }} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Yeni creator otomatik olarak {setting("founder_storage_minutes")} dk ek depolama alır. İlk dizisini{" "}
          {setting("founder_publish_window_days")} gün içinde yayına alırsa hak yayından itibaren {setting("founder_days")}{" "}
          gün sürer; alamazsa hak düşer ve kontenjan boşalır. Süre bitince mevcut videolar kalır, yalnızca plan kotasını aşan
          yeni yüklemeler engellenir.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="font-semibold">Elle depolama hakkı ver</h2>
        <p className="mt-1 text-xs text-zinc-500">Büyüme programı ödülü, destek veya düzeltme için. Süre bitince kendiliğinden düşer.</p>
        <form action={grantCreator} className="mt-4 grid gap-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_1.4fr_auto]">
          <input type="hidden" name="return_to" value="/admin/campaigns" />
          <select
            name="creator_id"
            required
            defaultValue=""
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500"
          >
            <option value="" disabled>
              Creator seç
            </option>
            {(creators ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.creator_name}
              </option>
            ))}
          </select>
          <input name="minutes" type="number" min={1} required placeholder="Dakika" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500" />
          <input name="days" type="number" min={1} max={366} defaultValue={30} required placeholder="Gün" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500" />
          <input name="note" placeholder="Not (ör. Ekim Altın kademe)" className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-orange-500" />
          <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium hover:bg-orange-500">
            Ver
          </button>
        </form>
      </section>

      <h2 className="mt-8 mb-3 font-semibold">Tüm haklar</h2>
      {!list.length ? (
        <p className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">Henüz hak yok.</p>
      ) : (
        <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 text-sm">
          {list.map((g) => {
            const st = grantState(g, now);
            const live = !g.revoked_at && new Date(g.ends_at).getTime() > now;
            return (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-36 truncate font-medium">{one(g.creator_profiles)?.creator_name}</span>
                <span className="text-zinc-300">+{g.value} dk</span>
                <span className="text-xs text-zinc-500">
                  {g.source === "founder_100" ? "Kurucu kampanya" : g.note || "Admin"} · {fmt(g.ends_at)}&apos;e kadar
                </span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                {live && (
                  <form action={revokeGrant} className="ml-auto">
                    <input type="hidden" name="grant_id" value={g.id} />
                    <input type="hidden" name="return_to" value="/admin/campaigns" />
                    <ConfirmSubmit
                      message="Bu hak geri alınsın mı? Creator'ın kotası hemen düşer."
                      className="rounded-lg border border-rose-800 px-2 py-1 text-xs text-rose-400 hover:bg-rose-950"
                    >
                      Geri al
                    </ConfirmSubmit>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
