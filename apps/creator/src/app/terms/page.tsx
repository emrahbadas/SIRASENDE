import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Kullanım Şartları",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage title="Kullanım Şartları">
      <p>
        Sıra Senin&apos;i kullanarak bu şartları kabul etmiş olursun. Şartlar değişirse güncel hâli bu sayfada yayınlanır.
      </p>

      <h2>1. Hesap</h2>
      <ul>
        <li>Platformu kullanmak için en az 13 yaşında olmalısın; yaş sınırlı içerikler için ilgili yaşta olmalısın.</li>
        <li>Hesap bilgilerinin doğruluğundan ve şifrenin güvenliğinden sen sorumlusun.</li>
        <li>Hesabını istediğin zaman silebilirsin (Profil → Ayarlar → Hesabımı sil).</li>
      </ul>

      <h2>2. Coin, bonus coin ve bölüm açma</h2>
      <ul>
        <li>Coin, yalnızca Platform içinde kilitli bölümleri açmak için kullanılan sanal bir birimdir; paraya çevrilemez, devredilemez.</li>
        <li>Coin satın alımları uygulama mağazası (Google Play) üzerinden yapılır; iadeler mağazanın kurallarına tabidir.</li>
        <li>Bonus coin ücretsizdir, alındığı tarihten itibaren 14 gün geçerlidir ve günde sınırlı sayıda bölüm için kullanılabilir.</li>
        <li>Kilitli bölümler reklam izleyerek de açılabilir; günlük reklamla açma hakkı sınırlıdır ve her gece 00:00&apos;da (Türkiye saati) yenilenir.</li>
        <li>Açtığın bölüm, içerik yayında kaldığı sürece hesabında açık kalır. Creator veya Platform bir içeriği yayından kaldırırsa erişim sona erebilir.</li>
      </ul>

      <h2>3. İçerik kuralları</h2>
      <p>
        Pornografik veya müstehcen içerik, rıza dışı/gizli çekim, nefret söylemi, taciz, siyasi propaganda ve telif ihlali
        yasaktır. Tüm içerikler yayından önce incelenir. Kuralları ihlal eden içerikler kaldırılır; hesap askıya alınabilir.
        Uygunsuz bulduğun içeriği uygulamadaki “Bildir” seçeneğiyle bildirebilir, creator&apos;ı engelleyebilirsin.
      </p>

      <h2>4. Creator&apos;lar</h2>
      <ul>
        <li>Yüklediğin içeriğin tüm haklarına sahip olduğunu ve içerik politikasına uyduğunu beyan edersin; telif ihlallerinden doğan sorumluluk sana aittir.</li>
        <li>İçeriğini Platform&apos;da yayınlaman için Sıra Senin&apos;e münhasır olmayan, içerik yayında kaldığı sürece geçerli bir yayın lisansı verirsin.</li>
        <li>Reklam, coin ve indirme gelirinden payın Creator Studio&apos;da ilan edilen oranlarla, mağaza komisyonu, vergiler ve video dağıtım maliyeti düşüldükten sonra hesaplanır. Oranlar ileriye dönük olarak değişebilir.</li>
        <li>Kazancını asgari ödeme tutarına ulaştığında kendi adına kayıtlı bir IBAN&apos;a talep edebilirsin. Ödemeler, Platform&apos;un ilgili gelirleri tahsil etmesinden sonra yapılır.</li>
        <li>Depolama kotası planına göre belirlenir; kampanya ve ödül olarak verilen ek depolama süreli olabilir.</li>
        <li>İçerik kurallarını ihlal eden hesaplar askıya alınabilir; askı süresince içerikler yayından kaldırılır ve ödeme talebi yapılamaz.</li>
      </ul>

      <h2>5. Sorumluluk</h2>
      <p>
        İçeriklerin sorumluluğu onları yükleyen creator&apos;lara aittir. Platform hizmeti “olduğu gibi” sunar; kesintisiz veya
        hatasız olacağını garanti etmez. Bilgi &amp; Sohbet içerikleri tıbbi, psikolojik veya hukuki tavsiye değildir.
      </p>

      <h2>6. Uygulanacak hukuk</h2>
      <p>Bu şartlar Türkiye Cumhuriyeti hukukuna tabidir.</p>

      <h2>7. İletişim</h2>
      <p>
        {LEGAL.controller} · <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>
    </LegalPage>
  );
}
