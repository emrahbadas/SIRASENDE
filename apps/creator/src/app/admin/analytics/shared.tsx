import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Analytics RPCs check the admin role themselves; this keeps non-admins off the pages
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase.from("user_roles").select("role").eq("profile_id", user.id).eq("role", "admin");
  if (!roles?.length) redirect("/admin");
  return supabase;
}

export const num = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("tr-TR");

export const pct = (part: number, whole: number) => (whole ? `%${Math.round((part / whole) * 100)}` : "—");

export const dateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }) : "—";

export const duration = (s: number | null | undefined) => {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

const statuses: Record<string, string> = {
  draft: "Taslak",
  uploading: "Yükleniyor",
  processing: "İşleniyor",
  ready: "Hazır",
  moderating: "İncelemede",
  published: "Yayında",
  blocked: "Engelli",
  failed: "Hatalı",
  rejected: "Reddedildi",
  needs_changes: "Düzeltme istendi",
  paused: "Durduruldu",
};

export const statusLabel = (v: string) => statuses[v] ?? v;

export function AnalyticsNav({ active }: { active: "overview" | "viewers" }) {
  const tabs = [
    { key: "overview", href: "/admin/analytics", label: "Yapımlar" },
    { key: "viewers", href: "/admin/analytics/viewers", label: "İzleyiciler" },
  ];
  return (
    <nav className="mt-6 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-full border px-3 py-1 text-sm ${
            active === t.key
              ? "border-orange-600 bg-orange-950/40 text-orange-200"
              : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stats({ items }: { items: { label: string; value: number | string; hint?: string }[] }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((t) => (
        <div key={t.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-2xl font-bold">{typeof t.value === "number" ? num(t.value) : t.value}</p>
          <p className="mt-1 text-xs text-zinc-500">{t.label}</p>
          {t.hint && <p className="mt-0.5 text-xs text-zinc-600">{t.hint}</p>}
        </div>
      ))}
    </div>
  );
}

// Simple bar chart of daily views; no chart library needed for one series
export function DailyChart({ days }: { days: { day: string; views: number }[] }) {
  const max = Math.max(1, ...days.map((d) => Number(d.views)));
  const total = days.reduce((n, d) => n + Number(d.views), 0);
  const [first, last] = [days[0], days[days.length - 1]];
  const label = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return (
    <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-zinc-300">Günlük izlenme · son {days.length} gün</h2>
        <span className="text-xs text-zinc-500">{num(total)} toplam</span>
      </div>
      <div className="mt-4 flex h-32 items-end gap-[2px]">
        {days.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t bg-orange-500/80 group-hover:bg-orange-400"
              style={{ height: `${(Number(d.views) / max) * 100}%`, minHeight: Number(d.views) ? 2 : 0 }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 group-hover:block">
              {label(d.day)}: {num(d.views)}
            </span>
          </div>
        ))}
      </div>
      {first && last && (
        <div className="mt-1 flex justify-between text-xs text-zinc-600">
          <span>{label(first.day)}</span>
          <span>{label(last.day)}</span>
        </div>
      )}
    </section>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">{message}</p>;
}
