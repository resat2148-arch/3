# Elemental Puck Arena

Tarayıcıda ve telefonda çalışan bir air hockey oyunu: sekiz stadyum (su, neon, buz, kum, lav, bataklık, uzay, kristal), her biri kendi fiziğiyle (eski adları: Aqua Hockey, Neon Air Hockey; kayıt anahtarlarının `neonah_` öneki bu yüzden değişmez). Kurulum veya derleme gerektirmez: saf HTML, CSS ve JavaScript (Canvas 2D, WebGL ve Web Audio). Oyuncular Su Stadyumu ile başlar; diğer temalar oyun içi altınla açılır.

## Kurallar

- Maç **60 saniye** sürer. Süre yalnızca oyun akarken işler (gol kutlaması ve geri sayımda durur).
- Skor, üstteki süre göstergesinin iki yanında durur (solda Sen / Mavi, sağda CPU / Pembe); gol atan tarafın sayısı kısa süre büyür. Masanın zemininde skor yazmaz.
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

Oyunda gerçek parayla satış yoktur. Altınla alınabilen her şey **Mağaza**'da, dört sekmede toplanır (Temalar, Görünümler, Yükseltmeler, Yetenekler; görünümler aşağıda, altın kazanma yollarının arasında anlatılıyor):

- **Temalar**: yalnızca **Su Stadyumu** ücretsizdir; diğer temalar altınla açılır. Açılan bir tema kalıcıdır ve mağazadan ya da menüden seçilebilir. Menüde kilitli bir temaya dokunmak mağazayı o temanın satın alma adımında açar. Menüden açılan mağazada "Önizle" ile tema, arkadaki tanıtım maçında denenebilir.
- **Yükseltmeler**: kalıcı geliştirmeler, her biri 5 seviye. Yalnızca tek oyunculu (kariyer) maçlarda oyuncunun raketine işler; iki oyunculu mod eşit kalır. Alınan seviye maç içinde alınsa da hemen işler. Ayarlar `UPGRADES` içinde.
  - **Raket Hızı**: seviye başına en yüksek vuruş hızı +%5 (pakın hız sınırı, raketin en yüksek hızı ve klavyeyle hareket hızı; son seviyede +%25).
  - **Şut Gücü**: seviye başına şutlar +%6 daha hızlı (raketin pak yönündeki hızından paka geçen itiş artar; son seviyede +%30).
  - **Yetenek Süresi**: seviye başına Dev Kale ve Kale Kilidi +0,6 sn (5 sn → son seviyede 8 sn).
- **Yetenekler**: Dev Kale ve Kale Kilidi ek hakları. Satın alınan haklar cihazda saklanır ve sonraki maçlarda da kullanılır; iki oyunculu modda iki oyuncu da aynı envanterden kullanır. Maç içinde ücretsiz hak bitince skill düğmesi mağazayı bu sekmede açar (maç duraklar, satın alınca kaldığı yerden devam eder).

| Tema | Fiyat |
|---|---|
| Su Stadyumu | Ücretsiz |
| Neon | 150 |
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

| Yükseltme | 1. seviye | 2. | 3. | 4. | 5. | Toplam |
|---|---|---|---|---|---|---|
| Raket Hızı | 120 | 240 | 400 | 600 | 850 | 2.210 |
| Şut Gücü | 120 | 240 | 400 | 600 | 850 | 2.210 |
| Yetenek Süresi | 90 | 180 | 300 | 450 | 650 | 1.670 |

Altın kazanma yolları:

- **Her maçtan sonra** (maç süre bitene kadar oynanmalı; yarıda bırakılan maç ödül vermez):
  - Tek oyuncu: sonuç (galibiyet 35, beraberlik 20, yenilgi 10) × rakibin zorluk çarpanı (Su Ligi'nde ×1–1,23, son liglerde en çok ×2,65) + attığın her gol için 2 (en fazla 10 gol). Lig şampiyonluğunda bir kez 80 + 30 × lig sırası altın.
  - İki oyuncu: 15 + atılan her gol için 1 (en fazla 10).
  - Maç sonunda reklam izleyerek o maçın ödülü **2 katına** çıkarılabilir.
- **Hoş geldin hediyesi**: ilk maçın sonunda bir kez +100 altın. İlk galibiyetten sonra Neon'a çok az kalır; maç sonu ekranı sıradaki hedefe (en ucuz kilitli tema ya da daha ucuzsa sıradaki yükseltme seviyesi) ne kadar altın kaldığını gösterir, yetiyorsa mağazaya kısayol olur.
- **Günlük ödül**: her gün ilk açılışta kendiliğinden verilir ve art arda gelinen günlerde artar: 30, 40, 50, 60, 80, 100, 150 altın (7. günden sonra 150). Bir gün atlanırsa seri baştan başlar. Maç sonu ekranı yarınki ödülü hatırlatır. İlk gün hoş geldin hediyesi verildiği için günlük ödül ertesi gün başlar.
- **Günlük görevler**: menüde her gün yenilenen 3 görev (herkeste aynı; tarihten türetilir). Türler: N gol at, N maç kazan, N maç oyna, N kez yetenek kullan, belirli bir stadyumda kazan (açık stadyumlardan), gol yemeden kazan, son 15 saniyede gol at, bir yükseltme al (hepsi son seviyedeyse çıkmaz), N sert şut at (vuruştan sonra pak 1.500 birim/sn'yi geçerse; yalnızca tek oyunculu). Her görev 25–70 altın, üçü bitince +50 bonus. Tamamlanan görev başarım gibi bildirimle duyurulur; maç sonu ekranı kaç görevin bittiğini gösterir. Ayarlar `MISSION_TYPES` ve `MISSION_BONUS` içinde.
- **Raket görünümleri**: mağazanın **Görünümler** sekmesinde (Raket bölümü) oyuncunun raketi için 7 görünüm: Kırağı ve Zehir Yeşili (150), Ametist (200), Alev (300, alev dilleri), Altın (350, ışınsal yivler), Galaksi (400, yıldızlar), Gökkuşağı (500, renk çemberi). Alınan görünüm hemen takılır, sonra istenen seçilir. Rakibin raketi hep pembe kalır; vuruş kıvılcımları raketin rengini alır. Görünümler `SKINS` içinde.
- **Pak görünümleri**: aynı sekmenin Pak bölümünde. Varsayılan **Tema Pakı** her stadyumun kendi pakıdır (suda turuncu kauçuk, buzda siyah pak…); satın alınan görünüm onun yerine her stadyumda kullanılır (suda ve çamurda suya oturma halkasıyla): Kor ve Nane (150), Karbon (200), Futbol ve Karpuz (250), Plazma (350), Elmas (400). Desenli paklar (Futbol, Karpuz, Plazma) hızlarına göre döner; duvar ve gol kıvılcımları pakın rengini alır. Görünümler `PUCKS` içinde.
- **Başarımlar**: 26 başarım, her biri bir kez altın verir (20–400). Menüdeki **Başarımlar** düğmesi listeyi ilerleme çubuklarıyla açar (tamamlanmamışlar, bitmeye en yakın olan önce). Açılan başarım ekranın üstünde kısa bir bildirimle duyurulur; oyun akarken açılanlar rakip kalenin önünü kapatmasın diye ilk duraklamada (gol, geri sayım, maç sonu) gösterilir. Başarımlar ve istatistikler (`stats`, `ach`) ilerlemeyle birlikte kaydedilir (CrazyGames'te bulutta). Liste `js/game.js` içindeki `ACH` dizisinde:
  - İlk Gol, İlk Zafer; ilk ligini / 4 ligi / tüm ligleri kazan; toplam 25 / 100 gol; 10 / 50 maç
  - Maç içi: gol yemeden kazan, bir maçta 5 gol, 2 gol gerideyken kazan, son 3 saniyede gol, iki pak varken 2 gol, en yüksek hıza yakın şut
  - Yetenekleri 10 kez kullan, yeni bir raket ya da pak görünümü al, iki kişilik maç oyna, 3 farklı stadyumda oyna, tüm stadyumları aç, 3 / 7 gün üst üste gel
  - Toplam 100 sert şut; ilk yükseltmeyi al, bir yükseltmeyi son seviyeye çıkar, tüm yükseltmeleri son seviyeye çıkar
- **Reklam izleyerek**: menüde ve mağazada "Reklam izle" ile her reklam için +50 altın (altın yetmediğinde satın alma adımında da çıkar). Günde en fazla 10 ödüllü reklam izlenebilir; reklam sonuna kadar izlenmezse ödül verilmez. Reklam oynarken oyun sesi kısılır.

Fiyatlar ve ödüller `js/game.js` içindeki `THEME_INFO`, `PRODUCTS`, `UPGRADES`, `COIN`, `WELCOME_GIFT`, `DAILY`, `levelMult()` ve `matchReward()` ile ayarlanır.

> **Kendi sitendeki sürümde reklamlar şu an TEST MODUNDA** (CrazyGames sürümü gerçek CrazyGames reklamlarını kullanır): gerçek reklam yerine 5 saniyelik örnek bir gösterim oynatılır. Gerçek reklam için `Ads.showRewarded()` bir reklam altyapısına bağlanmalıdır — web için Google H5 Games Ads (Ad Placement API, ödüllü reklam), mobil uygulama için AdMob ödüllü reklam gibi. Gerçek sistemde ödül, reklam sağlayıcısının sunucu tarafı doğrulamasından (SSV) sonra bir sunucuda eklenmelidir; tarayıcıda (localStorage) tutulan bakiye, envanter ve açılan temalar kullanıcı tarafından değiştirilebilir.

## Temalar

Tek oyunculu modda stadyum kariyerdeki ligden gelir; iki oyunculu modda menüdeki **Tema** seçiminden, her iki modda Mağaza'nın Temalar sekmesinden değiştirilir. Kilitli stadyumlar kariyerde bir önceki ligin patronunu yenince bedava açılır ya da Mağaza'da altınla hemen alınabilir.

- **Neon**: parlayan çizgiler, neon raketler ve ışık izleri.
- **Su Stadyumu** (ücretsiz): masanın yerinde gerçek zamanlı simüle edilen bir havuz.
  - **Fizik**: su yüzeyi dalga denklemiyle hesaplanır; dalgalar yayılır, havuz duvarlarından yansır, viskozite ve sürtünmeyle söner.
  - **Etkileşim**: raketler ve paklar suyu hacimleriyle iter; önlerinde kabarma, arkalarında V biçimli iz ve dalga halkaları oluşur. Hızlı hareket köpük bırakır; çarpışmalar ve goller sıçrama ve halka dalgaları üretir.
  - **Görüntü (WebGL)**: tabana boyanmış saha çizgileri ve mozaik fayanslar dalgaların altında kırılarak görünür; yüzey eğriliğinden kostik ışık desenleri, Fresnel yansıması, projektör pırıltıları, nesnelerin tabana düşen gölgeleri ve köpük.
  - **Ses**: çarpışmalarda su sıçraması ve kabarcık sesleri, arka planda hafif havuz ambiyansı.
  - WebGL katmanı (havuz ve bataklık) ilk dokunuşta ya da tuşa basınca kurulur; o zamana kadar ve WebGL olmayan cihazlarda havuz durağan bir görselle gösterilir. Zayıf cihazlarda su, uyarlanabilir kaliteyle daha düşük çözünürlükte çizilir.
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

- **Tek oyuncu: Kariyer.** Her stadyum bir lig: Su → Neon → Buz → Kum → Lav → Bataklık → Uzay → Kristal. Her ligde 4 rakip ve bir patron vardır (ör. Su Ligi: Bubbles, Crab, Marlin, Tide, patron Kraken); rakiplerin simgesi, adı ve karakteri vardır: dengeli, savunmacı (sağlam savunma, zayıf şut), hızlı (çok hızlı ama dağınık), hileci (bant vuruşları), saldırgan (sert vuruş, karşı atak), patron (isabetli, yeteneklerini akıllıca kullanır). Zorluk ligden lige artar (`rivalDiff`, `rivalAI`). Rakipler sırayla açılır; galibiyet yıldız verir (kazan 1, 2+ farkla 2, gol yemeden 3). **Patronu yenen sonraki stadyumu bedava açar** ve şampiyonluk altını alır; stadyumu mağazadan erken alan oyuncu o ligi hemen oynayabilir. Menüdeki kariyer kartında lig okları ve 5 rakip düğmesi (yenilenler ve sıradaki seçilebilir, yıldızlar altında) bulunur; tek oyunculu modda stadyum ligden gelir, tema seçimi iki oyunculu modda görünür. Maç sonundaki ana düğme "Sıradaki: Rakip ▶", şampiyonlukta "Yeni lig ▶", yenilgide "Tekrar dene". Yapay zekâ pakın yolunu tahmin eder, bant vuruşu yapar ve karşı atağa geçer.
- **Stadyum fizikleri**: her stadyum farklı oynanır (her iki oyuncuyu eşit etkiler; `PHYS`, `Arena`):
  - Neon klasik hava yastığı; Su pakı hafifçe yavaşlatır.
  - Buz: sürtünme çok az, duvarlar daha sert sektirir.
  - Kum: sürtünme yüksek, duvarlar emer; pak çabuk yavaşlar.
  - Bataklık: raketler ağır (vuruş hızı sınırlı), yavaşlayan pak çamura yapışır.
  - Lav: birkaç saniyede bir masada kızaran bir halka belirir, 1 saniye sonra patlar ve içindeki pakı fırlatır.
  - Uzay: yatayda gezinen iki çekim kuyusu pakın yolunu büker (ızgara kuyularda derince çöker).
  - Kristal: orta çizgide iki kristal sütun; pak sekip nota çalar, raketler içinden geçemez.
  - Her stadyumda ilk iki maçta kuralı anlatan kısa bir ipucu çıkar.
- **İlk açılış**: menü yerine tam ekran "Oynamak için dokun" gösterilir; ekranın herhangi bir yerine dokunmak (ya da tıklamak, Enter/Boşluk) kariyerin ilk maçını (Su Ligi, Bubbles) başlatır. Sonraki açılışlarda menü açılır; **Oyna** düğmesi her ekran boyutunda ilk bakışta görünür (logo kısa ekranlarda küçülür, ayarlar düğmenin altındadır).
- **İki oyuncu**: aynı cihazda. Telefon/tablette iki kişi aynı anda dokunmatikle oynar (çoklu dokunma), bilgisayarda biri fare/ok tuşları, diğeri W A S D ile.
- **Görseller**: neon masa, hava delikleri, parıldayan raketler, hıza göre renk değiştiren pak izi, vuruş kıvılcımları, duvar dalgaları, gol patlaması, ekran sarsıntısı, konfeti ve menünün arkasında kendi kendine oynayan bir tanıtım maçı.
- **Skor paylaşımı**: maç sonunda sonuç X, WhatsApp, Telegram ve Facebook'ta paylaşılabilir ya da metin olarak kopyalanabilir. Oyun ayrıca 1080×1350 boyutunda neon bir skor kartı görseli üretir. Telefonda "Paylaş" düğmesi bu görseli sistemin paylaşım menüsüyle (Instagram, WhatsApp vb.) gönderir, bilgisayarda görsel indirilebilir.
- **Ses**: tüm efektler Web Audio ile anlık üretilir, ses dosyası yoktur. Sağ üstteki hoparlör düğmesi ses seviyesi panelini açar (kaydırıcı + sessize alma); ayar tarayıcıda saklanır. Dokunmatik cihazlarda titreşim geri bildirimi verir.
- **Müzik**: her temanın kendi arka plan parçası vardır ve o da Web Audio ile anlık üretilir: su için sakin bir chill parçası, neonda synthwave, buzda kristal çanlar, lavda ağır karanlık bir ritim, kumda hicaz makamında ud ve darbuka, uzayda geniş rüya tınıları, kristalde vuruşların çaldığı pentatonik notalara uyan yumuşak bir zemin, bataklıkta aksak bir blues. Maç sürerken davul ve arpej katmanları açılır; menüde, maç sonunda ve duraklatmada yalnızca yumuşak katmanlar çalar, ikinci pak girince ritim sıklaşır. Tema değişince parça yumuşak bir geçişle değişir. Ses panelinde müziğin ayrı bir açma/kapama düğmesi ve seviye kaydırıcısı vardır (`N` kısayolu); ana ses seviyesi ve sessiz modu müziği de kapsar. Sekme arka plana geçince müzik susar.
- **Performans**: açılışta WebGL kurulmaz (su ve çamur ilk dokunuşta başlar), böylece ilk kare hızlanır. Kareler yetişmezse çözünürlük kademeli düşer, en sonda **sade mod** açılır (daha az parçacık ve efekt, suyun çözünürlüğü düşük). Düşük donanımlı cihazlar (≤ 2 GB bellek ya da dokunmatik ekranlı ≤ 2 çekirdek) ve önceki bir maçta sade moda geçmiş cihazlar oyuna baştan sade modda ve en çok 1,25 piksel yoğunluğuyla başlar (karar yalnızca o cihazda saklanır); açılıştaki tanıtım maçı 25 kare/sn'nin altında kalırsa o oturum sade moda geçer. İlk kare süresi konsola yazılır (`__airHockey.perf`).
- **Dil**: Türkçe ve İngilizce (English). Menüdeki **Dil · Language** seçiminden değiştirilir ve cihazda saklanır; ilk açılışta tarayıcının diline göre seçilir (Türkçe tarayıcıda Türkçe, diğerlerinde İngilizce). Menüler, oyun içi yazılar, mağaza, paylaşım metinleri ve skor kartı görseli seçili dilde gösterilir. Metinler `js/game.js` içindeki `STR` sözlüğünde, HTML'deki sabit metinler `data-i18n` öznitelikleriyle tanımlıdır.
- **Yatay ekran**: pencere ya da ekran yataysa (bilgisayar, yatay tutulan telefon ya da tablet) masa yan döner: oyuncu solda, rakip sağda, masa 16:9 pencereyi doldurur. Yetenek düğmeleri masanın yanlarında (Mavi solda, Pembe sağda), skor ve süre üstte durur. Fizik ve yapay zekâ aynıdır; yalnızca görüntü ve girdi döner, yazılar ve raket/pak parlamaları dik kalır. Ekran dikse masa da diktir.
- **Mobil uyumlu**: her ekrana ölçeklenir, Retina ekranlarda net görünür, çentikli ekranlara uyum sağlar, ana ekrana eklenebilir (PWA) ve çevrimdışı çalışır.

## Kontroller

| | Bilgisayar | Telefon / Tablet |
|---|---|---|
| Mavi (alt; yatayda sol) | Fare veya ok tuşları | Kendi yarında (alt / sol) parmakla sürükle |
| Pembe (üst; yatayda sağ, 2 oyunculu) | W A S D | Kendi yarında (üst / sağ) parmakla sürükle |
| Duraklat | `P` (pencere odağı kaçınca kendiliğinden) | ⏸ düğmesi |
| Ses aç/kapa | `M` | 🔊 düğmesi → sessiz |
| Müzik aç/kapa | `N` | 🔊 düğmesi → müzik |
| Ses seviyesi | `−` / `+` veya 🔊 düğmesi | 🔊 düğmesi → kaydırıcı |
| Yetenekler (Mavi) | `1` Dev Kale, `2` Kale Kilidi (veya düğmeler) | Alttaki (yatayda soldaki) düğmeler |
| Mağaza | Menüde veya maç sonunda "Mağaza" | Aynı |
| Yetenekler (Pembe, 2 oyunculu) | `Q` Dev Kale, `E` Kale Kilidi | Üstteki (yatayda sağdaki) düğmeler |

- **Escape** duraklatmaya bağlı değildir (tarayıcıda tam ekrandan çıkarır); yalnızca açık paneli (ses, mağaza, önizleme) kapatır.
- **Klavye düzeni**: hareket ve yetenek tuşları fiziksel konumla okunur; AZERTY klavyede W A S D yerine aynı yerdeki Z Q S D tuşları çalışır ve menüdeki ipucu ile ilk maç rehberi tuşları oyuncunun klavyesindeki adlarıyla gösterir (tarayıcı izin veriyorsa). `P`, `M`, `N` kısayolları ise üzerinde o harf yazan tuşla çalışır.
- **İlk maç rehberi**: her modda ilk maçta oyuncunun raketinin yanında kontroller görsel olarak gösterilir (dokunmatikte sürükleyen el, bilgisayarda fare + ok tuşları; iki oyunculuda Pembe için W A S D). Raket hareket edince ya da 8 saniye sonra kaybolur, oyunu engellemez. Yetenek ipucu ikinci maçta bir kez çıkar.
- Ok tuşları ve W A S D ekrandaki yöne göre çalışır: yatay masada → (ya da D) rakibe doğru götürür.
- İki oyunculu modda üstteki düğmeler ve rehber yalnızca dikey masada ve dokunmatik cihazlarda (karşılıklı oturulduğu için) ters çevrilir; bilgisayarda iki oyuncu aynı klavyenin başında olduğundan, yatay masada da yan yana bakıldığından düz durur.

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
# çıktı: dist/elemental-puck-arena-crazygames.zip (CrazyGames geliştirici portalına yüklenecek dosya)
```

Bu sürümde `index.html`'e CrazyGames HTML5 SDK'sı (v3) eklenir, PWA dosyaları (manifest, `sw.js`) çıkarılır ve maç sonundaki **sosyal paylaşım düğmeleri ve dış bağlantılar sayfadan tamamen çıkarılır**; telefonun paylaşım menüsü de açılmaz (CrazyGames, oyunun başka bir oynanabilir web sürümüne götüren bağlantılara izin vermez). Skor kartı görseli kalır; üzerinde bağlantı yoktur. Kendi sitendeki sürümde paylaşım düğmeleri durur. Oyun açılırken SDK başlatılır ve **ilerleme SDK'nın veri modülüne kaydedilir** (altın, açılan temalar, envanter, ayarlar). CrazyGames'in iframe'inde localStorage'a güvenilemediği için bu gereklidir; veri modülü, oyuncu CrazyGames hesabıyla girdiyse ilerlemeyi cihazlar arasında eşitler. Portaldaki gönderim formunda ilerleme kaydı için **"CrazyGames SDK veri modülü"** seçeneği işaretlenmelidir.

**Ödüllü reklamlar** bu sürümde CrazyGames SDK'sının reklamıyla (`SDK.ad.requestAd('rewarded')`) gösterilir; örnek "TEST MODU" ekranı hiç çıkmaz. Ödül yalnızca reklam sonuna kadar izlenince (`adFinished`) verilir. Reklam oynarken oyun durur, ses kısılır ve girişler engellenir. Reklam bulunamazsa ya da reklam engelleyici açıksa oyuncuya bildirilir, ödül verilmez.

Oyuncu fiilen oynarken (maç, geri sayım, gol kutlaması) SDK'ya `gameplayStart`, oyun durduğunda (duraklatma, maç içi mağaza, maç sonu, ana menü, sekme gizlenince) `gameplayStop` bildirilir; bildirim yalnızca durum değiştiğinde gönderilir.

CrazyGames'in **ses kapatma ayarı** (SDK `game.settings.muteAudio`) desteklenir: açılışta okunur ve değişiklikleri dinlenir; platform sesi kapattığında oyun sessizdir ve oyun içi ses düğmesi, kaydırıcı ya da kısayollar sesi geri açamaz.

SDK yüklenemezse, başlatılamazsa ya da 6 saniye içinde yanıt vermezse oyun yine açılır ve yerel kayıtla (localStorage) çalışır. Kendi sitende yayınlanan normal sürüm SDK'yı yüklemez ve localStorage kullanır.

## Tanıtım (showcase) sürümü

Tanıtım videosu çekmek için:

```bash
./tools/build-showcase.sh
# çıktı: dist/elemental-puck-arena-showcase.zip
```

Bu sürümde tüm temalar açıktır, tüm yükseltmeler son seviyededir, oyun 9.999 altın ve 99'ar Dev Kale / Kale Kilidi hakkıyla başlar (her açılışta yenilenir), reklam düğmeleri gizlidir ve görüntü kalitesi performansa göre otomatik düşürülmez. Kayıtları gerçek oyundan ayrı tutulur (`aquash_` önekiyle), yani aynı tarayıcıdaki gerçek ilerlemeye dokunmaz. Yayına ya da CrazyGames'e yüklenmek için değildir.

### Önizleme videoları

CrazyGames için iki sessiz önizleme videosu (yatay 1920×1080, dikey 1080×1620, ~17 sn) tanıtım sürümünden kare kare, sanal zamanla çekilir; çekim yavaş olsa da video akıcıdır. Yatay video doğrudan yatay masayla çekilir. Sıra: logo ekranı → Su'da sert şut → Lav halkasının fırlattığı gol → Kristal sütundan sekip gol → Uzay'da çekim kuyusunda kıvrılan gol → Kum'da ikinci pak → Buz → menüdeki kariyer kartında ligler arasında geçiş. Anlar betikte tetiklenir (`tools/preview-video/record.js`, `CLIPS`).

```bash
./tools/build-showcase.sh && (cd dist/showcase && python3 -m http.server 8772 &)
cd tools/preview-video && npm pack @fontsource/exo-2 && mkdir -p font && tar xzf fontsource-exo-2-*.tgz -C font
node record.js portrait && node record.js landscape   # Playwright gerekir; kareler dist/preview-video/<yön> altına
python3 compose.py ../../dist/preview-video ffmpeg     # H.264 destekli ffmpeg gerekir
```

### Kapak görselleri

`node tools/cover/cover.js` (tanıtım sürümü 8772'de sunulurken, yazı tipi yukarıdaki gibi açılmışken) dört stadyumdan (Su, Lav, Kristal, Uzay) oyun anı çeker, çapraz dilimler hâlinde dizer ve ortaya logoyu koyar: `dist/cover/elemental-puck-arena-cover-1920x1080.png`, `-800x1200.png`, `-800x800.png`. Boyutları yüklemeden önce CrazyGames portalındaki güncel isteklerle karşılaştırın.

## Dosya yapısı

```
index.html            Sayfa ve menüler
css/style.css         Arayüz, menüler ve arka plan
js/game.js            Fizik, yapay zekâ, çizim, ses ve kontroller
manifest.webmanifest  PWA tanımı
sw.js                 Çevrimdışı önbellek
tools/                Sürümleri üreten betikler (CrazyGames, tanıtım, deneme sayfası), tanıtım videosu ve kapak araçları, testler
icons/                Uygulama ikonları
```
