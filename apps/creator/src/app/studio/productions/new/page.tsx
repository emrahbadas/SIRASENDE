import Link from "next/link";
import { createProduction } from "../actions";

const selectClass =
  "mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-rose-500";

export default async function NewProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/studio/productions" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← My Productions
      </Link>
      <h1 className="mt-1 text-2xl font-bold">Yeni Production</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Production oluşturulduğunda aynı adla bir series ve Sezon 1 otomatik açılır.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
          {decodeURIComponent(error)}
        </p>
      )}

      <form action={createProduction} className="mt-8 space-y-5">
        <div>
          <label htmlFor="title" className="block text-sm text-zinc-400">
            Başlık *
          </label>
          <input id="title" name="title" type="text" required minLength={2} className={selectClass} />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm text-zinc-400">
            Açıklama
          </label>
          <textarea id="description" name="description" rows={3} className={selectClass} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="production_type" className="block text-sm text-zinc-400">
              Yapım tipi
            </label>
            <select id="production_type" name="production_type" className={selectClass}>
              <option value="human">Human Production</option>
              <option value="ai_assisted">AI Assisted</option>
              <option value="ai_generated">AI Generated</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div>
            <label htmlFor="primary_language" className="block text-sm text-zinc-400">
              Ana dil
            </label>
            <select id="primary_language" name="primary_language" className={selectClass}>
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <fieldset className="rounded-xl border border-zinc-800 p-4">
          <legend className="px-2 text-sm text-zinc-400">Üretim metadata&apos;sı (opsiyonel)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="script_source" className="block text-sm text-zinc-400">
                Senaryo
              </label>
              <select id="script_source" name="script_source" className={selectClass}>
                <option value="">Belirtilmedi</option>
                <option value="human">Human</option>
                <option value="ai_assisted">AI Assisted</option>
                <option value="ai_generated">AI Generated</option>
              </select>
            </div>
            <div>
              <label htmlFor="video_source" className="block text-sm text-zinc-400">
                Görüntü
              </label>
              <select id="video_source" name="video_source" className={selectClass}>
                <option value="">Belirtilmedi</option>
                <option value="real_footage">Real Footage</option>
                <option value="ai_generated">AI Generated</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label htmlFor="voice_source" className="block text-sm text-zinc-400">
                Ses
              </label>
              <select id="voice_source" name="voice_source" className={selectClass}>
                <option value="">Belirtilmedi</option>
                <option value="human">Human</option>
                <option value="synthetic">Synthetic</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <label htmlFor="music_source" className="block text-sm text-zinc-400">
                Müzik
              </label>
              <select id="music_source" name="music_source" className={selectClass}>
                <option value="">Belirtilmedi</option>
                <option value="original">Original</option>
                <option value="licensed">Licensed</option>
                <option value="ai_generated">AI Generated</option>
              </select>
            </div>
          </div>
        </fieldset>

        <label className="flex items-start gap-3 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
          <input type="checkbox" name="rights" required className="mt-0.5 accent-rose-600" />
          <span>
            İçeriğin yayın haklarına sahibim; kullanılan görüntü, ses ve müzikler için gerekli
            izinlere sahibim. Platform kurallarını kabul ediyorum.
          </span>
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-rose-600 py-2.5 font-medium transition hover:bg-rose-500"
        >
          Production oluştur
        </button>
      </form>
    </main>
  );
}
