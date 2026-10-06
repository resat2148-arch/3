# Elemental Puck Arena v2 planı (eski adı Aqua Hockey)

Dal: `claude/air-hockey-game-648a7g`. Oyunun özellikleri README'de; bu belge v2'nin neden ve nasıl yapıldığını anlatır.

## Durum: CrazyGames Basic Launch sonucu

Oyun Full Launch'a geçemedi ("did not reach the performance benchmarks"). Kategori: Arcade.

| Ölçüt | Masaüstü | Puan | Mobil | Puan | Bir puan artış için |
|---|---|---|---|---|---|
| Ortalama oyun süresi | 3:21 | 1/5 | 3:53 | 2/5 | masaüstü 3:44, mobil 5:00 |
| Ertesi gün dönüş (D1) | %1,31 | 2/5 | %1,99 | 2/5 | masaüstü %3,23, mobil %3,40 |
| Oyuna başlama oranı | %64,7 | 3/5 | %44,2 | 3/5 | masaüstü %69,3 |
| **Toplam** | | **6/15** | | **7/15** | geçmek için büyük olasılıkla 9/15 |

Panelden ek veriler: 1.941 oyun, 1.799 oyuncu, 164 bin gösterim, tıklama oranı (CTR) %1,6, D7 %1,52, geri dönen oyuncu %3, puan 7,9 (29 oy), yükleme 2,3 sn, yüklemede çökme %0,37, **oyun içinde çökme %2,26**.

Not: Günlük görevler, başarımlar ve görünümler değerlendirme döneminin sonuna doğru eklendi; ölçüme ya hiç girmediler ya da çok az girdiler.

## Nedenler

1. **Oyun döngüsü kısa ve tekrarlı.** 60 saniyelik maçlar; stadyumlar görsel olarak farklıydı ama aynı oynanıyordu; altınla alınan her şey kozmetikti.
2. **Yarın için yarım kalmış bir hedef yoktu.** Bu yüzden ertesi gün dönüş düşük.
3. **Masaüstünde dikey masa 16:9 pencerede dar bir şerit.** 1080p'de 583×940 piksel, iki yan boş.
4. **Mobilde oyuncuların yarıdan fazlası maça başlamıyor.** Olası nedenler: düşük donanımda WebGL su efekti, yatay tutulan telefonda masanın küçük görünmesi.
5. **Tür kalabalık, ad başka bir ürünle çakışıyor.** "Aqua Hockey", Sportsstuff'ın havuz air hockey ürününün adı.

## Aşamalar

### Aşama 1: Benzersiz oynanış ve kariyer (bitti)
- Stadyumlara özel fizik (`PHYS`, `Arena`):
  - Buz kaygan; kum sürtünmeli; çamurda raketler ağır ve pak yapışır.
  - Lavda patlayan halkalar; uzayda çekim kuyuları; kristalde sütunlar.
- Kariyer: 8 lig × (4 rakip + patron). Rakiplerin adı, simgesi ve karakteri var. Yıldızlar 1–3. Patron yenilince sonraki stadyum açılır ve şampiyonluk altını verilir (`LEAGUES`, `RIVALS`, `rivalAI`, `career`).
- Çökme önlemleri:
  - Atılan tuvaller serbest bırakılıyor (iOS tuval bellek sınırı).
  - Kare döngüsü bir hatada durmuyor.
  - Nedeni doğrulanamadı; Safari'de test edilemedi.

### Aşama 2: Yatay masa (bitti)
- Ekran (pencere) yataysa masa saat yönünde 90° döner: oyuncu solda, rakip sağda; 16:9 pencereyi doldurur. Dikey ekranda her şey eskisi gibi.
- Yol: mantıksal fizik ve yapay zekâ aynı kaldı. İki tuvali (2B + WebGL su/çamur) taşıyan `.table` kutusu CSS ile döner (`body.landscape`); böylece 8 temanın katmanları, `buildTable` ve WebGL hiç değişmedi.
  - Girdi: `toField` işaretçiyi ters dönüştürür; ok tuşları ve W A S D ekrandaki yöne göre (`applyKeyboard`).
  - Dik kalanlar: raket ve pak görselleri bir kez -90° döndürülür (`upright`, parlamalar sol üstte kalır); tuvaldeki yazılar (gol/geri sayım, yetenek etiketleri ve yükselen yazılar) -90° çizilir. İki oyunculu yatay masada yazılar ters çevrilmez.
  - Arayüz: skor göstergesi üstte (solda Sen, sağda rakip); yetenek düğmeleri masanın yanlarında dikey (Mavi solda, Pembe sağda); ilk maç rehberi raketlerin yanında; alçak ekranlarda (≤500 px) üst boşluk daraltıldı. "Soldaki düğmeler" / "sol yarı, sağ yarı" ipuçları eklendi.
  - "Telefonunu dik tut" uyarısı kaldırıldı.
- Ölçüm (`tools/tests/land.js`, masanın ekranda kapladığı alan): 960×540 %68, 1280×720 %73, 1920×1080 %79, 844×390 %57 (dikeyde %49 olurdu), 1024×768 %55; arayüzle çakışma yok. Diğer tüm testler değişmeden geçiyor.
- Bilinen: tuvalin gölgesi masa ile birlikte döndüğü için yatayda sola düşer (temaların `box-shadow` değerleri).

### Aşama 3: Yükseltmeler ve mobil performans (bitti)
- Yükseltmeler (`UPGRADES`, mağazanın yeni **Yükseltmeler** sekmesi; 4 sekme 2 × 2 düzende). Her biri 5 seviye, kalıcı, kayıtta `wallet.upg`. Yalnızca tek oyunculu maçta oyuncunun raketine işler (`mallets[0].up`); iki oyunculu mod eşit kalır.
  - Raket Hızı: seviye başına +%5 en yüksek vuruş hızı. Son vuran raketin pak hız sınırı (`p.capK`), raketin en yüksek hızı ve klavye hızı artar. Fiyatlar 120, 240, 400, 600, 850.
  - Şut Gücü: seviye başına şutlar +%6. Raketin pak yönündeki hızından gelen itiş artar; duran pakı durdurmak ya da karşılamak değişmez. Fiyatlar 120, 240, 400, 600, 850.
  - Yetenek Süresi: seviye başına +0,6 sn (5 → 8 sn). Fiyatlar 90, 180, 300, 450, 650.
  - Tümü 6.090 altın: uzun vadeli hedef. Maç sonu ekranındaki hedef, kilitli temadan ucuzsa sıradaki yükseltmeyi gösterir.
  - Ölçüm (`tools/tests/upg.js`): duran paka 480 birim/sn'lik vuruş 874 → 1.137 birim/sn (+%30); en yüksek pak hızı 2.300 → 2.875.
- Denge (`tools/tests/balance.js`: oyuncunun raketini rakiple aynı seviyedeki yapay zekâ sürer, ayar başına 60 maç; sonuçlarda ± 6 puan gürültü var):
  - Tüm yükseltmeler son seviyedeyken, eşit seviyedeki rakibe karşı kazanma: Lig 1'de %47 → %53, Lig 5'te %43 → %47, Lig 8 patronunda %32 → %47. Maç başına yaklaşık +0,5 gol.
  - Bu yüzden rakip zorluğu hafifçe artırıldı: lig başına 1,4 yerine 1,5 seviye (`rivalDiff`; Lig 1 aynı, Lig 5'te +0,4, Lig 8'de +0,7). Seviye eğrisine 14. seviye çapası eklendi; Kristal patronu 12,3 yerine 13. Ödül çarpanı (`levelMult`, en çok ×2,65) aynı.
  - Eski eğrideki oyuncu yeni rakiplere karşı: yükseltmesiz Lig 5'te %30, Lig 8'de %35; tüm yükseltmelerle %38 ve %43. Yani yükseltmeler artışı kabaca karşılıyor.
- Mobil performans:
  - Su/çamur WebGL'i ilk dokunuşta (`pointerdown`, `touchstart`, `keydown`) kurulur. O zamana kadar masa suyun 2B taban görseliyle çizilir (WebGL olmayan cihazlardaki yol); simülasyon da çalışmaz. Tanıtım sürümünde baştan açık.
  - Sade mod (`quality.lite`: daha az parçacık ve efekt, su ¾ çözünürlükte) ve en çok 1,25 piksel yoğunluğu şu durumlarda baştan açılır:
    - düşük donanım (`navigator.deviceMemory` ≤ 2 ya da dokunmatik ekranda ≤ 2 çekirdek);
    - açılıştaki tanıtım maçının ilk 120 karesinin ortalaması 40 ms'yi geçerse (yalnızca o oturum; açılışta başka şeyler de yükleniyor olabilir);
    - maçta kareler yetişmezse (eskisi gibi); bu karar cihazda saklanır ve sonraki açılışlar baştan sade modda başlar (`neonah_perf`, buluta gitmez).
  - Ölçüm: `__airHockey.perf` (betik başlangıcı, ilk kare, su kurulumu) ve konsolda ilk kare satırı. `tools/tests/perf.js`: telefon görünümü, işlemci 4 kat yavaş, 5 açılışın ortancası, Google Fonts istekleri kesik.

    | | Aşama 2 | Aşama 3 |
    |---|---|---|
    | İlk kare | 844 ms | 625 ms |
    | DOMContentLoaded / load | 1.708 ms | 754 ms |
    | Düşük bellekli cihazda ilk kare | 792 ms (tam kalite) | 569 ms (sade mod, 1,25 yoğunluk) |
    | Su kurulumu (ilk dokunuşta) | açılışta | 161–174 ms |
- Yeni başarımlar (26): Top Güllesi (toplam 100 sert şut), Antrenman (ilk yükseltme), Son Seviye (bir yükseltmeyi son seviyeye çıkar), Tam Donanım (hepsi son seviye).
- Yeni günlük görevler: "Bir yükseltme satın al" (hepsi son seviyedeyse çıkmaz) ve "N sert şut at" (5/10/15). Sert şut: oyuncunun vuruşundan sonra pak 1.500 birim/sn'yi geçerse; yalnızca tek oyunculu modda sayılır.
- Ayrıca düzeltildi: mağazadaki satın alma onayı açıkken Görünümler sekmesinin listesi gizlenmiyordu.

### Aşama 4: Yeni ad ve kimlik (bitti)
- Ad: **Elemental Puck Arena** (kullanıcının seçimi). Adaylar web'de arandı: bu adla bir oyun çıkmadı; yakın olanlar itch.io'da "Element Air Hockey" prototipi ve GitHub'da "Puck Arena". Kısa ad (ana ekran simgesi): **Puck Arena**.
- Değişenler:
  - `index.html`: başlık, açıklama, `apple-mobile-web-app-title`, menü ve ilk açılış logosu (ELEMENTAL / PUCK ARENA).
  - Logo (CSS): stadyumların renkleriyle yatay geçiş (su mavisi, buz, kum sarısı, lav turuncusu, kristal pembe-moru); parlama animasyonu `logo-shine` aynı.
  - Simgeler: `icons/icon.svg` aynı renk geçişinde saha, mavi raket, koyu pak; PNG'ler (192, 512) SVG'den Chromium ile üretildi.
  - `manifest.webmanifest`, service worker önbellek adı (`elemental-puck-arena-v33`).
  - Paylaşım metinleri (`sh.*`, `#ElementalPuckArena`), paylaşım başlığı ve kart dosya adı, skor kartı logosu (`drawCard`), `meta.desc`, konsol iletileri.
  - Derleme çıktıları: `dist/elemental-puck-arena-crazygames.zip`, `-showcase.zip`, `dist/artifact/elemental-puck-arena*.html`, tanıtım videosu dosya adları (`tools/preview-video/compose.py`).
- Değişmeyenler: kayıt öneki `neonah_` (tanıtım sürümünde `aquash_`), cihazdaki sade mod kaydı `neonah_perf`, "Su Stadyumu" ve diğer stadyum adları, menünün su altı arka planı (ilk lig Su).
- Kapak görselleri ve yeni tanıtım videoları Aşama 5'te.

### Aşama 5: Yayın (hazır; gönderim kullanıcıda)
- Tanıtım videoları (`tools/preview-video`): yeni sıra kimlik → stadyum mekanikleri → kariyer. Klipler: logo ekranı, Su'da sert şut, Lav halkasının fırlattığı gol, Kristal sütundan sekip gol, Uzay'da çekim kuyusu golü, Kum'da ikinci pak, Buz, kariyer kartında ligler arası geçiş.
  - Yatay video artık doğrudan yatay masayla çekiliyor (eskiden dikey videonun iki yanı bulanık dolguydu).
  - Çıktılar: 1920×1080 ve 1080×1620, 16,7 sn, H.264, sessiz, ~19–21 MB.
  - Düzeltilen hata: kariyer (Aşama 1) geldiğinden beri tek oyunculu maçın stadyumu ligden geldiği için eski betik her klibi Su Stadyumu'nda çekiyordu. Artık her klibin ligi seçiliyor.
  - Kariyer rakiplerinin kendi yapay zekâ ayarı olduğundan, yetenek istenmeyen kliplerde rakibin yetenekleri de kapatılıyor.
- Kapak görselleri (`tools/cover/cover.js`): dört stadyumdan (Su, Lav, Kristal, Uzay) oyun anı, çapraz dilimler, ortada logo. Boyutlar 1920×1080, 800×1200, 800×800.
- CrazyGames gönderimi: adımlar ve kontrol listesi `docs/crazygames-v2.md` içinde. CrazyGames dokümantasyonu bu ortamdan açılamadı (ağ engeli). Arama sonuçlarına göre Basic Launch'ı geçemeyen oyun anlamlı iyileştirmelerden sonra yeniden gönderilebiliyor. Kesin kurallar portalda doğrulanmalı.

## Test

Betikler `tools/tests/` altında (Playwright; `NODE_PATH=$(npm root -g) node tools/tests/<ad>.js`). Oyun `python3 -m http.server 8765` ile 127.0.0.1:8765'ten sunulur.

| Betik | Ne test eder |
|---|---|
| `ux.js` | İlk açılış, Oyna düğmesinin ekrandaki yeri, maç sonu, günlük ödül |
| `career.js` | Kariyer akışı, yıldızlar, şampiyonluk, sonraki lig |
| `ach.js` | Başarımlar ve kayıt |
| `mi.js` | Günlük görevler, raket görünümü |
| `pk.js` | Pak görünümleri |
| `guide.js` | İlk maç rehberi, P/Escape, AZERTY, odak kaybında duraklatma |
| `arena.js` | Stadyum fizikleri (yapay zekâya karşı yapay zekâ ölçümü; `dist/showcase` gerekir) |
| `stress.js` | Çökme avı: aşırı boyutlar, düşük kalite, tüm temalar |
| `corner.js` | Yapay zekânın köşedeki pakı çıkarması |
| `land.js` | Yatay masa: kaplanan alan, arayüz çakışması, işaretçi ve ok tuşu dönüşümü (960×540, 1280×720, 1920×1080, 844×390, 390×844, 1024×768) |
| `upg.js` | Yükseltmeler: satın alma, kayıt, yetenek süresi, şut hızı, iki oyunculuda etkisizlik, tanıtım sürümü |
| `balance.js` | Yükseltme dengesi: yükseltmesiz / son seviye kazanma oranı (yavaş; `node tools/tests/balance.js 60 4.2,7.4`) |
| `perf.js` | Açılış: ilk kare, DOMContentLoaded, su kurulumu; düşük bellekte sade mod (birden çok adres karşılaştırılabilir) |
| `cg*.js` | CrazyGames: bildirimler, bulut kaydı, ses kapatma, reklam |

- `cg*.js` betikleri `mock-sdk.js` ile 127.0.0.1:8771'den sunulan CrazyGames derlemesini kullanır.
- O derleme şöyle hazırlanır: `dist/crazygames` kopyalanır ve SDK betiği `mock-sdk.js` ile değiştirilir.
- Bazı betiklerde geçici klasör yolları var; gerekirse düzeltilmeli.
- `arena.js` eşit seviyedeki iki yapay zekâyla her stadyumda dakikada 0 gol ölçüyor (birbirlerini kilitliyorlar; Aşama 2'den önce de böyleydi). Sürtünme/hız karşılaştırması için kullanılabilir, gol sayısı için değil.

## Deneme sayfaları

Sayfalar `tools/build-artifact.sh` ile üretilir (`dist/artifact/`: CSS ve JS gömülü tek HTML). Güncellerken aynı adresler kullanılmalı:
- Oyun: https://claude.ai/artifact/2bCRQbBUxU5qDV6EycYogz
- Tanıtım (her şey açık): https://claude.ai/artifact/CmFzzh2BXabyGc5CMDh8Ug
