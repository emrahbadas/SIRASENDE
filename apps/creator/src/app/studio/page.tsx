import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";

const sections = [
  { href: "/studio/productions", title: "My Productions", desc: "Yapımlarını yönet, yeni production oluştur." },
  { href: "/studio/analytics", title: "Analytics", desc: "İzlenme, tamamlama oranı ve bölüm geçişleri." },
  { href: "/studio/revenue", title: "Revenue", desc: "Gelir özeti ve payout durumu." },
  { href: "/studio/settings", title: "Settings", desc: "Hesap ve creator profili ayarları." },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: creatorProfile } = await supabase
    .from("creator_profiles")
    .select("id, creator_name")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!creatorProfile) {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-orange-500">Sıra Sende</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Creator Studio</h1>
          <p className="mt-2 text-zinc-400">
            Hoş geldin, <span className="text-zinc-200">{creatorProfile.creator_name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Vitrine git
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              Çıkış yap
            </button>
          </form>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition hover:border-orange-500/50 hover:bg-zinc-900"
          >
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
