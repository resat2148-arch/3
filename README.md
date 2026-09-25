# Aqua Hockey

Tarayıcıda ve telefonda çalışan, su stadyumunda geçen bir air hockey oyunu (eski adı: Neon Air Hockey). Kurulum veya derleme gerektirmez: saf HTML, CSS ve JavaScript (Canvas 2D, WebGL ve Web Audio). Oyuncular Su Stadyumu ile başlar; diğer temalar oyun içi altınla açılır.

## Kurallar

- Maç **60 saniye** sürer. Süre yalnızca oyun akarken işler (gol kutlaması ve geri sayımda durur).
- **45. saniyede ikinci top** ortadan oyuna girer. Bu son 15 saniyede oyun gollerde durmaz: gol olan top kısa süre sonra yiyen tarafın yarısından geri gelir.
- Süre bitince çok gol atan kazanır; eşitlikte maç berabere biter.

## Skiller

Her maçta her skillden **1 ücretsiz** hakkın vardır; bekleme süresi yoktur ve maçın başından (geri sayım dahil) kullanılabilir. Ücretsiz hak bitince, mağazadan altınla alınmış hakların varsa onlar kullanılır; yoksa skill düğmesi mağazayı açar.

| Skill | Etkisi | Süre |
|---|---|---|
| **Dev Kale** | Rakibin kalesi büyür (184 → 304). Bu kaleye gol atılınca etki biter. | 5 sn |
| **Kale Kilidi** | Kendi kalen küçülür (184 → 92). | 5 sn |

- Aynı etki sürerken tekrar basmak hak harcamaz.
- İkisi aynı kaleye denk gelirse etkiler birbirini kısmen dengeler.
- Yapay zekâ yalnızca kendi ücretsiz haklarını kullanır (maç başına en fazla 2): kalesine hızlı top gelirken kilitler, şut çektikten sonra rakip kaleyi büyütür.

## Altın (oyun parası) ve Mağaza

Oyunda gerçek parayla satış yoktur. Altınla alınabilen her şey **Mağaza**'da, iki sekmede toplanır:

- **Temalar**: yalnızca **Su Stadyumu** ücretsizdir; diğer temalar altınla açılır. Açılan bir tema kalıcıdır ve mağazadan ya da menüden seçilebilir. Menüde kilitli bir temaya dokunmak mağazayı o temanın satın alma adımında açar. Menüden açılan mağazada "Önizle" ile tema, arkadaki tanıtım maçında denenebilir.
- **Yetenekler**: Dev Kale ve Kale Kilidi ek hakları. Satın alınan haklar cihazda saklanır ve sonraki maçlarda da kullanılır; iki oyunculu modda iki oyuncu da aynı envanterden kullanır. Maç içinde ücretsiz hak bitince skill düğmesi mağazayı bu sekmede açar (maç duraklar, satın alınca kaldığı yerden devam eder).

| Tema | Fiyat |
|---|---|
| Su Stadyumu | Ücretsiz |
| Neon | 200 |
| Buz Stadyumu | 250 |
| Kum Stadyumu | 300 |
| Lav Stadyumu | 400 |
| Bataklık Stadyumu | 450 |
| Uzay Stadyumu | 500 |
| Kristal Mağarası | 600 |

| Yetenek paketi | İçerik | Fiyat |
|---|---|---|
| Dev Kale | 3 kullanım | 60 |
| Kale Kilidi | 3 kullanım | 60 |
| Skill Paketi | 5 Dev Kale + 5 Kale Kilidi | 170 |

Altın kazanma yolları:

- **Her maçtan sonra** (maç süre bitene kadar oynanmalı; yarıda bırakılan maç ödül vermez):
  - Tek oyuncu: sonuç (galibiyet 35, beraberlik 20, yenilgi 10) × zorluk (Kolay 1, Orta 1,5, Zor 2) + attığın her gol için 2 (en fazla 10 gol). Örnek: Orta seviyede 3-1 galibiyet = 35 × 1,5 + 6 = 59.
  - İki oyuncu: 15 + atılan her gol için 1 (en fazla 10).
  - Maç sonunda reklam izleyerek o maçın ödülü **2 katına** çıkarılabilir.
- **Reklam izleyerek**: menüde ve mağazada "Reklam izle" ile her reklam için +50 altın (altın yetmediğinde satın alma adımında da çıkar). Günde en fazla 10 ödüllü reklam izlenebilir; reklam sonuna kadar izlenmezse ödül verilmez. Reklam oynarken oyun sesi kısılır.

Fiyatlar ve ödüller `js/game.js` içindeki `THEME_INFO`, `PRODUCTS`, `COIN` ve `matchReward()` ile ayarlanır.

> **Reklamlar şu an TEST MODUNDA:** gerçek reklam yerine 5 saniyelik örnek bir gösterim oynatılır. Gerçek reklam için `Ads.showRewarded()` bir reklam altyapısına bağlanmalıdır — web için Google H5 Games Ads (Ad Placement API, ödüllü reklam), mobil uygulama için AdMob ödüllü reklam gibi. Gerçek sistemde ödül, reklam sağlayıcısının sunucu tarafı doğrulamasından (SSV) sonra bir sunucuda eklenmelidir; tarayıcıda (localStorage) tutulan bakiye, envanter ve açılan temalar kullanıcı tarafından değiştirilebilir.

## Temalar

Menüdeki **Tema** seçiminden ya da Mağaza'nın Temalar sekmesinden değiştirilir; seçim cihazda saklanır. Kilitli temalar Mağaza'da altınla açılır.

- **Neon**: parlayan çizgiler, neon raketler ve ışık izleri.
- **Su Stadyumu** (ücretsiz): masanın yerinde gerçek zamanlı simüle edilen bir havuz.
  - **Fizik**: su yüzeyi dalga denklemiyle hesaplanır; dalgalar yayılır, havuz duvarlarından yansır, viskozite ve sürtünmeyle söner.
  - **Etkileşim**: raketler ve paklar suyu hacimleriyle iter; önlerinde kabarma, arkalarında V biçimli iz ve dalga halkaları oluşur. Hızlı hareket köpük bırakır; çarpışmalar ve goller sıçrama ve halka dalgaları üretir.
  - **Görüntü (WebGL)**: tabana boyanmış saha çizgileri ve mozaik fayanslar dalgaların altında kırılarak görünür; yüzey eğriliğinden kostik ışık desenleri, Fresnel yansıması, projektör pırıltıları, nesnelerin tabana düşen gölgeleri ve köpük.
  - **Ses**: çarpışmalarda su sıçraması ve kabarcık sesleri, arka planda hafif havuz ambiyansı.
  - WebGL olmayan cihazlarda havuz (ve bataklık) durağan gösterilir. Zayıf cihazlarda su, uyarlanabilir kaliteyle daha düşük çözünürlükte çizilir.
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
- **Kristal Mağarası**: karanlık bir mağarada ışıldayan kristallerden bir zemin.
  - **Görüntü**: renk bölgelerine ayrılmış (ametist, safir, akuamarin, zümrüt, topaz, yakut) fasetli kristaller; her yüz ışığa göre farklı tonda, kristaller hafifçe nefes alır gibi ışıldar. Kenarlarda küçük kristal kümeleri. Disk berrak, fasetli bir kristaldir.
  - **Etkileşim**: vuruşlar genişleyen ışık dalgaları yayar. Dalga cephesi prizmadaki gibi gökkuşağına ayrışır; geçtiği kristaller halka halka gökkuşağı renkleri alır (bantlar uzaklaştıkça açılır) ve bir süre parlamaya devam eder. Raketler ve disk altlarındaki kristalleri aydınlatır. Gol, kale ağzından yayılan güçlü bir ışık patlamasıdır.
  - **Ses**: her vuruş kristal çanı gibi çalar; nota, vurulan kristalin rengine göre C majör pentatonik gamdan seçilir (ametist Do, safir Re, akuamarin Mi, zümrüt Sol, topaz La, yakut ince Do), böylece maç bir melodiye dönüşür. Bantlarda bir oktav pes nota, iki disk çarpışınca nota ve beşlisi, golde yükselen çan arpeji. Arkada mağara esintisi, kristallerin sessiz rezonansı ve ara sıra damlayan su.
- **Bataklık Stadyumu**: koyu, parlak, yoğun çamur; üzerinde yosun kümeleri, nilüferler ve yapraklar yüzer.
  - **Fizik**: su motoru çamur ayarlarıyla çalışır. Dalgalar ağır ve yavaş yayılıp çabuk söner. Çamurun kalıcı biçimi dalgalardan ayrı tutulur: raketler ve disk geçtikleri yerde oluk açar, çıkan çamur önlerine ve yanlarına yığılır (hacim korunur). Oluklar ve kraterler ancak birkaç saniyede, çamur yavaşça akıp düzleştikçe kapanır. Yosun ve yapraklar yüzey eğimiyle sürüklenir, raket ve disk onları iter.
  - **Görüntü (WebGL)**: ıslak çamurda keskin ışık pırıltıları, alçak açılı ışıkla belirginleşen oluk ve tümsekler, karıştırılan çamurda açık ve daha ıslak izler, nesnelerin çamura düşen gölgeleri. Kenarda yosun tutmuş eski ahşap iskele ve köşelerde sazlar. Disk, üstünde çamur lekeleri olan sarı bir kauçuk disktir.
  - **Etkileşim**: zeminden ara sıra kabarcıklar yükselir, kabarıp "blop" diye patlar ve küçük bir çukur bırakır. Sert şutta, şiddetli çarpışmada ve golde çamur sıçrar.
  - **Ses**: vıcık vuruşlar, çamur sıçraması ve düşen damlaların şıpırtısı, patlayan kabarcıklar, raket ve diskin çamuru yarma sesi; arkada nemli bataklık havası, cırcır böceği korosu ve ara sıra kurbağa vıraklaması.

## Özellikler

- **Tek oyuncu**: üç zorluk seviyesinde yapay zekâya karşı (Kolay / Orta / Zor). Yapay zekâ pakın yolunu tahmin eder, bant vuruşu yapar ve karşı atağa geçer.
- **İki oyuncu**: aynı cihazda. Telefon/tablette iki kişi aynı anda dokunmatikle oynar (çoklu dokunma), bilgisayarda biri fare/ok tuşları, diğeri W A S D ile.
- **Görseller**: neon masa, hava delikleri, parıldayan raketler, hıza göre renk değiştiren pak izi, vuruş kıvılcımları, duvar dalgaları, gol patlaması, ekran sarsıntısı, konfeti ve menünün arkasında kendi kendine oynayan bir tanıtım maçı.
- **Skor paylaşımı**: maç sonunda sonuç X, WhatsApp, Telegram ve Facebook'ta paylaşılabilir ya da metin olarak kopyalanabilir. Oyun ayrıca 1080×1350 boyutunda neon bir skor kartı görseli üretir. Telefonda "Paylaş" düğmesi bu görseli sistemin paylaşım menüsüyle (Instagram, WhatsApp vb.) gönderir, bilgisayarda görsel indirilebilir.
- **Ses**: tüm efektler Web Audio ile anlık üretilir, ses dosyası yoktur. Sağ üstteki hoparlör düğmesi ses seviyesi panelini açar (kaydırıcı + sessize alma); ayar tarayıcıda saklanır. Dokunmatik cihazlarda titreşim geri bildirimi verir.
- **Dil**: Türkçe ve İngilizce (English). Menüdeki **Dil · Language** seçiminden değiştirilir ve cihazda saklanır; ilk açılışta tarayıcının diline göre seçilir (Türkçe tarayıcıda Türkçe, diğerlerinde İngilizce). Menüler, oyun içi yazılar, mağaza, paylaşım metinleri ve skor kartı görseli seçili dilde gösterilir. Metinler `js/game.js` içindeki `STR` sözlüğünde, HTML'deki sabit metinler `data-i18n` öznitelikleriyle tanımlıdır.
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

## CrazyGames sürümü

```bash
./tools/build-crazygames.sh
# çıktı: dist/aqua-hockey-crazygames.zip (CrazyGames geliştirici portalına yüklenecek dosya)
```

Bu sürümde `index.html`'e CrazyGames HTML5 SDK'sı (v3) eklenir, PWA dosyaları (manifest, `sw.js`) çıkarılır ve maç sonundaki **sosyal paylaşım düğmeleri gizlenir** (CrazyGames, oyunun başka bir oynanabilir web sürümüne götüren bağlantılara izin vermez; skor kartı görseli kalır). Kendi sitendeki sürümde paylaşım düğmeleri durur. Oyun açılırken SDK başlatılır ve **ilerleme SDK'nın veri modülüne kaydedilir** (altın, açılan temalar, envanter, ayarlar). CrazyGames'in iframe'inde localStorage'a güvenilemediği için bu gereklidir; veri modülü, oyuncu CrazyGames hesabıyla girdiyse ilerlemeyi cihazlar arasında eşitler. Portaldaki gönderim formunda ilerleme kaydı için **"CrazyGames SDK veri modülü"** seçeneği işaretlenmelidir.

Oyuncu fiilen oynarken (maç, geri sayım, gol kutlaması) SDK'ya `gameplayStart`, oyun durduğunda (duraklatma, maç içi mağaza, maç sonu, ana menü, sekme gizlenince) `gameplayStop` bildirilir; bildirim yalnızca durum değiştiğinde gönderilir.

CrazyGames'in **ses kapatma ayarı** (SDK `game.settings.muteAudio`) desteklenir: açılışta okunur ve değişiklikleri dinlenir; platform sesi kapattığında oyun sessizdir ve oyun içi ses düğmesi, kaydırıcı ya da kısayollar sesi geri açamaz.

SDK yüklenemezse, başlatılamazsa ya da 6 saniye içinde yanıt vermezse oyun yine açılır ve yerel kayıtla (localStorage) çalışır. Kendi sitende yayınlanan normal sürüm SDK'yı yüklemez ve localStorage kullanır.

## Dosya yapısı

```
index.html            Sayfa ve menüler
css/style.css         Arayüz, menüler ve arka plan
js/game.js            Fizik, yapay zekâ, çizim, ses ve kontroller
manifest.webmanifest  PWA tanımı
sw.js                 Çevrimdışı önbellek
tools/                CrazyGames sürümünü üreten betik
icons/                Uygulama ikonları
```
