import Link from "next/link";
import { becomeCreator } from "@/app/auth/actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="text-sm font-medium text-rose-500">Sıra Sende</p>
        <h1 className="mt-1 text-2xl font-bold">Creator profilini oluştur</h1>
        <p className="mt-2 text-sm text-zinc-400">
          İzleyicilerin seni bu isimle görecek.
        </p>
        <p className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
          Bu adım tamamen opsiyonel — yalnızca kendi dizini yayınlamak istiyorsan gerekli.
          İzlemek için creator olmana gerek yok.{" "}
          <Link href="/" className="text-rose-400 hover:underline">
            Vitrine dön ve izlemeye başla →
          </Link>
        </p>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
            {decodeURIComponent(error)}
          </p>
        )}

        <form action={becomeCreator} className="mt-6 space-y-4">
          <div>
            <label htmlFor="creator_name" className="block text-sm text-zinc-400">
              Creator adı
            </label>
            <input
              id="creator_name"
              name="creator_name"
              type="text"
              required
              minLength={2}
              maxLength={60}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-rose-500"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-rose-600 py-2 font-medium transition hover:bg-rose-500"
          >
            Creator ol
          </button>
        </form>
      </div>
    </main>
  );
}
