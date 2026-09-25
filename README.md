# Neon Air Hockey

Tarayıcıda ve telefonda çalışan, neon temalı bir air hockey oyunu. Kurulum veya derleme gerektirmez: saf HTML, CSS ve JavaScript (Canvas 2D + Web Audio).

## Kurallar

- Maç **60 saniye** sürer. Süre yalnızca oyun akarken işler (gol kutlaması ve geri sayımda durur).
- **45. saniyede ikinci top** ortadan oyuna girer. Bu son 15 saniyede oyun gollerde durmaz: gol olan top kısa süre sonra yiyen tarafın yarısından geri gelir.
- Süre bitince çok gol atan kazanır; eşitlikte maç berabere biter.

## Skiller

Her maçta her skillden **1 ücretsiz** hakkın vardır; bekleme süresi yoktur ve maçın başından (geri sayım dahil) kullanılabilir. Ücretsiz hak bitince, mağazadan alınmış hakların varsa onlar kullanılır; yoksa skill düğmesi mağazayı açar (maç duraklar, satın alınca kaldığı yerden devam eder).

| Skill | Etkisi | Süre |
|---|---|---|
| **Dev Kale** | Rakibin kalesi büyür (184 → 304). Bu kaleye gol atılınca etki biter. | 5 sn |
| **Kale Kilidi** | Kendi kalen küçülür (184 → 92). | 5 sn |

- Aynı etki sürerken tekrar basmak hak harcamaz.
- İkisi aynı kaleye denk gelirse etkiler birbirini kısmen dengeler.
- Yapay zekâ yalnızca kendi ücretsiz haklarını kullanır (maç başına en fazla 2): kalesine hızlı top gelirken kilitler, şut çektikten sonra rakip kaleyi büyütür.

## Mağaza ve satın alma

Mağazada ek skill hakları satılır (fiyatlar örnektir, `js/game.js` içindeki `PRODUCTS` listesinden değiştirilir):

| Ürün | İçerik | Örnek fiyat |
|---|---|---|
| Dev Kale | 3 kullanım | ₺9,99 |
| Kale Kilidi | 3 kullanım | ₺9,99 |
| Skill Paketi | 5 Dev Kale + 5 Kale Kilidi | ₺24,99 |

Satın alınan haklar cihazda saklanır ve sonraki maçlarda da kullanılır; iki oyunculu modda iki oyuncu da aynı envanterden kullanır.

> **Şu an TEST MODU:** ödeme alınmaz, ürün onaydan sonra doğrudan envantere eklenir. Gerçek ödeme için `Payments.purchase()` bir ödeme altyapısına bağlanmalıdır — örneğin Android uygulaması için Google Play Faturalandırma, iOS için App Store, web için Stripe. Ayrıca satın almaları doğrulayan ve envanteri tutan bir sunucu gerekir; tarayıcıda (localStorage) tutulan envanter kullanıcı tarafından değiştirilebilir.

## Temalar

Menüdeki **Tema** seçiminden değiştirilir; seçim cihazda saklanır.

- **Neon**: parlayan çizgiler, neon raketler ve ışık izleri.
- **Su Stadyumu**: masanın yerinde gerçek zamanlı simüle edilen bir havuz.
  - **Fizik**: su yüzeyi dalga denklemiyle hesaplanır; dalgalar yayılır, havuz duvarlarından yansır, viskozite ve sürtünmeyle söner.
  - **Etkileşim**: raketler ve paklar suyu hacimleriyle iter; önlerinde kabarma, arkalarında V biçimli iz ve dalga halkaları oluşur. Hızlı hareket köpük bırakır; çarpışmalar ve goller sıçrama ve halka dalgaları üretir.
  - **Görüntü (WebGL)**: tabana boyanmış saha çizgileri ve mozaik fayanslar dalgaların altında kırılarak görünür; yüzey eğriliğinden kostik ışık desenleri, Fresnel yansıması, projektör pırıltıları, nesnelerin tabana düşen gölgeleri ve köpük.
  - **Ses**: çarpışmalarda su sıçraması ve kabarcık sesleri, arka planda hafif havuz ambiyansı.
  - WebGL olmayan cihazlarda havuz durağan gösterilir. Zayıf cihazlarda su, uyarlanabilir kaliteyle daha düşük çözünürlükte çizilir.
- **Buz Stadyumu**: çatlayan, sürekli değişen buz tabakası.
  - **Görüntü**: derin, yarı saydam turkuaz bir buzul gölü; buzun içinde farklı derinliklerde donmuş kabarcık kümeleri ve eski silik çatlaklar, buzun altında süzülen ışık ve yükselen kabarcıklar, bantların dibinde kar, buz altına boyanmış saha çizgileri. Disk klasik siyah kauçuk hokey diskidir.
  - **Etkileşim**: kayan disk buzda ince paralel çizikler, raketler hafif sürtme izi bırakır. Sert şut, duvara şiddetli çarpma, gol ya da skill kullanımı çarpma noktasından dallanarak yayılan çatlaklar oluşturur (güçlü darbede örümcek ağı gibi halka çatlaklar) ve etrafa buz kristalleri sıçrar. İzler zamanla yavaşça "yeniden donar"; her maç temiz buzla başlar.
  - **Ses**: tok vuruşun ardından cam kırılmasını andıran çıtırtılar; güçlü çatlakta donmuş göllere özgü, perdesi hızla inen çınlama. Diskin buzda kayma sesi hızına göre değişir, arkada hafif bir arena uğultusu vardır.
- **Lav Stadyumu**: kırılan bazalt kabuk ve altından akan lav.
  - **Görüntü**: düzensiz çokgen bazalt plakalar; aralarındaki dikişlerden nabız gibi parlayan lav sızar. Kıvılcımlar uçuşur, dikişlerde arada bir lav kabarcığı patlar. Disk, kenarı kızgın bir obsidyen taşıdır.
  - **Etkileşim**: kayan disk kabuğu kızdırır; ardındaki iz soğudukça turuncudan koyu kırmızıya döner ve is lekesi bırakır. Sert şut, şiddetli duvar çarpması, gol ya da skill kabuğu kırar: çarpma noktasından çatlaklar yayılır, altından lav fışkırır ve birkaç saniyede soğuyup yeniden kabuk bağlar. Gol büyük bir lav patlamasıyla kutlanır.
  - **Ses**: vuruşlarda buhar tıslaması, kabuk kırılınca kaya çatırtısı ve boğuk patlama, lav kabarcıklarının "blop" sesi, arkada yerin derinlerinden gelen gürleme.
- **Kum Stadyumu**: ahşap çerçeveli, ince taneli bir kum havuzu.
  - **Görüntü**: rüzgârın oluşturduğu kum dalgacıkları ve alçak tepeler, alçak açılı güneşle her tümseğin eğimine göre ışık ve gölge alması, bantların kuma düşen gölgesi, rüzgârla sürüklenen kum taneleri. Disk kırmızı kauçuktur.
  - **Fizik**: kum bir yükseklik alanı olarak simüle edilir. Raketler ve disk kumu gerçekten iter: önlerinde yığın, arkalarında oluk oluşur (kum hacmi korunur). Yığın yığılma açısını aşınca yanlara kayar (çığ); oluklar zamanla dolar ve düzleşir, dalgacıklar geri gelir. Kazılan yerlerde alttaki koyu kum görünür.
  - **Etkileşim**: sert şut, şiddetli duvar çarpması, gol ya da skill kumda krater açar, kum etrafa savrulur; gol kale ağzında kum fırtınası kaldırır. Her maç düzgün kumla başlar.
  - **Ses**: kuma gömülü boğuk "tok" vuruşlar, raket ve diskin hızına göre kum hışırtısı, savrulan kumun tane tane düşme sesi, arkada esen çöl rüzgârı.
- **Uzay Stadyumu** (Kutup Işığı / Yerçekimi Ağı): yıldızlı gökyüzünün üzerinde ışıktan bir ağ.
  - **Görüntü**: derin uzay, bulutsular, uzak bir sarmal gökada ve yıldızlar; ağın ardında yavaşça dalgalanan, ışık sütunlu yeşil ve mor kutup ışığı perdeleri. Disk, ışıldayan küçük bir yıldızdır ve arkasında kuyruklu yıldız izi bırakır.
  - **Fizik**: ağın düğümleri yaylarla birbirine ve dinlenme konumlarına bağlıdır (iki boyutlu dalga denklemi). Raketler ve disk kütleleriyle ağı kendilerine doğru büker; hızlı hareket, vuruşlar ve iki diskin çarpışması ağda dalga dalga yayılan halkalar üretir, dalgalar bantlardan yansır. Uyarılan bölgeler parlar; ağ büküldükçe arkadaki parlak yıldızların konumu da kayar (kütleçekimsel mercek).
  - **Gol**: süpernova — parlak bir çekirdek, genişleyen şok dalgası halkaları ve tüm ağı sarsan dalga.
  - **Ses**: derin sentezleyici dronu ve uzak kozmik esinti, diskin hızına göre yükselen çekim uğultusu, vuruşlarda çan benzeri metalik çınlama, disk çarpışmasında "vuuv" bükülme sesi, golde süpernova patlaması.

## Özellikler

- **Tek oyuncu**: üç zorluk seviyesinde yapay zekâya karşı (Kolay / Orta / Zor). Yapay zekâ pakın yolunu tahmin eder, bant vuruşu yapar ve karşı atağa geçer.
- **İki oyuncu**: aynı cihazda. Telefon/tablette iki kişi aynı anda dokunmatikle oynar (çoklu dokunma), bilgisayarda biri fare/ok tuşları, diğeri W A S D ile.
- **Görseller**: neon masa, hava delikleri, parıldayan raketler, hıza göre renk değiştiren pak izi, vuruş kıvılcımları, duvar dalgaları, gol patlaması, ekran sarsıntısı, konfeti ve menünün arkasında kendi kendine oynayan bir tanıtım maçı.
- **Skor paylaşımı**: maç sonunda sonuç X, WhatsApp, Telegram ve Facebook'ta paylaşılabilir ya da metin olarak kopyalanabilir. Oyun ayrıca 1080×1350 boyutunda neon bir skor kartı görseli üretir. Telefonda "Paylaş" düğmesi bu görseli sistemin paylaşım menüsüyle (Instagram, WhatsApp vb.) gönderir, bilgisayarda görsel indirilebilir.
- **Ses**: tüm efektler Web Audio ile anlık üretilir, ses dosyası yoktur. Sağ üstteki hoparlör düğmesi ses seviyesi panelini açar (kaydırıcı + sessize alma); ayar tarayıcıda saklanır. Dokunmatik cihazlarda titreşim geri bildirimi verir.
- **Mobil uyumlu**: her ekrana ölçeklenir, Retina ekranlarda net görünür, çentikli ekranlara uyum sağlar, ana ekrana eklenebilir (PWA) ve çevrimdışı çalışır.

## Kontroller

| | Bilgisayar | Telefon / Tablet |
|---|---|---|
| Mavi (alt) | Fare veya ok tuşları | Alt yarıda parmakla sürükle |
| Pembe (üst, 2 oyunculu) | W A S D | Üst yarıda parmakla sürükle |
| Duraklat | `Esc` / `P` | ⏸ düğmesi |
| Ses aç/kapa | `M` | 🔊 düğmesi → sessiz |
| Ses seviyesi | `−` / `+` veya 🔊 düğmesi | 🔊 düğmesi → kaydırıcı |
| Skiller (Mavi) | `1` Dev Kale, `2` Kale Kilidi (veya düğmeler) | Alttaki düğmeler |
| Mağaza | Menüde veya maç sonunda "Mağaza" | Aynı |
| Skiller (Pembe, 2 oyunculu) | `Q` Dev Kale, `E` Kale Kilidi | Üstteki düğmeler |

## Çalıştırma

Dosyaları herhangi bir statik sunucuyla açmanız yeterli:

```bash
python3 -m http.server 8000
# sonra tarayıcıda: http://localhost:8000
```

Telefondan oynamak için siteyi **GitHub Pages** üzerinde yayınlayabilirsiniz: depo ayarlarında *Settings → Pages → Branch* altından bu dalı seçin. Açılan adresi telefonda açıp "Ana ekrana ekle" dediğinizde oyun tam ekran bir uygulama gibi çalışır.

## Dosya yapısı

```
index.html            Sayfa ve menüler
css/style.css         Arayüz, menüler ve arka plan
js/game.js            Fizik, yapay zekâ, çizim, ses ve kontroller
manifest.webmanifest  PWA tanımı
sw.js                 Çevrimdışı önbellek
icons/                Uygulama ikonları
```
