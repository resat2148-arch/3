# Aqua Hockey v2 planı

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

### Aşama 2: Yatay masa (masaüstü + yatay telefon)
- Ekran yataysa masa yan dönsün: oyuncu solda, rakip sağda; 16:9 pencere dolsun.
- Önerilen yol: mantıksal fizik ve yapay zekâ aynı kalsın. Yalnızca çizim ve girdi dönüşümü 90° döndürülsün (tuvalde `rotate`, işaretçi koordinatında ters dönüşüm).
- Etkilenen yerler:
  - Masa çizimleri: 8 tema, `buildTable` ve temaların kendi katmanları.
  - WebGL su/çamur.
  - Arayüz: skor göstergesi, yetenek düğmeleri, ilk maç rehberi, iki oyunculu düzen.
  - Pak ve raket parlamaları, metin sprite'ları (döndürülmemeli, okunur kalmalı).
- Telefon yatay tutulduğunda "telefonunu dik tut" uyarısı kaldırılsın.
- Ölçüt: 960×540, 1280×720, 1920×1080 ve 844×390'da masa ekranın çoğunu kaplamalı; tüm testler geçmeli.

### Aşama 3: Yükseltmeler ve mobil performans
- Altınla alınan kalıcı yükseltmeler (her biri 4–5 seviye):
  - Raket hızı (en yüksek vuruş hızı).
  - Şut gücü.
  - Yetenek süresi.
  - Mağazada yeni bir "Yükseltmeler" bölümü olacak. Fiyatlar artan sırada; kariyer zorluğuyla dengelenmeli (rakip zorluğu gerekirse hafifçe artırılsın).
- Mobil performans:
  - WebGL su/çamur ilk dokunuştan sonra başlasın (açılışta 2B görüntüyle).
  - Düşük donanımda (yavaş kare ya da az bellek) sade mod: daha az parçacık, düşük çözünürlüklü katmanlar.
  - Yükleme ve ilk kare süresi ölçülsün.
- Yeni başarımlar ve görevler: "bir yükseltmeyi son seviyeye çıkar" gibi.

### Aşama 4: Yeni ad ve kimlik
- Ad önerileri: Elemental Puck Arena, Splash Puck, Tidal Air Hockey (karar kullanıcıda).
- Değişecek yerler:
  - `index.html` başlığı, logo (CSS), simgeler (`icons/`).
  - `manifest.webmanifest`, paylaşım metinleri ve skor kartı (`drawCard`).
  - CrazyGames kapak görselleri ve tanıtım videoları (`tools/preview-video`).
- Kayıt anahtarı öneki (`neonah_`) değişmemeli; oyuncuların kaydı kaybolur.

### Aşama 5: Yayın
- Yeni tanıtım videoları (yeni kimlik, kariyer ve stadyum mekanikleri).
- Kapak görseli: tıklama oranı %1,6; çekici bir kapak gösterimden oyuna geçişi artırır.
- CrazyGames'e v2 olarak gönderim. Yeniden gönderim kuralları CrazyGames dokümantasyonunda kontrol edilmeli.

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
| `cg*.js` | CrazyGames: bildirimler, bulut kaydı, ses kapatma, reklam |

- `cg*.js` betikleri `mock-sdk.js` ile 127.0.0.1:8771'den sunulan CrazyGames derlemesini kullanır.
- O derleme şöyle hazırlanır: `dist/crazygames` kopyalanır ve SDK betiği `mock-sdk.js` ile değiştirilir.
- Bazı betiklerde geçici klasör yolları var; gerekirse düzeltilmeli.

## Deneme sayfaları

Güncellerken aynı adresler kullanılmalı:
- Oyun: https://claude.ai/artifact/2bCRQbBUxU5qDV6EycYogz
- Tanıtım (her şey açık): https://claude.ai/artifact/CmFzzh2BXabyGc5CMDh8Ug
