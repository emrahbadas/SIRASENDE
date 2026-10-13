import Link from "next/link";
import { signup } from "@/app/auth/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium text-orange-500">Sıra Senin</p>
        <h1 className="mt-1 text-2xl font-bold">Hesap oluştur</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Üye ol, dizileri izle. Kendi dizini yayınlamak istersen sonradan creator olabilirsin.
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
            {decodeURIComponent(error)}
          </p>
        )}

        {message === "check-email" ? (
          <p className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/50 p-3 text-sm text-emerald-300">
            Doğrulama bağlantısı e-postana gönderildi. Gelen kutunu kontrol et.
          </p>
        ) : (
          <>
            <form action={signup} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm text-zinc-400">
                  E-posta
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm text-zinc-400">
                  Şifre
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-orange-500"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-orange-600 py-2 font-medium transition hover:bg-orange-500"
              >
                Kayıt ol
              </button>
            </form>

            <p className="mt-6 text-sm text-zinc-400">
              Zaten hesabın var mı?{" "}
              <Link href="/login" className="text-orange-400 hover:underline">
                Giriş yap
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
