# Neon Air Hockey

Tarayıcıda ve telefonda çalışan, neon temalı bir air hockey oyunu. Kurulum veya derleme gerektirmez: saf HTML, CSS ve JavaScript (Canvas 2D + Web Audio).

## Kurallar

- Maç **60 saniye** sürer. Süre yalnızca oyun akarken işler (gol kutlaması ve geri sayımda durur).
- **45. saniyede ikinci top** ortadan oyuna girer. Bu son 15 saniyede oyun gollerde durmaz: gol olan top kısa süre sonra yiyen tarafın yarısından geri gelir.
- Süre bitince çok gol atan kazanır; eşitlikte maç berabere biter.

## Skiller

Her oyuncunun iki skili vardır; kullanıldıktan sonra 16 saniyede yeniden dolar.

| Skill | Etkisi | Süre |
|---|---|---|
| **Dev Kale** | Rakibin kalesi büyür (184 → 304). Bu kaleye gol atılınca etki biter. | 5 sn |
| **Kale Kilidi** | Kendi kalen küçülür (184 → 92). | 5 sn |

İkisi aynı kaleye denk gelirse etkiler birbirini kısmen dengeler. Yapay zekâ da skilleri kullanır: kalesine hızlı top gelirken kilitler, şut çektikten sonra rakip kaleyi büyütür (Zor seviyede en isabetli).

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
