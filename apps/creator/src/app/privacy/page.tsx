import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Gizlilik Politikası ve KVKK Aydınlatma Metni">
      <p>
        Bu metin, Sıra Senin mobil uygulaması ve web sitesi (birlikte “Platform”) üzerinden işlenen kişisel
        verilerin 6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) kapsamında nasıl işlendiğini açıklar.
      </p>

      <h2>1. Veri sorumlusu</h2>
      <p>
        {LEGAL.controller}
        {LEGAL.address ? `, ${LEGAL.address}` : ""}. İletişim: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>

      <h2>2. İşlenen veriler</h2>
      <ul>
        <li><strong>Hesap:</strong> e-posta adresi, kullanıcı adı, görünen ad, şifre (yalnızca şifrelenmiş hâliyle).</li>
        <li><strong>Kullanım:</strong> izlenen bölümler ve kaldığın yer, listen, beğenilerin, takip ettiğin ve engellediğin creator&apos;lar, giriş serisi.</li>
        <li><strong>Cüzdan ve işlemler:</strong> coin satın alımları (mağaza işlem numarası, paket, tutar), coin ve bonus coin hareketleri, açılan bölümler.</li>
        <li><strong>Reklam:</strong> ödüllü reklam izleme kayıtları ve reklam sağlayıcısının (Google AdMob) cihaz/reklam kimlikleri.</li>
        <li><strong>Creator&apos;lar için ayrıca:</strong> creator adı, biyografi, yüklenen videolar ve posterler, ödeme için hesap sahibi adı ve IBAN, kazanç ve ödeme kayıtları.</li>
        <li><strong>Destek:</strong> geri bildirim ve içerik bildirimi mesajların.</li>
        <li><strong>Teknik:</strong> IP adresi, cihaz/tarayıcı bilgisi ve hata kayıtları (güvenlik ve işletim için).</li>
      </ul>

      <h2>3. Amaçlar ve hukuki sebepler</h2>
      <ul>
        <li>Hesabını oluşturmak, içerikleri sunmak, kaldığın yeri hatırlamak — sözleşmenin kurulması ve ifası (KVKK m.5/2-c).</li>
        <li>Coin satışı, bölüm açma, creator kazanç ve ödemeleri — sözleşmenin ifası ve hukuki yükümlülük (m.5/2-c, m.5/2-ç).</li>
        <li>Muhasebe ve vergi kayıtlarını saklamak — hukuki yükümlülük (m.5/2-ç).</li>
        <li>İçerik moderasyonu, kötüye kullanımın ve sahtekârlığın önlenmesi, güvenlik — meşru menfaat (m.5/2-f).</li>
        <li>Ödüllü reklam göstermek ve reklam izlemeyi doğrulamak — sözleşmenin ifası ve meşru menfaat; kişiselleştirilmiş reklam için cihazındaki tercihlere/açık rızana göre.</li>
        <li>İzlenme istatistikleri (anonim/toplu) ile platformu geliştirmek — meşru menfaat.</li>
      </ul>

      <h2>4. Aktarım</h2>
      <p>Hizmeti sunmak için verilerin aşağıdaki hizmet sağlayıcılara, yurt dışında bulunan sunucular dahil, aktarılır:</p>
      <ul>
        <li>Supabase (veritabanı ve kimlik doğrulama), Vercel (web sunucusu)</li>
        <li>Cloudflare (video depolama ve dağıtım)</li>
        <li>Google (Google Play ödeme sistemi, AdMob reklamları)</li>
      </ul>
      <p>
        Yurt dışına aktarım KVKK m.9 kapsamındaki şartlara uygun olarak yapılır. Ayrıca yasal zorunluluk hâlinde yetkili
        kamu kurumlarıyla paylaşılabilir. Verilerin satılmaz.
      </p>

      <h2>5. Saklama süreleri</h2>
      <ul>
        <li>Hesap ve kullanım verileri: hesabın açık olduğu sürece; hesabını silince silinir veya anonimleştirilir.</li>
        <li>Satın alma, kazanç ve ödeme kayıtları: vergi ve ticari mevzuatın öngördüğü süre (genellikle 10 yıl) boyunca, kimliğinden ayrılmış olarak.</li>
        <li>Güvenlik kayıtları: ilgili mevzuatta öngörülen süre kadar.</li>
      </ul>

      <h2>6. Hesap silme</h2>
      <p>
        Hesabını uygulamada Profil → Ayarlar → Hesabımı sil yolundan ya da <a href="/account/delete">bu sayfadan</a> silebilirsin.
      </p>

      <h2>7. Hakların (KVKK m.11)</h2>
      <p>
        Verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, amacını öğrenme, aktarıldığı kişileri bilme, düzeltilmesini
        veya silinmesini isteme, itiraz etme ve zararın giderilmesini talep etme haklarına sahipsin. Başvurularını{" "}
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> adresine iletebilirsin; en geç 30 gün içinde yanıtlanır.
      </p>

      <h2>8. Çocuklar</h2>
      <p>
        Platform 13 yaşından küçükler için tasarlanmamıştır. Yaş sınırı belirtilen içerikler (16+, 18+) yalnızca uygun yaştaki
        kullanıcılar içindir.
      </p>
    </LegalPage>
  );
}
