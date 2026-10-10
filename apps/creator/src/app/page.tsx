import Link from "next/link";

const sections = [
  { href: "/productions", title: "My Productions", desc: "Yapımlarını yönet, yeni production oluştur." },
  { href: "/analytics", title: "Analytics", desc: "İzlenme, tamamlama oranı ve bölüm geçişleri." },
  { href: "/revenue", title: "Revenue", desc: "Gelir özeti ve payout durumu." },
  { href: "/settings", title: "Settings", desc: "Hesap ve creator profili ayarları." },
] as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-medium text-rose-500">Sıra Sende</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Creator Studio</h1>
        <p className="mt-2 text-zinc-400">İzledin. Şimdi sıra sende.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-rose-500/50 hover:bg-zinc-900"
          >
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
