import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../../legal-page";
import { deleteMyAccount } from "./actions";

export const metadata: Metadata = {
  title: "Hesap silme",
  alternates: { canonical: "/account/delete" },
};

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { error, done } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <LegalPage title="Hesabını sil">
      {done ? (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-4 text-emerald-200">
          Hesabın silindi. Sıra Senin&apos;i kullandığın için teşekkürler.
        </p>
      ) : (
        <>
          <p>
            Sıra Senin hesabını uygulamada <strong>Profil → Ayarlar → Hesabımı sil</strong> yolundan ya da bu sayfadan
            silebilirsin.
          </p>

          <h2>Silinenler</h2>
          <ul>
            <li>E-posta adresin, kullanıcı adın ve görünen adın</li>
            <li>İzleme geçmişin, listen, beğenilerin, takip ve engellemelerin, giriş serin</li>
            <li>Geri bildirim mesajların</li>
            <li>Creator isen: tüm yapımların ve videoların, creator profilin, IBAN bilgin</li>
            <li>Kalan coin ve bonus coin bakiyen (iade edilmez)</li>
          </ul>

          <h2>Saklananlar</h2>
          <p>
            Coin satın alma, kazanç ve ödeme kayıtları vergi mevzuatı gereği yasal süre boyunca (genellikle 10 yıl) saklanır;
            bu kayıtlardan kimliğin ayrılır. Bekleyen bir ödeme talebin varsa, sonuçlanana kadar hesap silinemez.
          </p>

          {error && (
            <p className="rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-300">
              {decodeURIComponent(error)}
            </p>
          )}

          {user ? (
            <form action={deleteMyAccount} className="mt-6 space-y-3 rounded-xl border border-rose-900/60 bg-rose-950/20 p-5">
              <p className="text-sm">
                <strong>{user.email}</strong> hesabı kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylamak için
                aşağıya <strong>SİL</strong> yaz.
              </p>
              <input
                name="confirm"
                autoComplete="off"
                placeholder="SİL"
                className="w-40 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-rose-500"
              />
              <div>
                <button type="submit" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium hover:bg-rose-500">
                  Hesabımı kalıcı olarak sil
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-6">
              Hesabını silmek için <Link href="/login?next=%2Faccount%2Fdelete">giriş yap</Link>. Hesabına giriş
              yapamıyorsan, kayıtlı e-posta adresinden <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> adresine
              &quot;Hesap silme&quot; konulu bir e-posta gönder; talebin en geç 30 gün içinde işlenir.
            </p>
          )}
        </>
      )}
    </LegalPage>
  );
}
