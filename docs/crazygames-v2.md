# CrazyGames v2 gönderimi: Elemental Puck Arena

Oyun Basic Launch'ta Full Launch'a geçemedi (`docs/v2-plan.md`, "Durum"). Bu belge v2'yi yeniden göndermek için gerekenleri toplar.

**Doğrulanamayanlar.** CrazyGames dokümantasyonu (docs.crazygames.com) bu çalışma ortamından açılamadı (ağ engeli). Arama sonuçlarına göre Basic Launch'ı geçemeyen oyun, anlamlı iyileştirmelerden sonra yeniden gönderilebiliyor. Şunlar göndermeden önce geliştirici portalında ya da dokümantasyonda kontrol edilmeli:
- v2 mevcut oyunun **güncellemesi** olarak mı, yoksa **yeni oyun** olarak mı yüklenmeli?
- Ad değişikliği (Aqua Hockey → Elemental Puck Arena) portaldan yapılabiliyor mu, destek ekibine mi yazılmalı?
- Kapak görsellerinin boyutları ve önizleme videosunun süre ve boyut sınırları.

## Yüklenecek dosyalar

Hepsi depodaki betiklerle üretilir; `dist/` depoya girmez.

| Dosya | Üretim |
|---|---|
| `dist/elemental-puck-arena-crazygames.zip` | `./tools/build-crazygames.sh` |
| `dist/cover/elemental-puck-arena-cover-1920x1080.png`, `-800x1200.png`, `-800x800.png` | `node tools/cover/cover.js` (README, "Kapak görselleri") |
| `dist/preview-video/elemental-puck-arena-preview-1920x1080.mp4`, `-1080x1620.mp4` | `tools/preview-video` (README, "Önizleme videoları") |

## Göndermeden önce

1. `./tools/build-crazygames.sh` ile zip'i üret.
2. CrazyGames testlerini çalıştır: `cggp.js`, `cgsave.js`, `cgmute.js`, `cgad.js`. Bunlar `mock-sdk.js` ile 127.0.0.1:8771'den sunulan kopyada çalışır (`docs/v2-plan.md`, "Test").
3. Zip'i portalın önizleme aracında aç. Kontrol edilecekler:
   - yükleme;
   - yatay pencerede masanın yan dönmesi;
   - ödüllü reklam;
   - bulut kaydı: eski oyuncuların altını, kariyeri ve görünümleri yerinde mi (`neonah_` öneki değişmedi).
4. Ad, açıklama, kapaklar ve videolar.

## Mağaza metni (İngilizce)

**Name:** Elemental Puck Arena

**Short description:** Air hockey across eight elemental stadiums: water, ice, sand, lava, swamp, space, crystal and neon, each with its own physics.

**Description:**
Fight your way through a career of 8 leagues: 4 rivals and a boss in every stadium. Each one plays differently:
- Ice is slippery.
- Sand slows the puck.
- Mud makes it stick.
- Lava rings erupt and launch the puck.
- Gravity wells bend its path in space.
- Crystal pillars ring like bells.

Earn gold, upgrade your mallet speed, shot power and skill duration, and use Big Goal and Goal Lock at the right moment. Play solo or with a friend on the same device. Works in portrait and landscape.

**Controls:**
- Move the mouse or drag your finger to move your mallet; the arrow keys work too.
- Keys 1 and 2: skills.
- P: pause.
- Two players on one device: the second player uses W A S D, plus Q and E for skills.

## v2'de ne değişti (CrazyGames'e not ya da güncelleme açıklaması)

- New name and look: Aqua Hockey is now Elemental Puck Arena.
- Career mode: 8 leagues, 40 rivals with their own play styles, stars and boss fights.
- Stadium physics: every stadium plays differently.
- Landscape table: on desktop and landscape phones the table turns sideways and fills the screen (79% of a 1080p window, up from 26%).
- Permanent upgrades bought with gold (mallet speed, shot power, skill duration), plus new achievements and daily missions.
- Faster start on phones:
  - WebGL water starts on the first touch;
  - low-end devices start in lite mode;
  - first frame about 26% faster on a throttled phone profile.

## Basic Launch ölçütleriyle ilişkisi

| Ölçüt (v1 puanı) | v2'de hedefleyen değişiklik |
|---|---|
| Ortalama oyun süresi (masaüstü 1/5, mobil 2/5) | Kariyer, stadyum fizikleri, yükseltmeler (uzun vadeli altın hedefi), sert şut görevleri |
| Ertesi gün dönüş (2/5, 2/5) | Yarım kalan lig ve yükseltme hedefleri; maç sonu ekranı sıradaki hedefe kalan altını gösterir; günlük görevler ve ödül |
| Oyuna başlama (masaüstü 3/5, mobil 3/5) | Yatay masa; mobilde daha hızlı ilk kare, düşük donanımda sade mod |
| Tıklama oranı (%1,6) | Yeni ad, kapak ve videolar |
