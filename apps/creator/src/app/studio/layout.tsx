import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

/** Every Studio page: a banned creator sees the suspension notice instead. */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return children;

  const { data: ban } = await supabase
    .rpc("my_ban")
    .maybeSingle<{ banned_at: string; ban_reason: string | null }>();
  if (!ban) return children;

  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <p className="text-sm font-medium text-orange-500">Sıra Senin</p>
      <h1 className="mt-1 text-2xl font-bold">Creator hesabın askıya alındı</h1>
      <p className="mt-3 text-zinc-400">
        {new Date(ban.banned_at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}{" "}
        tarihinden beri Creator Studio&apos;ya erişimin kapalı ve dizilerin yayında değil.
      </p>
      {ban.ban_reason && (
        <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">
          Sebep: {ban.ban_reason}
        </p>
      )}
      <p className="mt-4 text-sm text-zinc-500">
        Birikmiş kazancın silinmedi. Bir hata olduğunu düşünüyorsan uygulamadaki Profil → Geri bildirim gönder üzerinden
        bize yaz.
      </p>
      <div className="mt-8 flex gap-2">
        <Link href="/" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600">
          Vitrine git
        </Link>
        <form action={logout}>
          <button type="submit" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-600">
            Çıkış yap
          </button>
        </form>
      </div>
    </main>
  );
}
