import Link from "next/link";
import { LEGAL } from "@/lib/legal";

/** Shared shell for the public legal pages. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← Sıra Sende
      </Link>
      <h1 className="mt-2 text-3xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-zinc-500">Son güncelleme: {LEGAL.updatedAt}</p>
      <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-zinc-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-orange-400 [&_a]:underline">
        {children}
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-zinc-800 pt-6 text-sm text-zinc-500">
        <Link href="/privacy" className="hover:text-zinc-300">Gizlilik Politikası</Link>
        <Link href="/terms" className="hover:text-zinc-300">Kullanım Şartları</Link>
        <Link href="/account/delete" className="hover:text-zinc-300">Hesap silme</Link>
      </nav>
    </main>
  );
}
