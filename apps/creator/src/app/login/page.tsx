import Link from "next/link";
import { login } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium text-orange-500">Sıra Sende</p>
        <h1 className="mt-1 text-2xl font-bold">Giriş yap</h1>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
            {decodeURIComponent(error)}
          </p>
        )}

        <form action={login} className="mt-6 space-y-4">
          {next && <input type="hidden" name="next" value={next} />}
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
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-orange-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-orange-600 py-2 font-medium transition hover:bg-orange-500"
          >
            Giriş yap
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-400">
          Hesabın yok mu?{" "}
          <Link href="/signup" className="text-orange-400 hover:underline">
            Kayıt ol
          </Link>
        </p>
      </div>
    </main>
  );
}
