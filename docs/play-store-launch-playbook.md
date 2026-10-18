---
name: play-store-launch
description: Step-by-step playbook for taking an Expo / React Native Android app from "works on my phone" to Google Play production on a personal developer account — domain, store assets, Play Console forms (data safety CSV, IARC, target audience), AdMob, the mandatory 12-tester / 14-day closed test (incl. paid tester services like Testers Community), release cadence and the production-access application. Use when the user wants to publish an app to Google Play, set up closed testing, find testers, fill Play Console declarations, set up AdMob, or plans a new app project and asks for the right order. Lessons learned from launching "Sıra Senin" (Oct 2026).
---

# Google Play'e çıkış rehberi (kişisel geliştirici hesabı)

"Sıra Senin" uygulamasını (Expo SDK 57 + Next.js web + Supabase) Play'e çıkarırken öğrenilen sıra, tuzaklar ve kısayollar. Yeni bir projede bu sırayı izle; her adımda **neden** önemli olduğu yazıyor.

## 0. Büyük resim ve takvim

Kişisel (bireysel) Play hesaplarında üretime çıkmak için **kapalı testte en az 12 test kullanıcısının 14 gün kesintisiz katılımı** zorunlu. Toplam süre, hazırlık dahil gerçekçi olarak **3–4 hafta**:

| Gün | İş |
|---|---|
| 0 | Play Console + AdMob + Search Console hesapları (onaylar 1–3 gün sürebilir, ilk iş bunlar) |
| 1–3 | Formlar, mağaza girişi, AAB, kapalı test kanalı, test servisi |
| 3–17 | 14 gün kapalı test; **en az 3 güncelleme** yayınla |
| ~17 | Üretim erişimi başvurusu (inceleme ~1 hafta) |
| Yayın günü | Gerçek reklam birimi, test bayraklarını kaldır, AdMob'u mağazaya bağla |

Bekleme süresi uzun olan işleri **en başa** koy: hesap kimlik doğrulaması, AdMob onayı, Search Console taraması.

## 1. Kod/altyapı tarafı (Play'e başvurmadan önce)

- **Alan adı:** Kısa, markayla aynı (ör. `marka.app`). Apex ana adres, `www` → apex 308. Gizlilik, şartlar, hesap silme sayfaları bu alan adında olsun.
- **Zorunlu sayfalar:** `/privacy` (KVKK aydınlatma dahil), `/terms`, `/account/delete` (uygulama dışından hesap silme + "hesabı silmeden belirli verileri silme" yolu — Play veri güvenliği formu ikisini de soruyor).
- **Uygulama içinde:** hesap silme (Ayarlar), içerik bildirme ve kullanıcı/creator engelleme (UGC uygulamaları için zorunlu), yayın öncesi moderasyon.
- **Paket adı** (`app.json` → `android.package`) kalıcıdır, sonradan değişmez. Marka kesinleşmeden Play'de uygulama oluşturma.
- **Gereksiz izinleri engelle** (`android.blockedPermissions`): Expo varsayılan olarak `READ/WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW` ekler; Play bunları listeler, veri güvenliği beyanıyla çelişebilir.
- **R8'i aç** (`expo-build-properties` → `android.enableMinifyInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`). Açılmazsa Play "DEX optimizasyonu eşik altında" uyarısı verir. R8'i önce **preview APK**'de telefonda test et (giriş, video, reklam en hassas yerler).
- **Sürüm adı:** her test güncellemesinde `version` (1.0.1, 1.0.2…) artır; aksi halde test kullanıcıları hangi sürümde olduğunu göremez.
- **EAS ortam değişkenleri:** `EXPO_PUBLIC_*` değerleri yalnızca `.env.local`'deyse bulut derlemesi görmez → `eas env:create` (preview + production).
- **E-posta:** Supabase yerleşik maili saatte birkaç mail; 20+ test kullanıcısı aynı gün kayıt olursa onay maili gitmez. Ya özel SMTP'yi (kendi alan adı, ör. `noreply@`) testten **önce** kur, ya da test süresince "Confirm email"i kapat ve yayından önce geri aç (bu projede ikincisi seçildi — unutma!).
- Yerel global `eas-cli` bozulabiliyor → `npx -y eas-cli@latest ...`.

## 2. Hesaplar (sıra önemli)

1. **Google Play Console** — kişisel hesap 25$. Kimlik doğrulaması günler sürebilir. Herkese açık "geliştirici e-postası"na kişisel adres değil `support@alanadi` yaz; "geliştirici adı" mağazada görünür (ör. "Badas Labs").
2. **Google Search Console** — alan adı mülkü, DNS TXT ile doğrula, `https://alanadi/sitemap.xml` gönder (alan adı mülkünde **tam URL** iste).
3. **AdMob** — uygulamayı "henüz yayında değil" diye ekle → **uygulama kimliği** (`~`) `app.json`'a. **Ödüllü** reklam birimi + **SSV geri çağırma** (sunucu doğrulaması, "uyumlulaştırmadaki tüm ağlara uygula" işaretli; "İş ortağı teklifi" boş). **Gizlilik ve mesajlaşma → GDPR mesajı**: "İzin vermeyin" düğmesi tüm ülkelerde açık, "rıza göstermeden kapat" kapalı. Web köküne `app-ads.txt`.
   - **Birim kimliğini kapalı testte uygulamaya koyma** — kapalı test de production profiliyle derlenir; test kullanıcıları gerçek reklama tıklarsa AdMob hesabı askıya alınabilir. Kapalı testte Google'ın test birimi kalsın; test reklamları SSV göndermediği için sunucuda geçici bir "test ödülü" bayrağı (ör. `ADS_TEST_REWARDS=true`) gerekir — **yayın günü kaldır**.
   - "Uygulama mağazasına bağla" adımı yalnızca **herkese açık yayından sonra**.

## 3. Play Console formları (hazır cevap kâğıdı tut)

Bir `store/play-console.md` cevap kâğıdı hazırla; formlar kopyala-yapıştır olur.

- **Oturum açma bilgileri:** incelemeci için **ayrı** test hesabı (kendi hesabını verme). Gmail `+` takma adı işe yarar (`ad+review@gmail.com` — uygulama ayrı hesap görür, mail aynı kutuya gelir). Talimatlar **İngilizce**, ≤500 karakter. Ücretli içerik varsa hesaba **sıfır değerli, süresiz** coin tanımla ki "tüm içeriğe erişim" kutusu dürüst işaretlensin. Bu hesapla engelleme/silme testi **yapma** (bir kez creator'ı engelleyip vitrini boşalttık).
- **Hedef kitle:** 18+ (UGC/olgun içerik). "Google'ın küçük olduğunu belirlediği kullanıcıları kısıtla" kutusunu işaretle.
- **İçerik derecelendirmesi (IARC):** kategori "Diğer tüm uygulama türleri" (Netflix benzeri akış). UGC'de **platformun izin verdiği en olgun içeriğe göre** cevapla (düşük beyan politika ihlali, yüksek çıkması sorun değil). Akış uygulamalarında sonuç çoğu bölgede "Ebeveyn rehberliği / 12+" çıkar — normal.
- **Reklam kimliği:** Evet (AdMob `AD_ID` ekler) — Analiz, Reklam, Sahtekârlık önleme.
- **Veri güvenliği:** Play'den **CSV'yi dışa aktar**, betikle doldur, **CSV'den içe aktar** (yüzlerce satırı elle işaretlemekten kurtarır). Tuzaklar: `PSL_DATA_DELETION_URL` silme talebine "evet" dediysen zorunlu; `PSL_HAS_OUTSIDE_APP_ACCOUNTS` boş kalmalı. AdMob'a giden veriler "paylaşılan": yaklaşık konum, cihaz kimliği, teşhis, uygulama etkileşimleri.
- **Kategori:** Eğlence; etiketler Play listesinden (Video akışı, TV, Film…). "Harici pazarlama" açık (bedava görünürlük).
- **Mağaza girişi:** ad ≤30, kısa açıklama ≤80. Metin yalnızca **çalışan** özellikleri anlatsın (ör. ödemeler kapalıysa "IBAN'ına çek" yazma). Simge 512×512, özellik grafiği 1024×500.
- **Ekran görüntüleri:** telefon görüntüleri ~19.5:9, Play **9:16** ister → 1080×1920 başlıklı karelere yerleştir (koyu zemin, üstte başlık + alt satır, altta yuvarlatılmış ekran). En az 4 adet + kenar ≥1080 px → öne çıkarma uygunluğu. Telifli karakter/başkasının içeriği görünmesin. Mümkünse WhatsApp'tan değil USB/Drive ile aktar (sıkıştırma).
- "Yapay zekâyla üretilmiş öğe" beyanı: görseller kodla çizildiyse "etiketleme".

## 4. Kapalı test ve test servisi (Testers Community)

**Ne:** 12+ gerçek kişiyi 14 gün boyunca tek başına bulmak zor; Testers Community (testerscommunity.com) gibi servisler ücret karşılığı (≈499₺ Starter/15 kişi, 899₺ Pro/25 kişi, 16 gün, "üretim erişimi yoksa iade") kendi test kullanıcılarını sağlar; geri bildirim raporu, ASO raporu ve başvuru formu taslak cevapları verir.

**Nasıl çalışır:**
1. Kapalı test kanalı → **Test kullanıcıları → Google Gruplar** → `testers-community@googlegroups.com` (kopyala-yapıştır). **E-posta listelerine değil** gruplar alanına. Gruplar ile e-posta listesi aynı anda seçilemez; kendi hesaplarını da eklemek için kendi Google Grubunu aç (`proje-test@googlegroups.com`) ve ikisini birden gruplar alanına yaz.
2. **Ülkeler: tümü.** Geri bildirim adresi: `support@`.
3. Kaydet → **Yayın özeti → İncelemeye gönder** (kaydetmek göndermek değildir). Yönetilen yayınlama kapalıysa onayla birlikte yayına girer (ilk kapalı test onayı ~30 dk sürdü).
4. Servise uygulama adı, simge, geliştirici adı ve **katılım bağlantısı** (`https://play.google.com/apps/testing/<paket>`) ver; mağaza bağlantısı `.../store/apps/details?id=<paket>`. Servis uygulamasında "Talimatları dahil et" ile test kullanıcılarına günlük görev listesi (İngilizce) yaz.
5. "Kullanıcılarımız erişemiyor" otomatik e-postası gelirse: grup alanı, ülkeler, kaydedilmemiş değişiklik, gönderilmemiş inceleme kontrol et; düzgünse ayrıntılı cevap yaz.

**Fayda / tuzaklar:**
- 12 kişi kontrol panelinde birkaç saatte tamamlandı; ama "katılım" ≠ "kullanım". Google başvuruda gerçek kullanıma bakar → talimatlarla kayıt, ödül, reklam gibi akışları yaptır; veritabanından kayıt/kullanım takip et.
- Kendi alternatif Gmail hesaplarınla 12'yi doldurma (aynı cihaz/IP; ret riski). `+` takma adları Play'de ayrı kişi sayılmaz.
- Test kullanıcıları APK'yi değil **Play'den** kurmalı; servise dosya verme.
- Kendi telefonundaki preview APK'nin imzası Play'den farklı → Play sürümünü kurmadan önce kaldır.

## 5. Test süresince: en az 3 güncelleme

Üretim başvurularının en sık ret sebebi **test süresince güncelleme yayınlamamak** ("geri bildirimi dinlemediniz"). Plan: ~gün 2 (teknik iyileştirme: R8, izinler), ~gün 7 (test geri bildirimleri), ~gün 11 (cilalama). Her sürüm notunda **somut** değişiklik yaz; bir sürüm günlüğü tut (başvuru cevapları buradan çıkar). Yeni sürüm 14 günlük sayacı **sıfırlamaz**; test kullanıcılarında otomatik güncellenir.

- Kapalı teste yeni sürüm: Kapalı test → **Yeni sürüm oluştur** → AAB yükle (dosya adı önemsiz, içerideki sürüm kodu artmalı) → notlar `<tr-TR>…</tr-TR>` → Kaydet → Yayın özeti → İncelemeye gönder.
- **Lansman öncesi rapor ≠ AAB yükleme yeri**: Ayarlar sayfası yalnızca robot için giriş bilgisi (kaynak kimliği alanları boş) ve isteğe bağlı JSON Robo betiği ister. Rapor her yüklemede çıkmayabilir.
- "Uçtan uca ekran (edge-to-edge) desteği sonlandırılmış API" ve "büyük ekranda yön kilidi" uyarıları React Native çekirdeğinden/dikey kilitten gelir; bilgilendirme, başvuruyu engellemez.

## 6. Üretim erişimi başvurusu

14 gün + 12 katılımcı dolunca Kontrol paneli → "Üretime başvur". Her cevap 250–300 karakter, somut: test kullanıcılarını nasıl buldun, kaç sürüm yayınladın, hangi geri bildirimle ne değişti, uygulama neden hazır. Servisin hazır cevaplarını **kopyalama**, kendi sürüm günlüğünden yaz. Ret gelirse testi uzat, güncelleme yayınla, tekrar başvur.

## 7. Yayın günü kontrol listesi

- Gerçek AdMob ödüllü birim kimliği → EAS production env; yeni production AAB.
- Sunucudan test ödülü bayrağını (`ADS_TEST_REWARDS`) kaldır.
- "Confirm email"i geri aç (SMTP hazır olmalı).
- Hosting ticari plan (Vercel Hobby ticari kullanıma izin vermez → Pro).
- Yayından sonra AdMob → uygulamayı Play kaydına bağla; `app-ads.txt` doğrulansın.
- Telifli/test içerikleri vitrinden kaldır; mağaza görsellerini son içerikle yenile.
