# Play Console cevap kâğıdı — Sıra Senin

Play Console formlarına kopyala-yapıştır cevaplar. Uygulamanın bugünkü hâline göre yazıldı (14 Ekim 2026):
e-posta + şifre girişi, izleme/beğeni/liste/takip, geri bildirim ve içerik bildirimi, AdMob ödüllü reklam.
Konum izni, kamera, mikrofon, rehber, fotoğraf galerisi **yok**. Coin satın alma henüz kapalı ("Çok yakında").
Play Console'daki soru metinleri zamanla değişebilir; anlam olarak eşleşeni seç.

Mağaza metinleri ve görseller: [listing.md](listing.md), `icon-512.png`, `feature-1024x500.png`.

---

## 1. Uygulama oluştur

| Alan | Cevap |
|---|---|
| Uygulama adı | `Sıra Senin: Dikey Diziler` |
| Varsayılan dil | Türkçe – tr-TR |
| Uygulama / oyun | Uygulama |
| Ücretsiz / ücretli | Ücretsiz (uygulama içi satın alma sonradan eklenebilir; ücretsiz → ücretli değiştirilemez) |

## 2. Gizlilik politikası

`https://sirasenin.app/privacy`

## 3. Uygulama erişimi

**"Tüm işlevler veya bazı işlevler kısıtlı"** → talimat ekle:

- Ad: `İnceleme hesabı`
- Kullanıcı adı / şifre: **yalnızca inceleme için açılmış ayrı bir hesap** (kurucu açar; kişisel hesap verilmez). Hesabın e-posta onayı tamamlanmış olmalı.
- Talimat:

```
Uygulamayı açın, Profil sekmesindeki (veya Keşfet ekranının sağ üstündeki) "Giriş yap"a
dokunun ve bu e-posta ile şifreyi girin. Keşfet ve Kısa sekmeleri giriş yapmadan da
kullanılabilir. Ödüller (günlük giriş ödülü), Listem, kilitli bölüm açma ve Profil giriş
gerektirir. Kilitli bir bölümü açmak için bir dizide kilitli bölümü başlatın ve
"2 reklam izle, ücretsiz aç" düğmesine dokunun (2 kısa reklam).
```

## 4. Reklamlar

**Evet, uygulamam reklam içeriyor.** (AdMob ödüllü reklam: izleyici isterse reklam izleyerek kilitli bölüm açar.)

## 5. İçerik derecelendirmesi (IARC anketi)

- E-posta: `support@sirasenin.app` (sertifika buraya gelir)
- Kategori: listede en yakını — **sosyal / kullanıcı içeriği paylaşımı** veya **içerik akışı (streaming)** türü. Oyun değil.
- Cevap ilkesi: içerik creator'lardan geldiği için **platformun izin verdiği en olgun içeriğe** göre cevapla, en hafife göre değil. Platform kuralları: yaş etiketleri 7+ / 13+ / 16+ / 18+; uyarılar şiddet, korku, argo/küfür, hassas temalar, madde kullanımı; **pornografik / açık cinsel içerik yasak**; her dizi yayından önce incelenir.

| Soru konusu | Cevap |
|---|---|
| Şiddet | Evet — kurgusal/gerçekçi şiddet içerebilir (gerçek ve aşırı vahşet yok) |
| Korku / ürkütücü içerik | Evet |
| Cinsellik / çıplaklık | Açık cinsel içerik ve çıplaklık **yasak**; romantik sahneler olabilir (ima düzeyinde) |
| Küfür / kaba dil | Evet — olabilir |
| Uyuşturucu, alkol, tütün | Evet — anlatıda kullanım gösterilebilir (özendirme yok) |
| Kumar / gerçek parayla kumar | Hayır (coin yalnızca bölüm açmak için; şans oyunu yok) |
| Kullanıcılar birbiriyle iletişim kurabiliyor mu | Hayır — mesajlaşma/yorum yok. Takip ve beğeni var. |
| Kullanıcı içeriği paylaşılıyor mu | **Evet** — creator'lar video yükler (yayın öncesi moderasyon, içerik bildirme, creator engelleme var) |
| Konum paylaşımı | Hayır |
| Dijital ürün satın alma | Evet — uygulama içi coin (ileride; şu an kapalı) |
| Kullanıcıya özel reklam | Evet (AdMob) |

Beklenen sonuç 16+ / 18+ civarı (PEGI 16–18). Sonuç fazla yüksek çıkarsa sorun değil; düşük beyan politika ihlalidir.

## 6. Hedef kitle ve içerik

- Hedef yaş grupları: **18 ve üzeri** (yalnızca bu kutu)
- "Uygulama çocukların ilgisini çekebilir mi?" → **Hayır** (kısa dramalar yetişkin izleyiciye yönelik)
- Bu seçimle Google'ın Aileler politikası ve çocuklara özel reklam kuralları devreye girmez.

## 7. Haber uygulaması / Devlet / Finans / Sağlık / COVID-19

Hepsi **Hayır** / **Uygulamam bu özellikleri içermiyor**. Coin sanal para birimidir, finansal özellik değildir.

## 8. Reklam kimliği (Advertising ID)

**Evet, reklam kimliği kullanıyor.** Amaç: **Reklam veya pazarlama** (+ "Sahtekarlık önleme, güvenlik ve uyumluluk"). AdMob SDK'sı `AD_ID` iznini otomatik ekler.

## 9. Veri güvenliği

### Genel sorular

| Soru | Cevap |
|---|---|
| Uygulama gerekli kullanıcı veri türlerini topluyor veya paylaşıyor mu? | **Evet** |
| Toplanan tüm veriler aktarım sırasında şifreleniyor mu? | **Evet** (HTTPS) |
| Kullanıcılar verilerinin silinmesini isteyebilir mi? | **Evet** — uygulama içinden (Profil → Ayarlar → Hesabımı sil) ve web'den |
| Hesap silme URL'si | `https://sirasenin.app/account/delete` |
| Hesap oluşturma yöntemi | Kullanıcı adı/e-posta ve şifre |

### Veri türleri

"Toplanan" = sunucumuza gelen; "Paylaşılan" = üçüncü tarafa giden (yalnızca AdMob). Hizmet sağlayıcılar (Supabase, Vercel, Cloudflare) bizim adımıza işlediği için "paylaşım" sayılmaz.

| Kategori → Veri türü | Toplanıyor | Paylaşılıyor | Zorunlu / isteğe bağlı | Amaçlar |
|---|---|---|---|---|
| Kişisel bilgiler → **E-posta adresi** | Evet | Hayır | Zorunlu (hesap için) | Uygulama işlevi, Hesap yönetimi |
| Kişisel bilgiler → **Kullanıcı kimlikleri** (kullanıcı adı, hesap kimliği) | Evet | Hayır | Zorunlu (hesap için) | Uygulama işlevi, Hesap yönetimi |
| Kişisel bilgiler → **Ad** (görünen ad) | Evet | Hayır | İsteğe bağlı | Uygulama işlevi |
| Finansal bilgiler → **Satın alma geçmişi** (coin bakiyesi, coin/reklamla açılan bölümler) | Evet | Hayır | Zorunlu değil (yalnızca kullanırsa) | Uygulama işlevi |
| Uygulama etkinliği → **Uygulama etkileşimleri** (izleme ilerlemesi, beğeni, liste, takip) | Evet | Hayır | İsteğe bağlı | Uygulama işlevi, Analiz, Kişiselleştirme |
| Uygulama etkinliği → **Kullanıcı tarafından oluşturulan diğer içerikler** (geri bildirim, içerik bildirimi) | Evet | Hayır | İsteğe bağlı | Uygulama işlevi, Güvenlik/uyumluluk |
| Konum → **Yaklaşık konum** (AdMob, IP adresinden) | Evet | **Evet — Google AdMob** | Zorunlu değil (reklam izlerse) | Reklam/pazarlama, Sahtekarlık önleme |
| Cihaz veya diğer kimlikler → **Cihaz/reklam kimliği** (AdMob) | Evet | **Evet — Google AdMob** | Zorunlu değil (reklam izlerse) | Reklam/pazarlama, Analiz, Sahtekarlık önleme |
| Uygulama bilgileri ve performans → **Teşhis** (AdMob SDK) | Evet | **Evet — Google AdMob** | Zorunlu değil | Analiz, Sahtekarlık önleme |

Toplanmayanlar: tam konum, rehber, fotoğraf/video (izleyicide), ses, takvim, SMS, sağlık, web geçmişi, ödeme kartı.

Notlar:
- AdMob satırları Google'ın AdMob veri beyanı rehberine göre; formu doldururken "Google Mobile Ads SDK data disclosure" sayfasıyla son kez karşılaştır.
- Creator IBAN'ı yalnızca **web** Creator Studio'da alınır, mobil uygulamada değil; bu form mobil uygulamayı kapsar. Coin satışı (Play Billing) açılınca "Satın alma geçmişi" zaten beyanlı.

## 10. Mağaza kaydı

| Alan | Değer |
|---|---|
| Uygulama adı | `Sıra Senin: Dikey Diziler` |
| Kısa açıklama | listing.md → "Kısa açıklama" |
| Tam açıklama | listing.md → "Uzun açıklama" |
| Uygulama simgesi | `icon-512.png` (512×512) |
| Öne çıkan grafik | `feature-1024x500.png` |
| Telefon ekran görüntüleri | en az 2 (9:16), preview sürümünden; başkasına ait içerik görünmesin |
| Uygulama kategorisi | Eğlence |
| Etiketler | Video, Dizi, Kısa video, Eğlence, Drama (listede olanlar) |
| E-posta | `support@sirasenin.app` |
| Web sitesi | `https://sirasenin.app` |
| Telefon | boş bırakılabilir |

## 11. Kapalı test sürümü

1. Test → Kapalı test → varsayılan kanal → **Ülkeler**: Türkiye (+ test servisinin istediği ülkeler).
2. **Test kullanıcıları**: e-posta listesi veya Google Grubu; katılım linkini paylaş.
3. **Yeni sürüm** → Play Uygulama İmzalama: **kabul et** → AAB yükle.
4. Sürüm adı: otomatik (`2 (1.0.0)`).
5. Sürüm notları:

```
<tr-TR>
İlk kapalı test sürümü. Dikey dizileri bölüm bölüm izle, ilk bölümler ücretsiz;
kilitli bölümleri kısa reklamlarla aç, günlük girişle bonus coin kazan.
Geri bildirimini Profil → Geri bildirim gönder'den iletebilirsin.
</tr-TR>
```

6. Kaydet → İncele → İncelemeye gönder.

## 12. Üretim erişimi başvurusu (14 gün sonra)

Google kapalı testle ilgili sorular sorar (kaç kişi test etti, nasıl geri bildirim toplandı, neler düzeltildi, uygulama yayına hazır mı). Cevapları test boyunca gelen geri bildirimlerden birlikte hazırlayacağız; düzeltmeleri commit geçmişi gösterir.
