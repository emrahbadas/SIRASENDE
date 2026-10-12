import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { requireCreator } from "../require-creator";
import { updateCreatorProfile } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { error, saved } = await searchParams;
  const { user, creator } = await requireCreator();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/studio" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Studio
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Ayarlar</h1>

      {error && (
        <p className="mt-6 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}
      {saved && (
        <p className="mt-6 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          Profil kaydedildi.
        </p>
      )}

      <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold">Creator profili</h2>
        <p className="mt-1 text-sm text-zinc-500">İzleyiciler dizi sayfasında ve uygulamada bu bilgileri görür.</p>
        <form action={updateCreatorProfile} className="mt-5 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">Creator adı</span>
            <input name="creator_name" defaultValue={creator.creator_name} required minLength={2} maxLength={60} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">Biyografi</span>
            <textarea name="bio" defaultValue={creator.bio ?? ""} rows={4} maxLength={500} className={input} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">Web sitesi / sosyal medya</span>
            <input
              name="website_url"
              type="url"
              defaultValue={creator.website_url ?? ""}
              placeholder="https://instagram.com/kullaniciadin"
              className={input}
            />
          </label>
          <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium transition hover:bg-rose-500">
            Kaydet
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="font-semibold">Hesap</h2>
        <p className="mt-2 text-sm text-zinc-400">
          E-posta: <span className="text-zinc-200">{user.email}</span>
        </p>
        <form action={logout} className="mt-4">
          <button
            type="submit"
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Çıkış yap
          </button>
        </form>
      </section>
    </main>
  );
}
