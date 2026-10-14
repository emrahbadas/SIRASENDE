import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createProduction } from "../actions";
import { PRODUCTION_TYPES } from "@/lib/labels";

const selectClass =
  "mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-orange-500";

export default async function NewProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name_tr")
    .order("name_tr");

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
              {Object.entries(PRODUCTION_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
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
          <div>
            <label htmlFor="category_id" className="block text-sm text-zinc-400">
              Tür (kategori) *
            </label>
            <select id="category_id" name="category_id" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Seç — zorunlu
              </option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_tr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="age_rating" className="block text-sm text-zinc-400">
              Yaş aralığı *
            </label>
            <select id="age_rating" name="age_rating" required defaultValue="" className={selectClass}>
              <option value="" disabled>
                Seç — zorunlu
              </option>
              <option value="7+">7+</option>
              <option value="13+">13+</option>
              <option value="16+">16+</option>
              <option value="18+">18+</option>
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

        <fieldset className="rounded-xl border border-zinc-800 p-4">
          <legend className="px-2 text-sm text-zinc-400">İçerik uyarıları (varsa işaretle)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["violence", "Şiddet"],
              ["fear", "Korku öğeleri"],
              ["profanity", "Argo / küfür"],
              ["sensitive_themes", "Hassas temalar"],
              ["substance_use", "Madde kullanımı"],
            ].map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  name="content_warnings"
                  value={value}
                  className="accent-orange-600"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-amber-300">
            ⚠ İçerik Politikası — Lütfen Dikkatle Oku
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-200/90">
            <li>
              Sıra Senin&apos;de <strong>pornografik veya müstehcen içerik kesinlikle yasaktır</strong>.
            </li>
            <li>
              Gerçek kişilerin <strong>gizli çekimleri, ifşa görüntüleri veya rızası olmayan
              görüntüleri</strong> paylaşılamaz.
            </li>
            <li>
              Hikâye ve senaryo kurgusu dışında <strong>siyasi propaganda ve gündem içeriği</strong>{" "}
              yayınlanamaz.
            </li>
            <li>
              Platform <strong>kurgusal senaryo içeriklerine</strong>, kişilerin{" "}
              <strong>kendi hikâyelerinden türetilmiş dizilere</strong> ve creator&apos;ın{" "}
              <strong>kendi hazırladığı sohbet / ders serilerine</strong> yer verir.
            </li>
            <li>
              <strong>Manevi</strong> içerikler saygılı bir dille anlatılır; başka inanç ve gruplara
              yönelik aşağılama veya nefret söylemi yayınlanamaz.
            </li>
            <li>
              <strong>Bilgi &amp; Sohbet</strong> içerikleri tıbbi, psikolojik veya hukuki tavsiye
              yerine geçmez; tedavi vaadi içeremez. Psikoloji konulu serilerde bunu belirtmen gerekir.
            </li>
            <li>
              <strong>Sahne</strong> kayıtlarında oyun metninin ve kaydın yayın haklarına sahip
              olmalısın (yazar / topluluk izni).
            </li>
            <li>
              Telif hakkı içeren materyallerin kullanımından doğacak tüm hukuki sorumluluk{" "}
              <strong>creator&apos;a aittir</strong>.
            </li>
          </ul>
          <p className="mt-3 text-xs text-amber-200/70">
            Bu kurallara aykırı içerikler moderasyon sürecinde reddedilir; yayındaki ihlaller
            kaldırılır ve hesap yaptırımı uygulanabilir.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="policy_content" required className="mt-0.5 accent-orange-600" />
            <span>
              İçeriğimde pornografik/müstehcen görüntü, gerçek kişilerin gizli veya ifşa
              görüntüleri ve senaryo dışı siyasi içerik <strong>bulunmadığını</strong> beyan
              ediyorum.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="policy_fiction" required className="mt-0.5 accent-orange-600" />
            <span>
              Bu yapımın <strong>kurgusal bir senaryoya</strong>,{" "}
              <strong>kendi hikâyemden türetilmiş</strong> bir anlatıya ya da{" "}
              <strong>kendi hazırladığım bir sohbet / ders serisine</strong> dayandığını onaylıyorum.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="policy_copyright" required className="mt-0.5 accent-orange-600" />
            <span>
              Kullanılan görüntü, ses ve müziklerin yayın haklarına sahibim; telif ihlallerinden
              doğacak tüm sorumluluğun <strong>bana ait olduğunu</strong> kabul ediyorum.
            </span>
          </label>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-orange-600 py-2.5 font-medium transition hover:bg-orange-500"
        >
          Production oluştur
        </button>
      </form>
    </main>
  );
}
