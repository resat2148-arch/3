/* Aqua Hockey — bağımlılıksız, tek dosyalık oyun motoru. */

// Açılış. Sayfada CrazyGames SDK'sı varsa (CrazyGames sürümü) önce SDK başlatılır ve ilerleme
// SDK'nın veri modülüne kaydedilir: CrazyGames'in iframe'inde localStorage'a güvenilemez, veri
// modülü ise oyuncunun hesabıyla buluta eşitlenir. Diğer her yerde localStorage kullanılır.
(function (run) {
  'use strict';
  const sdk = window.CrazyGames && window.CrazyGames.SDK;
  if (!sdk || typeof sdk.init !== 'function') {
    run(null);
    return;
  }
  let started = false;
  const start = (cloud) => {
    if (started) return;
    started = true;
    run(cloud);
  };
  // SDK yanıt vermezse oyun yine de (yerel kayıtla) açılsın
  const timer = setTimeout(() => start(null), 6000);
  Promise.resolve()
    .then(() => sdk.init())
    .then(() => {
      clearTimeout(timer);
      start(sdk.environment !== 'disabled' && sdk.data ? sdk.data : null);
    })
    .catch(() => {
      clearTimeout(timer);
      start(null);
    });
})(function (cloudData) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Sabitler (mantıksal birimler; ekran boyutundan bağımsız)
  // ---------------------------------------------------------------------------
  const W = 540, H = 900;           // oyun alanı
  const B = 24;                     // masa kenarı kalınlığı
  const LW = W + B * 2, LH = H + B * 2;
  const GOAL_W = 184;
  const PUCK_R = 21, MALLET_R = 37;
  const MIN_D = PUCK_R + MALLET_R;
  const CENTER_GAP = MALLET_R * 0.5; // raketin merkez çizgisine en fazla yaklaşabileceği mesafe
  const MAX_PUCK = 2300;             // birim / saniye
  const MAX_MALLET_V = 4200;
  // Stadyuma göre fizik: damp hava yastığı sürtünmesi (1/sn), wallE duvar esnekliği, stick çamurda
  // yavaşlayan paka eklenen sürtünme, mallet raketin en yüksek vuruş hızı; vents/wells/pillars
  // stadyumun özel mekaniği (Arena).
  const PHYS = {
    neon: { damp: 0.3, wallE: 0.88 },
    water: { damp: 0.42, wallE: 0.86 },
    ice: { damp: 0.07, wallE: 0.95 },
    sand: { damp: 1.15, wallE: 0.72 },
    mud: { damp: 0.75, wallE: 0.7, stick: 2.8, mallet: 2600 },
    lava: { damp: 0.32, wallE: 0.88, vents: true },
    space: { damp: 0.2, wallE: 0.9, wells: true },
    crystal: { damp: 0.3, wallE: 0.9, pillars: true },
  };
  const WALL_E = 0.88, MALLET_E = 0.9, PUCK_E = 0.92;
  const SUBSTEPS = 10;
  const TAU = Math.PI * 2;
  const MATCH_TIME = 60;              // maç süresi (sn)
  const SECOND_PUCK_AT = 45;         // ikinci topun girdiği saniye
  // ---------------------------------------------------------------------------
  // Dil (Türkçe / English). tl('anahtar', { değişken }) → seçili dildeki metin.
  // HTML'deki sabit metinler data-i18n (metin), data-i18n-html (biçimli metin),
  // data-i18n-aria (aria-label), data-i18n-title (title) ve data-i18n-alt ile çevrilir.
  // ---------------------------------------------------------------------------
  const STR = {
    // Genel
    'meta.desc': ['Aqua Hockey — tarayıcıda ve telefonda oynanabilen, su stadyumunda geçen bir air hockey oyunu.', 'Aqua Hockey — an air hockey game set in a water stadium, playable in the browser and on your phone.'],
    'board.aria': ['Air hockey masası', 'Air hockey table'],
    'pct': ['%{n}', '{n}%'],
    'coin': ['altın', 'gold'],
    // Oyuncular ve skiller
    'p.blue': ['MAVİ', 'BLUE'], 'p.blueL': ['Mavi', 'Blue'],
    'p.pink': ['PEMBE', 'PINK'], 'p.pinkL': ['Pembe', 'Pink'],
    'you': ['SEN', 'YOU'], 'me': ['BEN', 'ME'],
    'sk.grow': ['DEV KALE', 'BIG GOAL'], 'sk.growL': ['Dev Kale', 'Big Goal'],
    'sk.shrink': ['KALE KİLİDİ', 'GOAL LOCK'], 'sk.shrinkL': ['Kale Kilidi', 'Goal Lock'],
    'sk.growSub': ['Rakip kale büyür', 'Widens rival goal'],
    'sk.shrinkSub': ['Kalen küçülür', 'Shrinks your goal'],
    'sk.growAria': ['Dev Kale: rakibin kalesi 5 saniye büyür', 'Big Goal: the rival goal grows for 5 seconds'],
    'sk.shrinkAria': ['Kale Kilidi: kendi kalen 5 saniye küçülür', 'Goal Lock: your own goal shrinks for 5 seconds'],
    'sk.bar0': ['Mavi oyuncunun yetenekleri', "Blue player's skills"],
    'sk.bar1': ['Pembe oyuncunun yetenekleri', "Pink player's skills"],
    'sk.active': ['Aktif · {n} sn', 'Active · {n} s'],
    'sk.owned': ['Envanter: {n}', 'Owned: {n}'],
    'sk.buy': ['Satın al', 'Buy'],
    'sk.free': ['ÜCRETSİZ', 'FREE'],
    'sk.introTouch': ['Her yetenekten 1 ücretsiz hakkın var! Alttaki düğmelerle kullan.', 'You get 1 free use of each skill! Use them with the buttons below.'],
    'sk.introTouchL': ['Her yetenekten 1 ücretsiz hakkın var! Soldaki düğmelerle kullan.', 'You get 1 free use of each skill! Use them with the buttons on the left.'],
    'sk.introKeys': ['Her yetenekten 1 ücretsiz hakkın var! 1 ve 2 tuşlarıyla ya da düğmelerle kullan.', 'You get 1 free use of each skill! Use them with keys 1 and 2 or the buttons.'],
    // HUD
    'hud.pause': ['Duraklat', 'Pause'], 'hud.pauseT': ['Duraklat (P)', 'Pause (P)'],
    'hud.fs': ['Tam ekran', 'Fullscreen'],
    'hud.sound': ['Ses ayarı', 'Sound settings'],
    'clock.two': ['2 TOP', '2 PUCKS'], 'clock.soon': ['2. TOP GELİYOR', '2ND PUCK SOON'],
    // Bannerlar
    'b.goal': ['GOL!', 'GOAL!'], 'b.second': ['2. TOP!', '2ND PUCK!'], 'b.go': ['BAŞLA!', 'GO!'], 'b.time': ['SÜRE BİTTİ!', "TIME'S UP!"],
    // Menü
    'm.mode': ['Mod', 'Mode'], 'm.ai': ['Tek Oyuncu', 'Single Player'], 'm.pvp': ['İki Oyuncu', 'Two Players'],
    'm.theme': ['Tema', 'Theme'], 'm.diff': ['Zorluk', 'Difficulty'], 'm.lang': ['Dil · Language', 'Language · Dil'],
    'diff.easy': ['Kolay', 'Easy'], 'diff.medium': ['Orta', 'Medium'], 'diff.hard': ['Zor', 'Hard'],
    'diffl.easy': ['kolay', 'easy'], 'diffl.medium': ['orta', 'medium'], 'diffl.hard': ['zor', 'hard'],
    'm.play': ['OYNA', 'PLAY'], 'm.store': ['Mağaza', 'Store'],
    'm.level': ['Rakip', 'Opponent'],
    's.mallets': ['Görünümler', 'Looks'], 's.skinD': ['Raketinin görünümü', 'Your mallet look'],
    's.secMallet': ['RAKET', 'MALLET'], 's.secPuck': ['PAK', 'PUCK'], 's.puckD': ['Pakın görünümü', 'Puck look'],
    's.puckThemeD': ['Her stadyumun kendi pakı', "Each stadium's own puck"],
    'pk.theme': ['Tema Pakı', 'Stadium Puck'], 'pk.ember': ['Kor', 'Ember'], 'pk.mint': ['Nane', 'Mint'],
    'pk.carbon': ['Karbon', 'Carbon'], 'pk.soccer': ['Futbol', 'Football'], 'pk.melon': ['Karpuz', 'Watermelon'],
    'pk.plasma': ['Plazma', 'Plasma'], 'pk.diamond': ['Elmas', 'Diamond'],
    'skin.classic': ['Klasik', 'Classic'], 'skin.frost': ['Kırağı', 'Frost'], 'skin.lime': ['Zehir Yeşili', 'Toxic Lime'],
    'skin.violet': ['Ametist', 'Amethyst'], 'skin.fire': ['Alev', 'Blaze'], 'skin.gold': ['Altın', 'Gold'],
    'skin.galaxy': ['Galaksi', 'Galaxy'], 'skin.rainbow': ['Gökkuşağı', 'Rainbow'],
    'mi.title': ['GÜNLÜK GÖREVLER', 'DAILY MISSIONS'], 'mi.done': ['GÖREV TAMAMLANDI', 'MISSION COMPLETE'],
    'mi.reset': ['Yenilenmesine {h} sa {m} dk', 'New in {h}h {m}m'],
    'mi.bonus': ['Üçünü de bitir: +{n} bonus', 'Finish all three: +{n} bonus'], 'mi.bonusDone': ['Bugünün görevleri tamam! Yarın yenileri gelir.', "All done for today! New ones tomorrow."],
    'mi.allName': ['Tüm günlük görevler', 'All daily missions'], 'mi.over': ['📋 Günlük görevler: {n}/3', '📋 Daily missions: {n}/3'],
    'mi.goals': ['{n} gol at', 'Score {n} goals'], 'mi.wins': ['{n} maç kazan', 'Win {n} matches'], 'mi.wins1': ['Bir maç kazan', 'Win a match'],
    'mi.matches': ['{n} maç oyna', 'Play {n} matches'], 'mi.skills': ['{n} kez yetenek kullan', 'Use skills {n} times'],
    'mi.themeWin': ['{t}: bir maç kazan', 'Win a match in {t}'], 'mi.clean': ['Gol yemeden bir maç kazan', 'Win without conceding'],
    'mi.late': ['Son 15 saniyede gol at', 'Score in the last 15 seconds'],
    'a.style': ['Tarz Sahibi', 'Stylish'], 'a.style.d': ['Yeni bir raket ya da pak görünümü al', 'Get a new mallet or puck look'],
    'ph.neon': ['Neon: klasik hava yastığı.', 'Neon: classic air cushion.'],
    'ph.water': ['Su Stadyumu: su pakı hafifçe yavaşlatır.', 'Water Stadium: the water gently slows the puck.'],
    'ph.ice': ['❄️ Buz: pak kayar, duvarlar daha sert sektirir!', '❄️ Ice: the puck glides and walls bounce harder!'],
    'ph.sand': ['🏜️ Kum: sürtünme yüksek, pak çabuk yavaşlar. Sert vur!', '🏜️ Sand: high friction, the puck slows fast. Hit hard!'],
    'ph.mud': ['🟤 Çamur: raketler ağır, yavaş pak çamura yapışır!', '🟤 Mud: mallets are heavy and slow pucks get stuck!'],
    'ph.lava': ['🌋 Lav: kırmızı halkalar patlar ve pakı fırlatır!', '🌋 Lava: red rings erupt and launch the puck!'],
    'ph.space': ['🪐 Uzay: çekim kuyuları pakın yolunu büker!', '🪐 Space: gravity wells bend the puck\'s path!'],
    'ph.crystal': ['💎 Kristal: ortadaki kristallerden pak seker!', '💎 Crystal: the puck bounces off the crystals!'],
    'c.career': ['Kariyer', 'Career'], 'c.prevL': ['Önceki lig', 'Previous league'], 'c.nextL': ['Sonraki lig', 'Next league'],
    'c.lockedL': ['Açmak için bu ligin patronunu yen', "Beat this league's boss to unlock"],
    'c.stars': ['★ {n}/15', '★ {n}/15'], 'c.boss': ['PATRON', 'BOSS'],
    'c.play': ['{l} · {n} ({i}/5)', '{l} · {n} ({i}/5)'],
    'c.next': ['SIRADAKİ: {n} ▶', 'NEXT: {n} ▶'], 'c.nextLeague': ['YENİ LİG ▶', 'NEW LEAGUE ▶'],
    'c.win': ['Rakip: {n} · {s}', 'Opponent: {n} · {s}'], 'c.lost': ['{n} kazandı. Bir daha dene!', '{n} won. Try again!'],
    'c.champ': ['🏆 {l} şampiyonu! {t} açıldı.', '🏆 {l} champion! {t} unlocked.'],
    'c.champAll': ['🏆 Tüm liglerin şampiyonu!', '🏆 Champion of every league!'],
    'c.title': ['Şampiyonluk', 'Championship'],
    'lg.water': ['Su Ligi', 'Water League'], 'lg.neon': ['Neon Ligi', 'Neon League'], 'lg.ice': ['Buz Ligi', 'Ice League'],
    'lg.sand': ['Kum Ligi', 'Sand League'], 'lg.lava': ['Lav Ligi', 'Lava League'], 'lg.mud': ['Bataklık Ligi', 'Swamp League'],
    'lg.space': ['Uzay Ligi', 'Space League'], 'lg.crystal': ['Kristal Ligi', 'Crystal League'],
    'a.title': ['BAŞARIMLAR', 'ACHIEVEMENTS'], 'a.btn': ['Başarımlar', 'Achievements'], 'a.close': ['Kapat', 'Close'],
    'a.unlocked': ['BAŞARIM AÇILDI', 'ACHIEVEMENT UNLOCKED'], 'a.done': ['Tamamlandı', 'Completed'],
    'a.count': ['{n}/{t} tamamlandı', '{n}/{t} completed'],
    'a.goal1': ['İlk Gol', 'First Goal'], 'a.goal1.d': ['Yapay zekâya ilk golünü at', 'Score your first goal against the AI'],
    'a.win1': ['İlk Zafer', 'First Victory'], 'a.win1.d': ['İlk maçını kazan', 'Win your first match'],
    'a.lvl5': ['Şampiyon', 'Champion'], 'a.lvl5.d': ['İlk ligini kazan', 'Win your first league'],
    'a.lvl10': ['Lig Avcısı', 'League Hunter'], 'a.lvl10.d': ['4 lig kazan', 'Win 4 leagues'],
    'a.lvl13': ['Efsane', 'Legend'], 'a.lvl13.d': ['Tüm ligleri kazan', 'Win every league'],
    'a.goals25': ['Golcü', 'Striker'], 'a.goals25.d': ['Toplam 25 gol at', 'Score 25 goals in total'],
    'a.goals100': ['Gol Makinesi', 'Goal Machine'], 'a.goals100.d': ['Toplam 100 gol at', 'Score 100 goals in total'],
    'a.m10': ['Isınma Turu', 'Warmed Up'], 'a.m10.d': ['10 maç oyna', 'Play 10 matches'],
    'a.m50': ['Tutkulu', 'Dedicated'], 'a.m50.d': ['50 maç oyna', 'Play 50 matches'],
    'a.clean': ['Geçit Yok', 'Clean Sheet'], 'a.clean.d': ['Hiç gol yemeden bir maç kazan', 'Win a match without conceding'],
    'a.five': ['Gol Yağmuru', 'Goal Rush'], 'a.five.d': ['Bir maçta 5 gol at', 'Score 5 goals in one match'],
    'a.comeback': ['Geri Dönüş', 'Comeback'], 'a.comeback.d': ['2 gol gerideyken maçı kazan', 'Win after being 2 goals down'],
    'a.buzzer': ['Son Saniye', 'Buzzer Beater'], 'a.buzzer.d': ['Son 3 saniyede gol at', 'Score in the final 3 seconds'],
    'a.frenzy': ['Çifte Pak', 'Double Trouble'], 'a.frenzy.d': ['İki pak varken 2 gol at', 'Score 2 goals while two pucks are in play'],
    'a.rocket': ['Roket Şut', 'Rocket Shot'], 'a.rocket.d': ['Pakı en yüksek hıza yakın vur', 'Hit the puck at near top speed'],
    'a.skills': ['Yetenek Ustası', 'Skill Master'], 'a.skills.d': ['Yetenekleri 10 kez kullan', 'Use skills 10 times'],
    'a.pvp': ['Dostluk Maçı', 'Friendly Match'], 'a.pvp.d': ['Bir arkadaşınla iki kişilik maç oyna', 'Play a two-player match with a friend'],
    'a.tour': ['Gezgin', 'Explorer'], 'a.tour.d': ['3 farklı stadyumda maç oyna', 'Play in 3 different stadiums'],
    'a.all': ['Koleksiyoncu', 'Collector'], 'a.all.d': ['Tüm stadyumları aç', 'Unlock every stadium'],
    'a.s3': ['Sadık Oyuncu', 'Regular'], 'a.s3.d': ['3 gün üst üste gel', 'Play 3 days in a row'],
    'a.s7': ['Vazgeçilmez', 'Unstoppable'], 'a.s7.d': ['7 gün üst üste gel', 'Play 7 days in a row'],
    'ob.or': ['veya', 'or'], 'ob.drag': ['Sürükle', 'Drag'], 'ob.move': ['Fareyle yönet', 'Move with the mouse'], 'lv.prev': ['Önceki seviye', 'Previous level'], 'lv.next': ['Sonraki seviye', 'Next level'],
    'lvl.name': ['Seviye {n}', 'Level {n}'], 'lvl.of': ['{n}.', 'level {n}'],
    'lvl.locked': ['Kazanınca açılır', 'Win to unlock'],
    'tier.1': ['Acemi', 'Rookie'], 'tier.2': ['Kolay', 'Easy'], 'tier.3': ['Orta', 'Medium'], 'tier.4': ['Zor', 'Hard'],
    'tier.5': ['Uzman', 'Expert'], 'tier.6': ['Efsane', 'Legend'],
    'in.tap': ['OYNAMAK İÇİN DOKUN', 'TAP TO PLAY'], 'in.click': ['OYNAMAK İÇİN TIKLA', 'CLICK TO PLAY'],
    'in.howTouch': ['Raketini parmağınla sürükle, pakı rakibin kalesine gönder!', 'Drag your mallet with your finger and send the puck into the goal!'],
    'in.howMouse': ['Raketini fareyle yönet, pakı rakibin kalesine gönder!', 'Move your mallet with the mouse and send the puck into the goal!'],
    'r.next': ['SEVİYE {n} ▶', 'LEVEL {n} ▶'], 'r.retry': ['TEKRAR DENE', 'TRY AGAIN'],
    'r.subLevel': ['Seviye {n} açıldı! Hazır mısın?', 'Level {n} unlocked! Ready?'],
    'r.subRetry': ['Seviye {n} seni bekliyor. Bir daha dene!', 'Level {n} is waiting. Try again!'],
    'r.gift': ['Hoş geldin hediyesi', 'Welcome gift'],
    'r.canUnlock': ['🔓 {t} temasını açabilirsin!', '🔓 You can unlock {t}!'],
    'r.toUnlock': ['{t}: {n} altın kaldı', '{t}: {n} gold to go'],
    'd.toast': ['🎁 Günlük ödül · {d}. gün: +{n} altın!', '🎁 Daily reward · day {d}: +{n} gold!'],
    'd.tomorrow': ['🎁 Yarın gel: +{n} altın günlük ödül', '🎁 Come back tomorrow: +{n} gold daily reward'],
    'm.inv': ['Envanter: {g} Dev Kale · {s} Kale Kilidi', 'Owned: {g} Big Goal · {s} Goal Lock'],
    'm.wallet': ['Altın bakiyen', 'Your gold'],
    'hint.pvpTouch': ['Telefonu masaya koyun: <b class="c">alt yarı</b> ve <b class="p">üst yarı</b> kendi raketini parmağıyla sürükler, yetenekler kendi tarafındaki düğmelerde.', 'Put the phone on the table: the <b class="c">bottom half</b> and the <b class="p">top half</b> each drag their own mallet, with skill buttons on each side.'],
    'hint.pvpTouchL': ['Telefonu masaya koyun: <b class="c">sol yarı</b> ve <b class="p">sağ yarı</b> kendi raketini parmağıyla sürükler, yetenekler kendi tarafındaki düğmelerde.', 'Put the phone on the table: the <b class="c">left half</b> and the <b class="p">right half</b> each drag their own mallet, with skill buttons on each side.'],
    'hint.pvpKeys': ['<b class="c">Mavi</b>: fare veya ok tuşları, yetenekler <b>1</b>/<b>2</b> · <b class="p">Pembe</b>: {w} {a} {s} {d}, yetenekler <b>{q}</b>/<b>{e}</b><br>Dokunmatik ekranda iki parmakla da oynanır.', '<b class="c">Blue</b>: mouse or arrow keys, skills <b>1</b>/<b>2</b> · <b class="p">Pink</b>: {w} {a} {s} {d}, skills <b>{q}</b>/<b>{e}</b><br>On a touch screen, play with two fingers.'],
    'hint.aiTouch': ['Raketi parmağınla sürükle, yetenekleri alttaki düğmelerle kullan!', 'Drag your mallet with your finger and use skills with the buttons below!'],
    'hint.aiTouchL': ['Raketi parmağınla sürükle, yetenekleri soldaki düğmelerle kullan!', 'Drag your mallet with your finger and use skills with the buttons on the left!'],
    'hint.aiKeys': ['Raketi <b>fare</b> (veya ok tuşları) ile yönet, yetenekler <b>1</b>/<b>2</b>. <b>P</b> duraklatır, <b>M</b> sesi, <b>N</b> müziği kapatır, <b>−</b>/<b>+</b> ses seviyesini değiştirir.', 'Control your mallet with the <b>mouse</b> (or arrow keys), skills <b>1</b>/<b>2</b>. <b>P</b> pauses, <b>M</b> mutes, <b>N</b> toggles music, <b>−</b>/<b>+</b> change the volume.'],
    // Duraklatma
    'p.title': ['DURAKLATILDI', 'PAUSED'], 'p.resume': ['DEVAM', 'RESUME'], 'p.restart': ['Yeniden Başla', 'Restart'], 'p.menu': ['Ana Menü', 'Main Menu'],
    // Maç sonu
    'r.draw': ['BERABERE', 'DRAW'], 'r.wins': ['{name} KAZANDI!', '{name} WINS!'], 'r.win': ['KAZANDIN!', 'YOU WIN!'], 'r.lose': ['KAYBETTİN', 'YOU LOSE'],
    'r.subDraw': ['Süre bitti, kimse üstün gelemedi. Rövanş?', "Time's up and nobody pulled ahead. Rematch?"],
    'r.subPvp': ['Rövanş?', 'Rematch?'],
    'r.subLose': ['Bir dahaki sefere! Tekrar dene.', 'Next time! Try again.'],
    'r.balance': ['Bakiye', 'Balance'],
    'r.double': ['Reklam izle: ödül 2 kat (+{n})', 'Watch ad: 2× reward (+{n})'],
    'r.win2': ['Galibiyet', 'Win'], 'r.draw2': ['Beraberlik', 'Draw'], 'r.match': ['Maç', 'Match'],
    'r.goals': ['{n} gol +{b}', '{n} goals +{b}'],
    'r.again': ['TEKRAR OYNA', 'PLAY AGAIN'],
    // Paylaşım
    'sh.label': ['Skorunu paylaş', 'Share your score'], 'sh.native': ['Paylaş', 'Share'],
    'sh.x': ["X'te paylaş", 'Share on X'], 'sh.wa': ["WhatsApp'ta paylaş", 'Share on WhatsApp'],
    'sh.tg': ["Telegram'da paylaş", 'Share on Telegram'], 'sh.fb': ["Facebook'ta paylaş", 'Share on Facebook'],
    'sh.copy': ['Metni kopyala', 'Copy text'],
    'sh.card': ['Skor kartı', 'Score card'], 'sh.cardSub': ['Görseli gör, kaydet veya paylaş', 'View, save or share the image'],
    'sh.cardAlt': ['Maç sonu skor kartı', 'Match score card'],
    'sh.hintSave': ['Görseli kaydedip istediğin yerde paylaşabilirsin.', 'Save the image and share it anywhere you like.'],
    'sh.hintHold': ['Kaydetmek için görsele basılı tut veya sağ tıkla.', 'Press and hold (or right-click) the image to save it.'],
    'sh.shareImg': ['GÖRSELİ PAYLAŞ', 'SHARE IMAGE'], 'sh.saveImg': ['Görseli kaydet', 'Save image'], 'sh.back': ['Geri', 'Back'],
    'sh.pvpDraw': ["Aqua Hockey'de {s} berabere kaldık!", 'We drew {s} in Aqua Hockey!'],
    'sh.pvpWin': ["Aqua Hockey'de {w}, {l} rakibini {hi}-{lo} yendi!", '{w} beat {l} {hi}-{lo} in Aqua Hockey!'],
    'sh.aiDraw': ["Aqua Hockey'de {d} ile {s} berabere kaldım!", 'I drew {s} against {d} in Aqua Hockey!'],
    'sh.aiWin': ["Aqua Hockey'de rakibim {d} karşısında {s} kazandım! 🏆", 'I beat {d} {s} in Aqua Hockey! 🏆'],
    'sh.aiLose': ["Aqua Hockey'de rakibim {d} karşısında {s} kaybettim, rövanş lazım!", 'I lost {s} to {d} in Aqua Hockey. I need a rematch!'],
    'sh.tail': ['Sen de dene!', 'Give it a try!'],
    'sh.copied': ['Paylaşım metni panoya kopyalandı.', 'Share text copied to the clipboard.'],
    'sh.menuFail': ['Paylaşım menüsü açılamadı; metin panoya kopyalandı.', "Couldn't open the share menu; the text was copied to the clipboard."],
    'sh.copyFail': ['Kopyalanamadı. Metin: ', "Couldn't copy. Text: "],
    'sh.saved': ['Skor kartı kaydedildi.', 'Score card saved.'],
    'sh.busy': ['Kaydetme penceresi zaten açık.', 'The save dialog is already open.'],
    'sh.saveFail': ['Görsel kaydedilemedi; görsele basılı tutarak kaydedebilirsin.', "Couldn't save the image; press and hold it to save."],
    'sh.downloaded': ['Skor kartı indirildi.', 'Score card downloaded.'],
    // Skor kartı görseli
    'c.won': ['KAZANDIM!', 'I WON!'], 'c.lost': ['KAYBETTİM', 'I LOST'],
    'c.info': ["60 SN MAÇ  ·  45. SN'DE 2. TOP  ·  {m}", '60 S MATCH  ·  2ND PUCK AT 45 S  ·  {m}'],
    'c.pvp': ['İKİ OYUNCU', 'TWO PLAYERS'], 'c.ai': ['TEK OYUNCU', 'SINGLE PLAYER'],
    'c.try': ['SEN DE DENE!', 'YOUR TURN!'],
    // Ses
    'v.title': ['Ses', 'Sound'], 'v.off': ['Kapalı', 'Off'], 'v.mute': ['Sesi kapat', 'Mute'], 'v.unmute': ['Sesi aç', 'Unmute'],
    'v.level': ['Ses seviyesi', 'Volume'],
    'v.music': ['Müzik', 'Music'], 'v.musicLevel': ['Müzik seviyesi', 'Music volume'],
    'v.musicOff': ['Müziği kapat', 'Turn music off'], 'v.musicOn': ['Müziği aç', 'Turn music on'],
    'v.toastMusicOn': ['Müzik açık (%{n})', 'Music on ({n}%)'], 'v.toastMusicOff': ['Müzik kapalı', 'Music off'],
    'v.hint': ['Klavye: <b>−</b> / <b>+</b> seviye, <b>M</b> sessiz, <b>N</b> müzik', 'Keyboard: <b>−</b> / <b>+</b> volume, <b>M</b> mute, <b>N</b> music'],
    'v.platformMuted': ['Ses, CrazyGames ayarlarından kapatılmış.', 'Sound is muted in the CrazyGames settings.'],
    'v.toast': ['Ses: %{n}', 'Volume: {n}%'], 'v.toastOff': ['Ses kapalı', 'Sound off'], 'v.toastOn': ['Ses açık (%{n})', 'Sound on ({n}%)'],
    // Mağaza
    's.title': ['MAĞAZA', 'STORE'],
    's.note': ['Altın her maçtan sonra ve reklam izleyerek kazanılır.', 'Earn gold after every match and by watching ads.'],
    's.themes': ['Temalar', 'Themes'], 's.skills': ['Yetenekler', 'Skills'], 's.inv': ['Envanterin', 'Your inventory'],
    's.confirm': ['Satın almayı onayla', 'Confirm purchase'],
    's.buy': ['SATIN AL', 'BUY'], 's.short': ['YETERSİZ ALTIN', 'NOT ENOUGH GOLD'], 's.need': ['· {n} eksik', '· {n} short'],
    's.preview': ['Önizle', 'Preview'], 's.cancel': ['Vazgeç', 'Cancel'], 's.close': ['Kapat', 'Close'], 's.bal': ['Bakiyen', 'Balance'],
    's.selected': ['Seçili', 'Selected'], 's.owned': ['Açık', 'Owned'], 's.select': ['Seç', 'Select'], 's.free': ['Ücretsiz', 'Free'],
    's.best': ['En avantajlı', 'Best value'],
    's.uses3': ['3 kullanım', '3 uses'], 's.bundle': ['Yetenek Paketi', 'Skill Bundle'], 's.bundleD': ['5 Dev Kale + 5 Kale Kilidi', '5 Big Goal + 5 Goal Lock'],
    's.msgFocus': ['Bu maçtaki ücretsiz {s} hakkını kullandın. Devam etmek için altınla paket al.', "You've used your free {s} for this match. Buy a pack with gold to keep going."],
    's.msg': ['Her maçta her yetenekten 1 ücretsiz hakkın var. Fazlası için altınla paket al.', 'You get 1 free use of each skill per match. Buy packs with gold for more.'],
    's.ariaItem': ['{name}, {desc}, {p} altın', '{name}, {desc}, {p} gold'],
    's.ariaSel': ['{name}, seçili', '{name}, selected'], 's.ariaOwn': ['{name}, açık', '{name}, owned'], 's.ariaPrice': ['{name}, {p} altın', '{name}, {p} gold'],
    's.ariaLocked': ['{name}, kilitli, {p} altın', '{name}, locked, {p} gold'],
    's.chosen': ['{name} seçildi.', '{name} selected.'],
    's.bought': ['Satın alındı: {x}', 'Purchased: {x}'],
    's.unlockedSel': ['{name} açıldı ve seçildi!', '{name} unlocked and selected!'],
    's.unlocked': ['{name} açıldı! Ana menüden seçebilirsin.', '{name} unlocked! Select it from the main menu.'],
    'pv.aria': ['Tema önizleme', 'Theme preview'], 'pv.badge': ['ÖNİZLEME', 'PREVIEW'], 'pv.price': ['Fiyat', 'Price'], 'pv.back': ['Mağazaya dön', 'Back to store'],
    // Reklam
    'ad.watch': ['Reklam izle', 'Watch ad'], 'ad.limit': ['Bugünlük reklam hakkın doldu', 'Daily ad limit reached'],
    'ad.left': ['Bugün kalan reklam: {l}/{d}', 'Ads left today: {l}/{d}'], 'ad.tomorrow': ['Yarın yeniden reklam izleyebilirsin', 'You can watch more ads tomorrow'],
    'ad.aria': ['Reklam', 'Ad'], 'ad.title': ['REKLAM', 'AD'], 'ad.test': ['TEST MODU', 'TEST MODE'],
    'ad.testT': ['Reklam altyapısı bağlanana kadar örnek gösterim', 'Sample ad until a real ad network is connected'],
    'ad.space': ['Reklam alanı', 'Ad space'], 'ad.spaceSub': ['Gerçek ödüllü reklam burada oynatılacak', 'A real rewarded ad will play here'],
    'ad.claim': ['ÖDÜLÜ AL', 'CLAIM REWARD'], 'ad.closeNo': ['Kapat (ödülsüz)', 'Close (no reward)'],
    'ad.wait': ['Ödül için reklamı sonuna kadar izle: {n} sn', 'Watch to the end for your reward: {n} s'],
    'ad.done': ['Reklam bitti, ödülün hazır.', 'Ad finished, your reward is ready.'],
    'ad.limitToast': ['Bugünlük reklam hakkın doldu. Yarın yeniden izleyebilirsin.', "You've reached today's ad limit. Come back tomorrow."],
    'ad.aborted': ['Reklam yarıda kaldı, ödül verilmedi.', "The ad didn't finish, so no reward was given."],
    'ad.fail': ['Reklam şu an gösterilemiyor. Biraz sonra tekrar dene.', 'No ad available right now. Try again later.'],
    'ad.blocked': ['Reklam engelleyici açık görünüyor; ödüllü reklam için kapatman gerekiyor.', 'An ad blocker seems to be on; turn it off to watch rewarded ads.'],
    'ad.earned': ['+{n} altın kazandın!', 'You earned +{n} gold!'],
    'ad.doubled': ['Ödül 2 katına çıktı: +{n} altın', 'Reward doubled: +{n} gold'],
    // Temalar
    'th.water': ['Su Stadyumu', 'Water Stadium'], 'th.water.d': ['Gerçek zamanlı simüle edilen havuz; raketler suyu iter.', 'A real-time simulated pool; mallets push the water.'],
    'th.neon': ['Neon', 'Neon'], 'th.neon.d': ['Parlayan çizgiler, neon raketler ve ışık izleri.', 'Glowing lines, neon mallets and light trails.'],
    'th.ice': ['Buz Stadyumu', 'Ice Stadium'], 'th.ice.d': ['Çatlayan, sürekli değişen buz tabakası; sert şutta buz çatırdar.', 'A cracking, ever-changing ice sheet; hard shots make it crackle.'],
    'th.sand': ['Kum Stadyumu', 'Sand Stadium'], 'th.sand.d': ['Raketlerin ittiği, oluk açılan kum; sert şutta kum savrulur.', 'Sand that mallets plow into grooves; hard shots throw it around.'],
    'th.lava': ['Lav Stadyumu', 'Lava Stadium'], 'th.lava.d': ['Kırılan bazalt kabuk ve altından fışkıran lav.', 'A cracking basalt crust with lava bursting from beneath.'],
    'th.mud': ['Bataklık Stadyumu', 'Swamp Stadium'], 'th.mud.d': ['Ağır, yapışkan çamur; yüzen yosunlar ve patlayan kabarcıklar.', 'Heavy, sticky mud with floating moss and popping bubbles.'],
    'th.space': ['Uzay Stadyumu', 'Space Stadium'], 'th.space.d': ['Kütlelerle bükülen ışık ağı, kutup ışığı ve süpernova golleri.', 'A grid of light bent by mass, auroras and supernova goals.'],
    'th.crystal': ['Kristal Mağarası', 'Crystal Cave'], 'th.crystal.d': ['Işık dalgalarıyla gökkuşağına bürünen kristaller; her vuruş bir nota.', 'Crystals that turn rainbow in waves of light; every hit plays a note.'],
    'webgl': ['Bu cihaz WebGL desteklemiyor: {x} durağan gösterilecek.', "This device doesn't support WebGL: the {x} will be shown static."],
    'webgl.mud': ['çamur', 'mud'], 'webgl.water': ['su', 'water'],
  };

  let LANG = 'tr';
  const LOCALE = () => (LANG === 'en' ? 'en-US' : 'tr-TR');
  function tl(key, vars) {
    const e = STR[key];
    let s = e ? e[LANG === 'en' ? 1 : 0] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  }
  const up = (s) => s.toLocaleUpperCase(LANG === 'en' ? 'en' : 'tr');

  // Skiller: etki süresi saniye, delta kale genişliğine eklenir (adlar seçili dilde)
  const SKILLS = {
    grow:   { dur: 5, delta: 120, get name() { return tl('sk.grow'); }, get label() { return tl('sk.growL'); }, rgb: '255,190,60' },
    shrink: { dur: 5, delta: -92, get name() { return tl('sk.shrink'); }, get label() { return tl('sk.shrinkL'); }, rgb: '190,245,255' },
  };

  const COLORS = [
    { main: '#19e6ff', light: '#c4faff', dark: '#064a74', rgb: '25,230,255', get name() { return tl('p.blue'); }, get label() { return tl('p.blueL'); } },
    { main: '#ff3d9a', light: '#ffd0e6', dark: '#6e0a3c', rgb: '255,61,154', get name() { return tl('p.pink'); }, get label() { return tl('p.pinkL'); } },
  ];
  const PUCK_RGB = '255,226,110';
  const FONT = '"Exo 2", system-ui, sans-serif';

  const AI_LEVELS = {
    easy:   { speed: 540,  accel: 3000,  think: 0.22,  predict: 0.1,  aimErr: 1.0,  noise: 70, strike: 1.0,  bank: 0,    counter: false, skillSmart: 0.25, skillRandom: 0.01 },
    medium: { speed: 880,  accel: 6000,  think: 0.1,   predict: 0.22, aimErr: 0.55, noise: 30, strike: 1.15, bank: 0.15, counter: true,  skillSmart: 0.6,  skillRandom: 0.008 },
    hard:   { speed: 1380, accel: 11000, think: 0.035, predict: 0.36, aimErr: 0.2,  noise: 6,  strike: 1.3,  bank: 0.3,  counter: true,  skillSmart: 0.95, skillRandom: 0 },
  };

  // Seviyeye göre yapay zekâ: ara seviyeler komşu çapalar arasında doğrusal karıştırılır; 12'den sonrası sabit.
  const AI_ANCHORS = [
    [1, { speed: 430, accel: 2400, think: 0.28, predict: 0.05, aimErr: 1.2, noise: 95, strike: 0.95, bank: 0, skillSmart: 0.15, skillRandom: 0.008 }],
    [2, AI_LEVELS.easy],
    [4, AI_LEVELS.medium],
    [8, AI_LEVELS.hard],
    [12, { speed: 1600, accel: 13000, think: 0.028, predict: 0.42, aimErr: 0.12, noise: 3, strike: 1.36, bank: 0.35, skillSmart: 1, skillRandom: 0 }],
  ];
  function aiForLevel(n) {
    n = Math.max(1, Math.min(12, n));
    let i = 0;
    while (i < AI_ANCHORS.length - 2 && n > AI_ANCHORS[i + 1][0]) i++;
    const [l0, a] = AI_ANCHORS[i], [l1, b] = AI_ANCHORS[i + 1];
    const k = Math.max(0, Math.min(1, (n - l0) / (l1 - l0)));
    const o = { counter: n >= 3 };
    for (const key of Object.keys(a)) if (typeof a[key] === 'number') o[key] = a[key] + (b[key] - a[key]) * k;
    return o;
  }
  // Seviyenin adı: 1 Acemi, 2-3 Kolay, 4-6 Orta, 7-9 Zor, 10-11 Uzman, 12+ Efsane
  const tierOf = (n) => (n <= 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : n <= 9 ? 4 : n <= 11 ? 5 : 6);
  // Ödül çarpanı: seviye başına %15, en çok ×2,65
  const levelMult = (n) => Math.round(Math.min(2.65, 1 + (n - 1) * 0.15) * 100) / 100;

  // ---------------------------------------------------------------------------
  // Kariyer: her stadyum bir lig; 4 rakip + patron. Patronu yenen sonraki stadyumu açar.
  // Rakip: [simge, ad, karakter]. Karakterler yapay zekânın oyun tarzını değiştirir.
  // ---------------------------------------------------------------------------
  const LEAGUES = ['water', 'neon', 'ice', 'sand', 'lava', 'mud', 'space', 'crystal'];
  const RIVALS = {
    water: [['🐠', 'Bubbles', 'balanced'], ['🦀', 'Crab', 'defensive'], ['🐬', 'Marlin', 'speedy'], ['🌊', 'Tide', 'trickster'], ['🐙', 'Kraken', 'boss']],
    neon: [['👾', 'Pixel', 'balanced'], ['🔋', 'Volt', 'speedy'], ['🕹️', 'Joy', 'defensive'], ['⚡', 'Laser', 'trickster'], ['🤖', 'Mega Bot', 'boss']],
    ice: [['❄️', 'Flake', 'defensive'], ['🐧', 'Pebble', 'balanced'], ['🦭', 'Seal', 'trickster'], ['🌨️', 'Blizzard', 'speedy'], ['🧊', 'Frost Giant', 'boss']],
    sand: [['🦎', 'Gecko', 'speedy'], ['🐪', 'Camel', 'defensive'], ['🦂', 'Scorpio', 'aggressive'], ['🌪️', 'Dune', 'trickster'], ['☀️', 'Sun King', 'boss']],
    lava: [['🔥', 'Ember', 'aggressive'], ['🪨', 'Basalt', 'defensive'], ['🌋', 'Magma', 'balanced'], ['🐉', 'Drake', 'speedy'], ['👹', 'Inferno', 'boss']],
    mud: [['🐸', 'Croak', 'balanced'], ['🪲', 'Beetle', 'defensive'], ['🐊', 'Gator', 'aggressive'], ['🦟', 'Buzz', 'speedy'], ['🐗', 'Bog King', 'boss']],
    space: [['👽', 'Zorp', 'trickster'], ['🛸', 'Saucer', 'speedy'], ['☄️', 'Comet', 'aggressive'], ['🚀', 'Rocket', 'balanced'], ['🌑', 'Eclipse', 'boss']],
    crystal: [['💎', 'Gem', 'balanced'], ['🔮', 'Oracle', 'trickster'], ['🦄', 'Unicorn', 'speedy'], ['✨', 'Prism', 'aggressive'], ['👑', 'Crystal Queen', 'boss']],
  };
  // Zorluk: lig başına ~1,4, maç başına 0,3 seviye; patron biraz daha zor (1 → ~12)
  const rivalDiff = (li, mi) => 1 + li * 1.4 + mi * 0.3 + (mi === 4 ? 0.3 : 0);
  function rivalAI(li, mi) {
    const o = aiForLevel(rivalDiff(li, mi));
    switch (RIVALS[LEAGUES[li]][mi][2]) {
      case 'defensive': // sağlam savunma, zayıf şut
        o.predict += 0.05; o.noise *= 0.7; o.aimErr *= 1.25; o.speed *= 0.95; o.bank *= 0.5;
        break;
      case 'speedy': // çok hızlı ama dağınık
        o.speed *= 1.15; o.accel *= 1.15; o.aimErr *= 1.25; o.noise *= 1.3;
        break;
      case 'trickster': // bant vuruşları
        o.bank = Math.max(o.bank, 0.55); o.aimErr *= 0.9;
        break;
      case 'aggressive': // sert vuruş, karşı atak
        o.strike *= 1.1; o.counter = true; o.think *= 0.9;
        break;
      case 'boss': // isabetli, yeteneklerini akıllıca kullanır
        o.noise *= 0.7; o.aimErr *= 0.85; o.skillSmart = 1; o.counter = true;
        break;
    }
    return o;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------------------
  // Kayıt: ayarlar ve ilerleme (altın, açılan temalar, envanter). CrazyGames'te SDK veri modülü,
  // başka her yerde localStorage; ikisi de erişilemezse oyun varsayılanlarla çalışır.
  // ---------------------------------------------------------------------------
  // Sürüm: '' (kendi site), 'crazygames' ya da 'showcase' (tanıtım videosu: her şey açık, reklam
  // yok, kalite düşürülmez, kayıtlar gerçek oyundan ayrı tutulur). Derleme betikleri işaretler.
  const BUILD = document.documentElement.dataset.build || '';
  const isShowcase = BUILD === 'showcase';
  const KEY_PREFIX = isShowcase ? 'aquash_' : 'neonah_';

  const saveBackend = cloudData || (() => {
    try { return window.localStorage; } catch (e) { return null; }
  })();
  // Anahtar öneki 'neonah_' oyunun eski adından kalır; mevcut oyuncuların kayıtları kaybolmasın diye değişmez.
  const store = {
    get(k, d) {
      try {
        const v = saveBackend && saveBackend.getItem(KEY_PREFIX + k);
        return v === null || v === undefined ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try { if (saveBackend) saveBackend.setItem(KEY_PREFIX + k, JSON.stringify(v)); } catch (e) { /* yok say */ }
    },
  };

  // ---------------------------------------------------------------------------
  // Oyun parası (altın) ve tema kilitleri
  // Su Stadyumu herkese açık; diğer temalar ve ek yetenek hakları mağazada altınla alınır. Altın her tamamlanan maçtan
  // sonra ve ödüllü reklam izleyerek kazanılır. Bakiye ve açılan temalar cihazda saklanır.
  // ---------------------------------------------------------------------------
  // Oyuncunun (alt, Mavi) raket görünümleri: renk seti + isteğe bağlı desen. Rakip hep pembe kalır.
  const SKINS = {
    classic: { price: 0, main: '#19e6ff', light: '#c4faff', dark: '#064a74', rgb: '25,230,255' },
    frost: { price: 150, main: '#dfe9f5', light: '#ffffff', dark: '#56677d', rgb: '220,235,255' },
    lime: { price: 150, main: '#7dff3a', light: '#e6ffd0', dark: '#1f5a08', rgb: '125,255,58' },
    violet: { price: 200, main: '#a66bff', light: '#eadcff', dark: '#3a1677', rgb: '166,107,255' },
    fire: { price: 300, main: '#ff5a1e', light: '#ffd27a', dark: '#5a0e02', rgb: '255,110,40', deco: 'flame' },
    gold: { price: 350, main: '#ffc83a', light: '#fff4c4', dark: '#7a4e06', rgb: '255,200,58', deco: 'shine' },
    galaxy: { price: 400, main: '#6a48ff', light: '#c9b8ff', dark: '#120a3a', rgb: '130,100,255', deco: 'stars' },
    rainbow: { price: 500, main: '#ff6ad5', light: '#ffffff', dark: '#3a1060', rgb: '255,255,255', deco: 'rainbow' },
  };

  // Pak görünümleri: 'theme' her stadyumun kendi pakıdır; diğerleri onun yerine geçer. `rgb`
  // kıvılcım ve iz rengi, `spin` desenli pakların hızına göre dönmesi.
  const PUCKS = {
    theme: { price: 0 },
    ember: { price: 150, rgb: '255,150,60', glow: true },
    mint: { price: 150, rgb: '150,255,215' },
    carbon: { price: 200, rgb: '255,214,60' },
    soccer: { price: 250, rgb: '255,255,255', spin: true },
    melon: { price: 250, rgb: '255,90,110', spin: true },
    plasma: { price: 350, rgb: '190,120,255', glow: true, spin: true },
    diamond: { price: 400, rgb: '170,230,255', glow: true },
  };

  const THEME_INFO = {
    water: { price: 0, get name() { return tl('th.water'); }, get desc() { return tl('th.water.d'); } },
    neon: { price: 150, get name() { return tl('th.neon'); }, get desc() { return tl('th.neon.d'); } },
    ice: { price: 250, get name() { return tl('th.ice'); }, get desc() { return tl('th.ice.d'); } },
    sand: { price: 300, get name() { return tl('th.sand'); }, get desc() { return tl('th.sand.d'); } },
    lava: { price: 400, get name() { return tl('th.lava'); }, get desc() { return tl('th.lava.d'); } },
    mud: { price: 450, get name() { return tl('th.mud'); }, get desc() { return tl('th.mud.d'); } },
    space: { price: 500, get name() { return tl('th.space'); }, get desc() { return tl('th.space.d'); } },
    crystal: { price: 600, get name() { return tl('th.crystal'); }, get desc() { return tl('th.crystal.d'); } },
  };
  const COIN = { adReward: 50, adDaily: 10 };

  const wallet = (() => {
    const v = store.get('wallet', null) || {};
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    return {
      coins: n(v.coins),
      unlocked: Array.isArray(v.unlocked) ? v.unlocked.filter((t) => THEME_INFO[t]) : [],
      adDay: String(v.adDay || ''),
      adCount: n(v.adCount),
      welcomed: !!v.welcomed,      // hoş geldin hediyesi verildi mi
      skins: Array.isArray(v.skins) ? v.skins.filter((k) => SKINS[k]) : [], // alınan raket görünümleri
      pucks: Array.isArray(v.pucks) ? v.pucks.filter((k) => PUCKS[k]) : [], // alınan pak görünümleri
      dailyDay: String(v.dailyDay || ''), // son günlük ödülün günü
      streak: n(v.streak),         // art arda gelinen gün sayısı
    };
  })();

  function saveWallet() {
    store.set('wallet', {
      coins: wallet.coins, unlocked: wallet.unlocked, adDay: wallet.adDay, adCount: wallet.adCount,
      welcomed: wallet.welcomed, dailyDay: wallet.dailyDay, streak: wallet.streak, skins: wallet.skins, pucks: wallet.pucks,
    });
  }

  function hasPuck(k) {
    return !!PUCKS[k] && (isShowcase || PUCKS[k].price === 0 || wallet.pucks.includes(k));
  }

  function hasSkin(k) {
    return !!SKINS[k] && (isShowcase || SKINS[k].price === 0 || wallet.skins.includes(k));
  }

  function isUnlocked(t) {
    const info = THEME_INFO[t];
    if (isShowcase) return !!info; // tanıtım sürümünde tüm temalar açık
    return !!info && (info.price === 0 || wallet.unlocked.includes(t));
  }

  // Tanıtım sürümü: her açılışta bol altınla başlar
  if (isShowcase) wallet.coins = 9999;

  const savedLang = store.get('lang', null);
  LANG = savedLang === 'tr' || savedLang === 'en' ? savedLang
    : (String(navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');

  const savedTheme = store.get('theme', 'water');

  // Kariyer ilerlemesi: won[lig] = o ligde sırayla yenilen rakip sayısı (5 = şampiyon),
  // stars[lig-maç] = en iyi yıldız, li/mi = seçili lig ve maç
  const career = (() => {
    const v = store.get('career', null) || {};
    const int = (x, a, b) => clamp(Math.floor(Number(x)) || 0, a, b);
    const won = {};
    for (const l of LEAGUES) won[l] = int(v.won && v.won[l], 0, 5);
    return { won, stars: v.stars && typeof v.stars === 'object' ? v.stars : {}, li: int(v.li, 0, 7), mi: int(v.mi, 0, 4) };
  })();

  const settings = {
    mode: store.get('mode', 'ai'),
    sound: store.get('sound', true),
    volume: clamp(Number(store.get('volume', 1)) || 0, 0, 1),
    music: store.get('music', true),
    skin: hasSkin(store.get('skin', 'classic')) ? store.get('skin', 'classic') : 'classic',
    puck: hasPuck(store.get('puck', 'theme')) ? store.get('puck', 'theme') : 'theme',
    musicVol: clamp(Number(store.get('musicVol', 0.6)), 0, 1) || 0,
    theme: isUnlocked(savedTheme) ? savedTheme : 'water',
    lang: LANG,
  };

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Ses (Web Audio ile sentezlenir, dosya gerekmez)
  // ---------------------------------------------------------------------------
  const Sound = {
    ctx: null, bus: null, rev: null, noiseBuf: null, last: {},
    init() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();

      // Ana hat: sesler → bus → sıkıştırıcı → kazanç → sınırlayıcı → hoparlör
      this.bus = c.createGain();
      this.bus.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 12;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const makeup = c.createGain();
      makeup.gain.value = 1.6;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      this.bus.connect(comp);
      comp.connect(makeup);
      makeup.connect(limiter);
      // Oyuncunun ses seviyesi: sınırlayıcıdan sonra, en sonda uygulanır
      this.master = c.createGain();
      this.master.gain.value = this.level();
      limiter.connect(this.master);
      this.master.connect(c.destination);

      // Yankı (oda hissi): üretilmiş dürtü yanıtıyla evrişim
      const len = Math.floor(c.sampleRate * 1.3);
      const ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const conv = c.createConvolver();
      conv.buffer = ir;
      this.rev = c.createGain();
      this.rev.gain.value = 0.5;
      this.rev.connect(conv);
      conv.connect(this.bus);

      const nlen = Math.floor(c.sampleRate * 1.5);
      const buf = c.createBuffer(1, nlen, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.ambient(settings.theme);
      Music.init(c, this.master, ir, buf);
    },
    // Temaya göre döngüsel ambiyans: su → havuz uğultusu; buz → arena uğultusu + diskin kayma sesi
    ambient(theme) {
      if (!this.ctx || this.ambTheme === theme) return;
      const c = this.ctx, t = c.currentTime;
      if (this.amb) {
        for (const n of this.amb.stop) n.stop(t + 0.8);
        this.amb.out.gain.cancelScheduledValues(t);
        this.amb.out.gain.setTargetAtTime(0, t, 0.15);
        this.amb = null;
        this.scrapeNode = null;
      }
      this.ambTheme = theme;
      if (!['water', 'ice', 'lava', 'sand', 'space', 'crystal', 'mud'].includes(theme)) return;
      const loop = () => {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        return src;
      };
      // Eski Safari'de connect() zincirlenemez: düğümleri tek tek bağla
      const chain = (...nodes) => {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      };
      const filt = (type, f, q, gain) => {
        const n = c.createBiquadFilter();
        n.type = type;
        n.frequency.value = f;
        n.Q.value = q;
        if (gain !== undefined) n.gain.value = gain;
        return n;
      };
      const out = c.createGain();
      out.gain.value = 1;
      out.connect(this.bus);
      const stop = [];
      if (theme === 'water') {
        const src = loop();
        const g = c.createGain();
        g.gain.value = 0.07;
        // Yavaş dalgalanma (dalgaların kıyıya vurması hissi)
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.23;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 0.03;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        chain(src, filt('lowpass', 520, 0.4), filt('peaking', 260, 1, 5), g, out);
        src.start();
        lfo.start();
        stop.push(src, lfo);
      } else if (theme === 'lava') {
        // Yerin derinlerinden gelen gürleme, yavaşça kabarıp inen
        const rum = loop();
        const rg = c.createGain();
        rg.gain.value = 0.09;
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.13;
        const lg = c.createGain();
        lg.gain.value = 0.04;
        lfo.connect(lg);
        lg.connect(rg.gain);
        chain(rum, filt('lowpass', 95, 0.8), filt('peaking', 55, 1.2, 6), rg, out);
        // Uzaktan gelen ateş hışırtısı
        const fire = loop();
        const fg = c.createGain();
        fg.gain.value = 0.012;
        chain(fire, filt('bandpass', 2400, 0.5), fg, out);
        rum.start();
        fire.start();
        lfo.start();
        stop.push(rum, fire, lfo);
      } else if (theme === 'sand') {
        // Çölde esen rüzgâr: yavaşça kabarıp dinen, perdesi hafifçe kayan uğultu
        const wind = loop();
        const wf = filt('bandpass', 420, 0.9);
        const wg = c.createGain();
        wg.gain.value = 0.05;
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.09;
        const lg = c.createGain();
        lg.gain.value = 0.03;
        lfo.connect(lg);
        lg.connect(wg.gain);
        const lfo2 = c.createOscillator();
        lfo2.frequency.value = 0.17;
        const lg2 = c.createGain();
        lg2.gain.value = 160;
        lfo2.connect(lg2);
        lg2.connect(wf.frequency);
        chain(wind, filt('lowpass', 1400, 0.5), wf, wg, out);
        // Uzaktan savrulan ince kum
        const dust = loop();
        const dg = c.createGain();
        dg.gain.value = 0.008;
        chain(dust, filt('highpass', 5000, 0.5), dg, out);
        // Raket ve disklerin kumu sürme hışırtısı: kazancı setScrape ile değişir
        const sc = loop();
        const sg = c.createGain();
        sg.gain.value = 0;
        chain(sc, filt('bandpass', 1800, 0.6), filt('lowpass', 4200, 0.7), sg, out);
        wind.start();
        dust.start();
        sc.start();
        lfo.start();
        lfo2.start();
        this.scrapeNode = sg;
        stop.push(wind, dust, sc, lfo, lfo2);
      } else if (theme === 'space') {
        // Derin sentezleyici dronu: hafif akortsuz iki testere dişi, yavaşça açılıp kapanan filtre
        const f = filt('lowpass', 200, 2.5);
        const dg = c.createGain();
        dg.gain.value = 0.035;
        const oscs = [[55, 'sawtooth'], [55.35, 'sawtooth'], [82.6, 'sine'], [110.2, 'triangle']].map(([hz, type]) => {
          const o = c.createOscillator();
          o.type = type;
          o.frequency.value = hz;
          o.connect(f);
          return o;
        });
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.06;
        const lg = c.createGain();
        lg.gain.value = 130;
        lfo.connect(lg);
        lg.connect(f.frequency);
        chain(f, dg, out);
        // Uzak kozmik esinti
        const air = loop();
        const af = filt('bandpass', 2600, 3);
        const ag = c.createGain();
        ag.gain.value = 0.012;
        const lfo2 = c.createOscillator();
        lfo2.frequency.value = 0.045;
        const lg2 = c.createGain();
        lg2.gain.value = 1400;
        lfo2.connect(lg2);
        lg2.connect(af.frequency);
        chain(air, af, ag, out);
        // Diskin hızına göre yükselen çekim uğultusu (setScrape)
        const hum = c.createOscillator();
        hum.type = 'sawtooth';
        hum.frequency.value = 73.4;
        const hum2 = c.createOscillator();
        hum2.type = 'sawtooth';
        hum2.frequency.value = 110.4;
        const hf = filt('lowpass', 900, 4);
        const hg = c.createGain();
        hg.gain.value = 0;
        hum.connect(hf);
        hum2.connect(hf);
        chain(hf, hg, out);
        for (const o of [...oscs, lfo, air, lfo2, hum, hum2]) o.start();
        this.scrapeNode = hg;
        stop.push(...oscs, lfo, air, lfo2, hum, hum2);
      } else if (theme === 'crystal') {
        // Mağara: derinden esen, yavaşça kabarıp inen hava + çok hafif kristal uğultusu
        const cave = loop();
        const cg = c.createGain();
        cg.gain.value = 0.06;
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.07;
        const lg = c.createGain();
        lg.gain.value = 0.03;
        lfo.connect(lg);
        lg.connect(cg.gain);
        chain(cave, filt('lowpass', 260, 0.7), filt('peaking', 110, 1, 4), cg, out);
        // Kristallerin sessiz rezonansı: C ve G, çok hafif, yavaşça dalgalanan
        const res = [261.63, 392, 523.25].map((hz, i) => {
          const o = c.createOscillator();
          o.frequency.value = hz * (1 + (i - 1) * 0.0015);
          return o;
        });
        const rg = c.createGain();
        rg.gain.value = 0.006;
        res.forEach((o) => o.connect(rg));
        chain(rg, out);
        // Diskin kristaller üzerinde kayma sesi (setScrape): ince cam hışırtısı
        const sc = loop();
        const sg = c.createGain();
        sg.gain.value = 0;
        chain(sc, filt('bandpass', 5200, 1.2), sg, out);
        for (const o of [cave, lfo, ...res, sc]) o.start();
        this.scrapeNode = sg;
        stop.push(cave, lfo, ...res, sc);
      } else if (theme === 'mud') {
        // Bataklık gecesi: alçak, nemli hava + uzaktan sürekli cırcır böceği korosu
        const air = loop();
        const ag = c.createGain();
        ag.gain.value = 0.04;
        chain(air, filt('lowpass', 380, 0.6), ag, out);
        const chorus = loop();
        const cg = c.createGain();
        cg.gain.value = 0.004;
        const trem = c.createOscillator();
        trem.frequency.value = 13;
        const tg = c.createGain();
        tg.gain.value = 0.003;
        trem.connect(tg);
        tg.connect(cg.gain);
        chain(chorus, filt('bandpass', 4400, 9), cg, out);
        // Diskin ve raketlerin çamuru yarma sesi (setScrape): boğuk şapırtı
        const sc = loop();
        const sg = c.createGain();
        sg.gain.value = 0;
        chain(sc, filt('lowpass', 420, 1.5), filt('peaking', 240, 2, 6), sg, out);
        for (const o of [air, chorus, trem, sc]) o.start();
        this.scrapeNode = sg;
        stop.push(air, chorus, trem, sc);
      } else {
        // Soğuk arena uğultusu
        const hum = loop();
        const hg = c.createGain();
        hg.gain.value = 0.045;
        chain(hum, filt('lowpass', 170, 0.6), hg, out);
        hum.start();
        // Diskin buzda kayma sesi: kazancı hıza göre setScrape ile değişir
        const sc = loop();
        const sg = c.createGain();
        sg.gain.value = 0;
        chain(sc, filt('bandpass', 3400, 0.7), filt('highshelf', 6000, 0.7, -6), sg, out);
        sc.start();
        this.scrapeNode = sg;
        stop.push(hum, sc);
      }
      this.amb = { out, stop };
    },
    setScrape(level) {
      if (this.scrapeNode) this.scrapeNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.06);
    },
    // Buhar tıslaması: sıcak kabuğa değen darbe
    sizzle(k, x) {
      if (!this.ok('sizzle', 0.05)) return;
      const pan = this.panOf(x);
      this.noise({ dur: 0.18 + k * 0.4, vol: 0.12 + k * 0.3, type: 'highpass', freq: 3800, attack: 0.01, pan, rev: 0.2 });
      this.noise({ dur: 0.1 + k * 0.2, vol: 0.06 + k * 0.15, freq: 7000, freqTo: 4000, q: 0.8, pan });
    },
    // Kabuk kırılıp lav fışkırır: kaya çatırtısı + boğuk patlama + buhar
    eruption(e, x) {
      if (!this.ok('eruption', 0.08)) return;
      e = clamp(e, 0, 1.3);
      const pan = this.panOf(x);
      this.tone({ f0: 110 + e * 30, f1: 36, dur: 0.45 + e * 0.35, vol: 0.5 + e * 0.4, pan: pan * 0.5, rev: 0.3 });
      this.noise({ dur: 0.5 + e * 0.5, vol: 0.3 + e * 0.35, type: 'lowpass', freq: 1400, freqTo: 120, q: 0.7, pan, rev: 0.35 });
      const n = 5 + Math.round(e * 10);
      for (let i = 0; i < n; i++) {
        const t = 0.01 + Math.pow(Math.random(), 1.6) * (0.15 + e * 0.25);
        this.noise({ dur: 0.008 + Math.random() * 0.02, vol: 0.15 + e * 0.3 * Math.random(), freq: 700 + Math.random() * 1500, q: 1.5, delay: t, pan });
      }
      this.noise({ dur: 0.5 + e * 0.6, vol: 0.1 + e * 0.18, type: 'highpass', freq: 4200, delay: 0.08, attack: 0.08, pan, rev: 0.3 });
    },
    // Kuma gömülü, boğuk "tok" vuruş + kısa kum hışırtısı
    sandHit(k, x) {
      if (!this.ok('hit', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 210 + k * 90, f1: 62, dur: 0.13, vol: 0.9 + k * 0.6, pan, lp: 900 });
      this.tone({ f0: 520 + k * 200, f1: 240, dur: 0.05, type: 'triangle', vol: 0.18 + k * 0.2, pan, lp: 1400 });
      this.noise({ dur: 0.07 + k * 0.08, vol: 0.35 + k * 0.4, type: 'lowpass', freq: 800, freqTo: 180, q: 0.8, pan });
      this.noise({ dur: 0.12 + k * 0.25, vol: 0.06 + k * 0.16, freq: 1900, q: 0.7, attack: 0.01, pan });
      if (k > 0.55) this.tone({ f0: 100, f1: 40, dur: 0.22, vol: 0.7 * k, pan: pan * 0.5 });
    },
    // Savrulan kum: yağmur gibi dökülen taneler + genişleyen hışırtı
    sandBlast(e, x) {
      if (!this.ok('sandBlast', 0.08)) return;
      e = clamp(e, 0, 1.3);
      const pan = this.panOf(x);
      this.tone({ f0: 95 + e * 20, f1: 45, dur: 0.18 + e * 0.15, vol: 0.25 + e * 0.3, pan: pan * 0.5 });
      this.noise({ dur: 0.35 + e * 0.6, vol: 0.12 + e * 0.22, freq: 2200, freqTo: 900, q: 0.6, attack: 0.02, pan, rev: 0.15 });
      const n = 6 + Math.round(e * 14);
      for (let i = 0; i < n; i++) {
        const t = 0.1 + Math.random() * (0.3 + e * 0.5);
        this.noise({ dur: 0.01 + Math.random() * 0.02, vol: 0.03 + e * 0.06 * Math.random(), type: 'highpass', freq: 3000 + Math.random() * 4000, delay: t, pan: clamp(pan + (Math.random() - 0.5) * 0.5, -1, 1) });
      }
    },
    // Uzay vuruşu: sentezleyici darbesi + uyumsuz kısmilerle metalik çınlama
    spaceHit(k, x) {
      if (!this.ok('hit', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 190 + k * 110, f1: 48, dur: 0.16, type: 'sawtooth', vol: 0.5 + k * 0.4, pan, lp: 700 });
      this.tone({ f0: 150 + k * 60, f1: 55, dur: 0.13, vol: 0.7 + k * 0.5, pan });
      this.noise({ dur: 0.03, vol: 0.3 + k * 0.4, type: 'highpass', freq: 3500, pan });
      this.spaceRing(0.35 + k * 0.65, x, true);
    },
    // Metalik çınlama: çan benzeri uyumsuz kısmiler (1 : 2.76 : 5.40 : 8.93)
    spaceRing(k, x, force) {
      if (!force && !this.ok('ring', 0.06)) return;
      const pan = this.panOf(x);
      const f = 540 + Math.random() * 80 + k * 160;
      [[1, 0.9, 0.2], [2.76, 0.5, 0.12], [5.4, 0.3, 0.07], [8.93, 0.18, 0.04]].forEach(([r, d, v]) => {
        this.tone({ f0: f * r, f1: f * r * 0.995, dur: d * (0.5 + k * 0.7), vol: v * (0.4 + k), pan, rev: 0.35 });
      });
    },
    // İki kütle çarpışması: bükülen uzay "vuuv" + metal çınlama
    warp(k, x) {
      if (!this.ok('warp', 0.08)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 420 + k * 200, f1: 70, dur: 0.45 + k * 0.3, type: 'triangle', vol: 0.25 + k * 0.3, pan, rev: 0.4 });
      this.spaceRing(0.5 + k * 0.5, x, true);
    },
    // Süpernova: derin patlama, yükselen parıltı, uzun kuyruk
    supernova(x) {
      if (!this.ok('nova', 0.3)) return;
      const pan = this.panOf(x) * 0.5;
      this.tone({ f0: 95, f1: 22, dur: 1.6, vol: 0.9, pan });
      this.tone({ f0: 58, f1: 30, dur: 1.2, type: 'sawtooth', vol: 0.3, pan, lp: 300 });
      this.noise({ dur: 1.8, vol: 0.45, type: 'lowpass', freq: 4200, freqTo: 70, q: 1.2, pan, rev: 0.5 });
      [880, 1318.5, 1760, 2637].forEach((f, i) => {
        this.tone({ f0: f * 0.5, f1: f, dur: 1.1, vol: 0.05, delay: 0.05 + i * 0.07, pan: (i % 2 ? 1 : -1) * 0.5, rev: 0.6, detune: i * 5 });
      });
    },
    // Kristal çanı: berrak temel + hafif akortsuz ikizi (parıltılı çınlama) + cam kısmileri
    // (1 : 2.61 : 4.9). strike: raket vuruşunun tok gövdesi de eklenir.
    bell(f, k, x, strike, name = 'bell') {
      if (!this.ok(name, 0.035)) return;
      const pan = this.panOf(x);
      k = clamp(k, 0, 1);
      const v = 0.2 + k * 0.35;
      this.tone({ f0: f, f1: f, dur: 1.4 + k * 1.2, vol: v, pan, rev: 0.55, attack: 0.002 });
      this.tone({ f0: f * 1.004, f1: f * 1.004, dur: 1.2 + k, vol: v * 0.45, pan: -pan * 0.3, rev: 0.55 });
      this.tone({ f0: f * 2.61, f1: f * 2.6, dur: 0.5 + k * 0.4, vol: v * 0.22, pan, rev: 0.45 });
      this.tone({ f0: f * 4.9, f1: f * 4.88, dur: 0.22 + k * 0.2, vol: v * 0.12, pan, rev: 0.4 });
      this.noise({ dur: 0.02, vol: 0.12 + k * 0.25, type: 'highpass', freq: 6500, pan });
      if (strike) {
        this.tone({ f0: 200 + k * 80, f1: 70, dur: 0.1, vol: 0.4 + k * 0.4, pan, lp: 900 });
      }
    },
    // Golde yükselen kristal arpeji (golün girdiği kristalin notasından başlar)
    chime(f, x) {
      if (!this.ok('chime', 0.3)) return;
      const steps = [0, 2, 4, 7, 9, 12, 14, 16];
      steps.forEach((st, i) => {
        const g = f * Math.pow(2, st / 12);
        this.tone({ f0: g, f1: g, dur: 1.6, vol: 0.14, delay: 0.1 + i * 0.075, pan: ((i % 3) - 1) * 0.5, rev: 0.6 });
        this.tone({ f0: g * 2.61, f1: g * 2.6, dur: 0.4, vol: 0.03, delay: 0.1 + i * 0.075, rev: 0.5 });
      });
    },
    // Mağarada damlayan su
    drip(x) {
      if (!this.ok('drip', 0.5)) return;
      const f = 900 + Math.random() * 700;
      const pan = this.panOf(x);
      this.tone({ f0: f * 1.5, f1: f * 0.7, dur: 0.09, vol: 0.05, pan, rev: 0.8 });
    },
    // Çamura vuruş: boğuk gövde + ıslak "vıcık" (hızla kapanan ünlü benzeri süpürme)
    mudHit(k, x) {
      if (!this.ok('hit', 0.04)) return;
      const pan = this.panOf(x);
      k = clamp(k, 0, 1);
      this.tone({ f0: 170 + k * 60, f1: 55, dur: 0.12, vol: 0.75 + k * 0.5, pan, lp: 600 });
      this.noise({ dur: 0.09 + k * 0.06, vol: 0.3 + k * 0.35, freq: 1100 + k * 300, freqTo: 260, q: 4, pan });
      this.noise({ dur: 0.07, vol: 0.12 + k * 0.2, freq: 2400, freqTo: 700, q: 3, delay: 0.035, pan });
      this.tone({ f0: 320 + k * 80, f1: 140, dur: 0.07, vol: 0.12 + k * 0.1, delay: 0.02, pan, lp: 900 });
    },
    // Çamur sıçraması: şap + düşen çamur damlalarının şıpırtısı
    mudSplash(e, x) {
      if (!this.ok('mudSplash', 0.08)) return;
      e = clamp(e, 0, 1.3);
      const pan = this.panOf(x);
      this.noise({ dur: 0.25 + e * 0.35, vol: 0.22 + e * 0.3, type: 'lowpass', freq: 1500, freqTo: 160, q: 1.4, pan });
      const n = 4 + Math.round(e * 10);
      for (let i = 0; i < n; i++) {
        const t = 0.12 + Math.random() * (0.25 + e * 0.35);
        const f = 500 + Math.random() * 700;
        this.noise({ dur: 0.03 + Math.random() * 0.03, vol: 0.05 + e * 0.08 * Math.random(), freq: f, freqTo: f * 0.5, q: 3, delay: t, pan: clamp(pan + (Math.random() - 0.5) * 0.6, -1, 1) });
      }
    },
    // Çamur kabarcığının patlaması: perdesi yükselen "blop"
    blop(r, x) {
      if (!this.ok('blop', 0.12)) return;
      const pan = this.panOf(x);
      const f = 260 - r * 12 + Math.random() * 60;
      this.tone({ f0: f, f1: f * 2.1, dur: 0.07 + r * 0.004, vol: 0.13 + r * 0.008, pan, rev: 0.15 });
      this.tone({ f0: f * 0.5, f1: f * 0.8, dur: 0.1, vol: 0.08, pan, lp: 500 });
    },
    // Arka plan canlıları (menüde de duyulur)
    critterOk() {
      return this.ctx && settings.sound && settings.volume > 0 && !document.hidden;
    },
    cricket(x) {
      if (!this.critterOk()) return;
      const pan = this.panOf(x) * 0.8;
      const f = 4300 + Math.random() * 500, n = 3 + ((Math.random() * 3) | 0), reps = 1 + ((Math.random() * 3) | 0);
      for (let r = 0; r < reps; r++) {
        for (let i = 0; i < n; i++) {
          this.tone({ f0: f, f1: f * 0.99, dur: 0.018, vol: 0.022, delay: r * 0.32 + i * 0.045, pan, attack: 0.003 });
        }
      }
    },
    frog(x) {
      if (!this.critterOk()) return;
      const pan = this.panOf(x) * 0.8;
      const f = 95 + Math.random() * 60, n = 2 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) {
        this.tone({ f0: f * 1.25, f1: f, dur: 0.07, type: 'sawtooth', vol: 0.05, delay: i * 0.11, pan, lp: 650, rev: 0.25 });
        this.tone({ f0: f * 2.5, f1: f * 2, dur: 0.05, type: 'square', vol: 0.012, delay: i * 0.11 + 0.01, pan, lp: 1400 });
      }
    },
    // Lav kabarcığı patlaması
    bloop(x) {
      if (!this.ok('bloop', 0.3)) return;
      const f = 90 + Math.random() * 70;
      this.tone({ f0: f * 1.6, f1: f, dur: 0.14, vol: 0.12, pan: this.panOf(x) * 0.6, rev: 0.2 });
      this.noise({ dur: 0.06, vol: 0.05, type: 'lowpass', freq: 500, delay: 0.1 });
    },
    // Buz çatlaması: tok vuruşun ardından cam kırılmasını andıran ince çıtırtılar; güçlü
    // çatlakta donmuş göllere özgü, perdesi hızla inen yayılım çınlaması ("pıuv")
    crackle(e, x) {
      if (!this.ok('crackle', 0.06)) return;
      e = clamp(e, 0, 1.2);
      const pan = this.panOf(x);
      const n = 8 + Math.round(e * 22);
      for (let i = 0; i < n; i++) {
        // Çatlak yayıldıkça önce sık, sonra seyrek çıtırtılar
        const t = 0.025 + Math.pow(Math.random(), 1.8) * (0.18 + e * 0.35);
        const p = clamp(pan + (Math.random() - 0.5) * 0.35, -1, 1);
        this.noise({ dur: 0.004 + Math.random() * 0.01, vol: 0.12 + e * 0.32 * Math.random(), type: 'highpass', freq: 2500 + Math.random() * 4500, delay: t, pan: p });
        if (Math.random() < 0.45) {
          const f = 2200 + Math.random() * 4200;
          this.tone({ f0: f, f1: f * 0.92, dur: 0.02 + Math.random() * 0.05, vol: 0.05 + e * 0.07, delay: t, pan: p, rev: 0.25 });
        }
      }
      // Buz levhasının kırılma çatırtısı
      this.noise({ dur: 0.06 + e * 0.08, vol: 0.22 + e * 0.35, freq: 1800, freqTo: 900, q: 1.4, delay: 0.02, pan });
      if (e > 0.6) {
        this.tone({ f0: 2600, f1: 260, dur: 0.35 + e * 0.2, vol: 0.09 + e * 0.06, delay: 0.05, pan, rev: 0.45 });
        this.tone({ f0: 1900, f1: 190, dur: 0.4 + e * 0.2, type: 'triangle', vol: 0.05, delay: 0.09, pan, rev: 0.5 });
      }
    },
    // Su sıçraması: süpürülen gürültü + yükselen kabarcık sesleri (kabarcık yükseldikçe perdesi artar)
    splash(k, x) {
      if (!this.ok('splash', 0.05)) return;
      const pan = this.panOf(x);
      this.noise({ dur: 0.16 + k * 0.28, vol: 0.2 + k * 0.5, freq: 1500 + k * 900, freqTo: 320, q: 0.9, pan, rev: 0.25 });
      this.noise({ dur: 0.08, vol: 0.12 + k * 0.25, type: 'highpass', freq: 5000, pan });
      const nb = 2 + Math.round(k * 4);
      for (let i = 0; i < nb; i++) {
        const f = 380 + Math.random() * 760;
        this.tone({ f0: f, f1: f * 1.9, dur: 0.045 + Math.random() * 0.05, vol: 0.06 + k * 0.1, delay: 0.03 + Math.random() * 0.2, pan, rev: 0.15 });
      }
    },
    // Kaydırıcı değeri kulağa doğrusal gelsin diye karesi alınır (%50 ≈ yarı yükseklik hissi)
    level() {
      if (this.adMute) return 0; // reklam oynarken oyun sesi kısılır
      if (this.platformMute) return 0; // CrazyGames "sesi kapat" ayarı oyun içi ayardan önce gelir
      return settings.sound ? settings.volume * settings.volume : 0;
    },
    applyVolume() {
      if (!this.master) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.level(), t, 0.03);
    },
    // Kaydırırken seviyeyi duyurmak için kısa örnek vuruş
    preview() {
      if (!this.ctx || !settings.sound || settings.volume <= 0) return;
      const t = this.ctx.currentTime;
      if (this.lastPreview !== undefined && t - this.lastPreview < 0.12) return;
      this.lastPreview = t;
      this.tone({ f0: 300, f1: 70, dur: 0.14, vol: 1 });
      this.tone({ f0: 1000, f1: 400, dur: 0.08, type: 'triangle', vol: 0.55 });
      this.noise({ dur: 0.035, vol: 0.8, type: 'highpass', freq: 2800, q: 0.7 });
    },
    ok(name, gap) {
      if (!this.ctx || !settings.sound || settings.volume <= 0 || game.state === 'demo') return false;
      const t = this.ctx.currentTime;
      if (this.last[name] !== undefined && t - this.last[name] < gap) return false;
      this.last[name] = t;
      return true;
    },
    // Masadaki x konumuna göre sağ/sol (stereo) yerleşim
    route(node, pan, rev) {
      const c = this.ctx;
      let out = node;
      if (pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        node.connect(p);
        out = p;
      }
      out.connect(this.bus);
      if (rev) {
        const s = c.createGain();
        s.gain.value = rev;
        out.connect(s);
        s.connect(this.rev);
      }
    },
    env(g, t, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    tone({ f0, f1 = 0, dur, type = 'sine', vol, delay = 0, attack = 0.004, pan = 0, rev = 0, lp = 0, detune = 0 }) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g, t, vol, attack, dur);
      let node = o;
      if (lp) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lp;
        o.connect(f);
        node = f;
      }
      node.connect(g);
      this.route(g, pan, rev);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noise({ dur, vol, type = 'bandpass', freq, freqTo = 0, q = 1, delay = 0, attack = 0.002, pan = 0, rev = 0 }) {
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
      f.Q.value = q;
      const g = c.createGain();
      this.env(g, t, vol, attack, dur);
      s.connect(f);
      f.connect(g);
      this.route(g, pan, rev);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.05);
    },
    panOf(x) {
      return x === undefined ? 0 : ((x / W) * 2 - 1) * 0.75;
    },

    // Raket vuruşu: gövde "tok" + tınılı çarpma + keskin tık; sert vuruşta alt bas ve yankı
    hit(k, x) {
      if (!this.ok('hit', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 240 + k * 140, f1: 70, dur: 0.14, vol: 0.85 + k * 0.6, pan });
      this.tone({ f0: 760 + k * 520, f1: 320, dur: 0.08, type: 'triangle', vol: 0.42 + k * 0.45, pan });
      this.noise({ dur: 0.035, vol: 0.55 + k * 0.6, type: 'highpass', freq: 2800, q: 0.7, pan });
      if (k > 0.55) {
        this.tone({ f0: 110, f1: 42, dur: 0.24, vol: 0.8 * k, pan: pan * 0.5, rev: 0.25 });
        this.noise({ dur: 0.12, vol: 0.25 * k, freq: 1600, freqTo: 400, q: 0.8, pan, rev: 0.3 });
      }
    },
    // Duvar sekmesi: kısa bas vuruşu + tahta tıkırtısı
    wall(k, x) {
      if (!this.ok('wall', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 170 + k * 80, f1: 65, dur: 0.11, vol: 0.6 + k * 0.55, pan });
      this.noise({ dur: 0.06, vol: 0.35 + k * 0.5, freq: 950, q: 1.2, pan });
      this.tone({ f0: 1250 + k * 400, f1: 700, dur: 0.035, type: 'square', vol: 0.05 + k * 0.08, pan, lp: 3500 });
    },
    // İki pakın çarpışması: metalik "çak"
    clack(k, x) {
      if (!this.ok('clack', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 1850, f1: 1300, dur: 0.06, type: 'triangle', vol: 0.4 + k * 0.45, pan });
      this.tone({ f0: 2630, f1: 1900, dur: 0.05, type: 'triangle', vol: 0.25 + k * 0.3, pan });
      this.noise({ dur: 0.035, vol: 0.45 + k * 0.45, type: 'highpass', freq: 4500, pan });
    },
    // Gol: bas patlaması + süpürülen patlama gürültüsü + tezahürat + arpej (yankılı)
    goal(good, x) {
      if (!this.ok('goal', 0.3)) return;
      const pan = this.panOf(x) * 0.6;
      this.tone({ f0: 140, f1: 32, dur: 0.75, vol: 1, pan });
      this.noise({ dur: 1.0, vol: 0.7, type: 'lowpass', freq: 5000, freqTo: 180, q: 0.8, pan, rev: 0.35 });
      if (good) {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, i) => {
          const last = i === notes.length - 1;
          const d = last ? 0.7 : 0.26;
          this.tone({ f0: n, dur: d, type: 'sawtooth', vol: 0.13, delay: 0.05 + i * 0.085, lp: 3200, detune: -8, rev: 0.4 });
          this.tone({ f0: n, dur: d, type: 'sawtooth', vol: 0.13, delay: 0.05 + i * 0.085, lp: 3200, detune: 8, rev: 0.4 });
          this.tone({ f0: n * 2, dur: d * 0.8, type: 'triangle', vol: 0.09, delay: 0.05 + i * 0.085, rev: 0.4 });
        });
        // Tezahürat: yükselip sönen kalabalık uğultusu
        this.noise({ dur: 1.6, vol: 0.32, freq: 1100, q: 0.6, delay: 0.1, attack: 0.25, rev: 0.5 });
        this.noise({ dur: 1.4, vol: 0.18, freq: 2600, q: 0.9, delay: 0.15, attack: 0.3, rev: 0.5 });
      } else {
        [392, 369.99, 349.23, 293.66].forEach((n, i) => {
          const last = i === 3;
          this.tone({ f0: n, f1: last ? n * 0.94 : 0, dur: last ? 0.6 : 0.2, type: 'sawtooth', vol: 0.14, delay: 0.1 + i * 0.16, lp: 1400, rev: 0.3 });
        });
      }
    },
    beep(hi) {
      if (!this.ok(hi ? 'beepHi' : 'beep', 0.1)) return;
      if (hi) {
        this.tone({ f0: 1046.5, dur: 0.4, vol: 0.4, rev: 0.3 });
        this.tone({ f0: 1567.98, dur: 0.4, type: 'triangle', vol: 0.2, rev: 0.3 });
        this.tone({ f0: 523.25, dur: 0.3, type: 'square', vol: 0.1, lp: 2000 });
        this.noise({ dur: 0.25, vol: 0.2, type: 'highpass', freq: 3000, freqTo: 8000 });
      } else {
        this.tone({ f0: 659.25, dur: 0.16, vol: 0.65 });
        this.tone({ f0: 1318.5, dur: 0.1, type: 'triangle', vol: 0.22 });
        this.tone({ f0: 329.63, dur: 0.12, type: 'square', vol: 0.08, lp: 1500 });
      }
    },
    tick(urgent) {
      if (!this.ok('tick', 0.3)) return;
      this.tone({ f0: urgent ? 1400 : 1000, dur: 0.08, type: 'square', vol: urgent ? 0.32 : 0.2, lp: 4000 });
      if (urgent) this.tone({ f0: 180, f1: 90, dur: 0.12, vol: 0.6 });
    },
    // İkinci top: siren + yükselen süpürme + vuruş + akor
    frenzy() {
      if (!this.ok('frenzy', 1)) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(1100, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.75);
      this.env(g, t, 0.14, 0.02, 0.8);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      o.connect(f);
      f.connect(g);
      this.route(g, 0, 0.3);
      o.start(t);
      o.stop(t + 0.85);
      this.noise({ dur: 0.75, vol: 0.35, type: 'highpass', freq: 400, freqTo: 7000, attack: 0.6 });
      this.tone({ f0: 150, f1: 38, dur: 0.6, vol: 0.9, delay: 0.72 });
      this.noise({ dur: 0.6, vol: 0.45, type: 'lowpass', freq: 4000, freqTo: 200, delay: 0.72, rev: 0.4 });
      [659.25, 830.61, 987.77, 1318.5].forEach((n, i) => {
        this.tone({ f0: n, dur: 0.5, type: 'sawtooth', vol: 0.09, delay: 0.72 + i * 0.03, lp: 3500, rev: 0.45 });
      });
    },
    // Dev Kale: yükselen süpürme + akor; Kale Kilidi: metalik kilit + kalkan uğultusu
    skill(key) {
      if (!this.ok('skill', 0.15)) return;
      if (key === 'grow') {
        this.tone({ f0: 160, f1: 760, dur: 0.45, type: 'sawtooth', vol: 0.22, lp: 2200, rev: 0.3 });
        this.tone({ f0: 320, f1: 1520, dur: 0.4, type: 'triangle', vol: 0.12, rev: 0.3 });
        this.noise({ dur: 0.45, vol: 0.28, freq: 500, freqTo: 3500, q: 0.8, attack: 0.2 });
        this.tone({ f0: 659.25, dur: 0.35, type: 'triangle', vol: 0.18, delay: 0.38, rev: 0.4 });
        this.tone({ f0: 987.77, dur: 0.35, type: 'triangle', vol: 0.14, delay: 0.42, rev: 0.4 });
        this.tone({ f0: 120, f1: 50, dur: 0.3, vol: 0.5, delay: 0.38 });
      } else {
        this.tone({ f0: 1400, f1: 850, dur: 0.07, type: 'square', vol: 0.2, lp: 3200 });
        this.tone({ f0: 2100, dur: 0.18, type: 'triangle', vol: 0.18, rev: 0.25 });
        this.noise({ dur: 0.05, vol: 0.5, type: 'highpass', freq: 3000 });
        this.tone({ f0: 900, f1: 600, dur: 0.06, type: 'square', vol: 0.15, delay: 0.09, lp: 3000 });
        this.tone({ f0: 110, dur: 0.6, vol: 0.45, delay: 0.08, attack: 0.03, rev: 0.2 });
        this.tone({ f0: 220, dur: 0.6, type: 'triangle', vol: 0.12, delay: 0.08, attack: 0.03, rev: 0.3 });
      }
    },
    ready() {
      if (!this.ok('ready', 0.3)) return;
      this.tone({ f0: 1318.5, dur: 0.12, type: 'triangle', vol: 0.2 });
      this.tone({ f0: 1760, dur: 0.18, type: 'triangle', vol: 0.16, delay: 0.07, rev: 0.25 });
    },
    denied() {
      if (!this.ok('denied', 0.25)) return;
      this.tone({ f0: 170, f1: 110, dur: 0.14, type: 'square', vol: 0.2, lp: 900 });
    },
    buzzer() {
      if (!this.ok('buzzer', 1)) return;
      this.tone({ f0: 155.56, dur: 1.1, type: 'sawtooth', vol: 0.3, attack: 0.02, lp: 1800, rev: 0.3 });
      this.tone({ f0: 233.08, dur: 1.1, type: 'square', vol: 0.14, attack: 0.02, lp: 1600, rev: 0.3 });
      this.tone({ f0: 77.78, dur: 1.1, vol: 0.5, attack: 0.02 });
    },
    finale(win) {
      if (!this.ctx || !settings.sound || settings.volume <= 0) return;
      const seq = win
        ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5]
        : [392, 369.99, 349.23, 329.63, 261.63];
      seq.forEach((n, i) => {
        const long = i === seq.length - 1;
        const d = long ? 1.1 : 0.2;
        const at = i * 0.13;
        this.tone({ f0: n, dur: d, type: win ? 'square' : 'sawtooth', vol: win ? 0.11 : 0.09, delay: at, lp: win ? 4000 : 1500, rev: 0.45 });
        this.tone({ f0: n / 2, dur: d, type: 'triangle', vol: 0.16, delay: at, rev: 0.3 });
      });
      const end = (seq.length - 1) * 0.13;
      if (win) {
        this.tone({ f0: 130, f1: 40, dur: 0.8, vol: 0.9, delay: end });
        this.noise({ dur: 2.2, vol: 0.35, freq: 1200, q: 0.6, delay: end, attack: 0.3, rev: 0.5 });
        [1318.5, 1567.98, 2093].forEach((n, i) => this.tone({ f0: n, dur: 1.0, type: 'triangle', vol: 0.08, delay: end + 0.05 + i * 0.04, rev: 0.6 }));
      } else {
        this.tone({ f0: 98, f1: 60, dur: 1.2, type: 'sawtooth', vol: 0.18, delay: end, lp: 600, rev: 0.3 });
      }
    },
  };

  // ---------------------------------------------------------------------------
  // Müzik: her temanın kendi parçası, Web Audio ile anlık üretilir (ses dosyası yok).
  // 16'lık adımlı bir sıralayıcı: akorlar ikişer ölçü sürer, dizi 8 ölçüde bir döner; her ikinci
  // turda (B bölümü) ezgi ve farklı arpej girer. Maç sürerken davul ve arpej tam açılır, menüde ve
  // duraklatmada yalnızca yumuşak katmanlar çalar; son 15 saniyede (ikinci pak) tempo hissi artar.
  // Kalıplar: davulda x tam, o hafif vuruş; basta R kök, 5 beşli, O oktav, b yedili, 3 üçlü;
  // arpej / ezgide rakam akorun notası (4-7 bir oktav üstü); '.' sus.
  // ---------------------------------------------------------------------------
  const MUSIC = {
    // Su: berrak, sakin bir chill parçası (Re majör)
    water: {
      bpm: 92, swing: 0.1,
      chords: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]],
      bass: [38, 35, 31, 33],
      pad: 'soft', keys: 'ep', keysPat: 'x.....x...x.....',
      bassInst: 'round', bassPat: 'R.....R...5...O.',
      arp: 'drop', arpPat: '4...6...5...7...', arpB: '4.6.5...7.6.5...',
      lead: 'drop', leadPat: '7.......6...5...',
      kick: 'x.......x.x.....', snare: '....o.......o...', hat: '..o...o...o...oo', drum: 'soft',
    },
    // Neon: synthwave (La minör)
    neon: {
      bpm: 108, swing: 0, gain: 1.35,
      chords: [[57, 60, 64, 67], [57, 60, 64, 65], [55, 60, 64, 67], [55, 59, 62, 67]],
      bass: [33, 29, 36, 31],
      pad: 'saw', keys: null,
      bassInst: 'saw', bassPat: 'R.R.O.R.R.R.O.R.',
      arp: 'square', arpPat: '0123012301230123', arpB: '0124012401240124',
      lead: 'lead', leadPat: '6.......5...4...',
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', drum: 'synth', fill: true,
    },
    // Buz: kristal çanlar, seyrek ve geniş (Mi minör)
    ice: {
      bpm: 76, swing: 0,
      chords: [[64, 67, 71, 74], [60, 64, 67, 71], [59, 62, 67, 71], [57, 62, 66, 69]],
      bass: [40, 36, 43, 38],
      pad: 'glass', keys: null,
      bassInst: 'round', bassPat: 'R...............',
      arp: 'bell', arpPat: '4...5...6...5...', arpB: '4..56..74..65...',
      lead: 'bell', leadPat: '7.......6.......',
      kick: 'x.........x.....', snare: '................', hat: '....o.......o...', drum: 'soft',
    },
    // Lav: ağır, karanlık ritim (Do minör)
    lava: {
      bpm: 88, swing: 0, gain: 1.3,
      chords: [[60, 63, 67, 70], [56, 60, 63, 67], [53, 56, 60, 63], [55, 59, 62, 65]],
      bass: [36, 32, 29, 31],
      pad: 'dark', keys: null,
      bassInst: 'saw', bassPat: 'R..R..R...R.R..O',
      arp: 'lead', arpPat: '0..2..1...3.....', arpB: '0..2..1...3.2.1.',
      lead: 'lead', leadPat: '6.......5...4...',
      kick: 'x..x..x...x.....', snare: '....x.......x..o', hat: 'x.o.x.o.x.o.x.o.', drum: 'heavy', fill: true,
    },
    // Kum: hicaz makamında ud ve darbuka (Re hicaz)
    sand: {
      bpm: 100, swing: 0.08,
      chords: [[62, 66, 69, 74], [63, 67, 70, 75], [62, 66, 69, 74], [60, 63, 67, 72]],
      bass: [38, 39, 38, 36],
      pad: 'soft', keys: null,
      bassInst: 'round', bassPat: 'R.....R...R.....',
      arp: 'oud', arpPat: '0.1.2.1.0..2.3.2', arpB: '4.3.2.1.2..1.0..',
      lead: 'oud', leadPat: '6.5.4...5.4.3...',
      kick: 'x.....x...x.....', snare: '...o..o.x...o.o.', hat: '..o.......o.....', drum: 'hand',
    },
    // Uzay: rüya gibi geniş tınılar (Fa lidya)
    space: {
      bpm: 80, swing: 0, gain: 1.12,
      chords: [[57, 60, 64, 65], [59, 62, 65, 67], [55, 59, 62, 64], [57, 60, 64, 67]],
      bass: [29, 31, 28, 33],
      pad: 'wide', keys: null,
      bassInst: 'sub', bassPat: 'R.......R.......',
      arp: 'drop', arpPat: '0.1.2.3.4.3.2.1.', arpB: '4.5.6.7.6.5.4.5.',
      lead: 'glide', leadPat: '6.......7.......',
      kick: 'x.........x.....', snare: '................', hat: 'o.o.o.o.o.o.o.o.', drum: 'soft',
    },
    // Kristal: vuruşların çaldığı Do pentatoniğe uyan yumuşak bir zemin; ezgiyi vuruşlar çalar
    crystal: {
      bpm: 84, swing: 0,
      chords: [[60, 62, 64, 67], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]],
      bass: [36, 33, 29, 31],
      pad: 'glass', keys: null,
      bassInst: 'round', bassPat: 'R.......5.......',
      arp: 'bell', arpPat: '4.......6.......', arpB: '4.......6...5...',
      lead: null,
      kick: '................', snare: '................', hat: '....o.......o...', drum: 'soft',
    },
    // Bataklık: ağır aksak bir blues (Mi)
    mud: {
      bpm: 72, swing: 0.3,
      chords: [[52, 56, 59, 62], [57, 61, 64, 67], [52, 56, 59, 62], [59, 63, 66, 69]],
      bass: [40, 45, 40, 47],
      pad: null, keys: 'ep', keysPat: '..x.....x.x.....',
      bassInst: 'round', bassPat: 'R...5...b...5...',
      arp: 'twang', arpPat: '0..2..1...3.....', arpB: '0..2..3..2..1...',
      lead: 'twang', leadPat: '6...5.4...3.....',
      kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', drum: 'soft',
    },
  };
  const BASS_INT = { R: 0, '5': 7, O: 12, b: 10, '3': 4 };
  const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

  const Music = {
    styles: MUSIC, c: null, style: null, theme: null, pending: null, switchAt: 0,
    step: 0, nextT: 0, timer: 0, mode: '', hype: false,
    // Ses bağlamı kurulunca çağrılır. `c` OfflineAudioContext de olabilir (deneme kaydı için).
    init(c, dest, irBuf, noiseBuf) {
      this.c = c;
      this.noise = noiseBuf;
      // tema → katmanlar → mix (geçişlerde kısılır) → hafif sıkıştırıcı → vol (oyuncu ayarı) → dest
      this.vol = c.createGain();
      this.vol.gain.value = this.level();
      this.mix = c.createGain();
      this.mix.gain.value = 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;
      this.mix.connect(comp);
      comp.connect(this.vol);
      this.vol.connect(dest);
      const conv = c.createConvolver();
      conv.buffer = irBuf;
      this.revIn = c.createGain();
      this.revIn.gain.value = 0.55;
      this.revIn.connect(conv);
      conv.connect(this.mix);
      this.layers = {};
      for (const k of ['base', 'arp', 'beat']) {
        const g = c.createGain();
        g.connect(this.mix);
        this.layers[k] = g;
      }
      this.setMode('calm', true);
      if (!(c instanceof (window.OfflineAudioContext || Object))) {
        this.timer = setInterval(() => this.tick(), 50);
      }
      const th = this.theme || settings.theme;
      this.theme = null;
      this.setTheme(th);
    },
    level() {
      return settings.music ? settings.musicVol * settings.musicVol * 0.8 : 0;
    },
    playing() {
      return !!this.c && this.level() > 0 && Sound.level() > 0 && !document.hidden;
    },
    applyVolume() {
      if (!this.vol) return;
      const t = this.c.currentTime;
      this.vol.gain.cancelScheduledValues(t);
      this.vol.gain.setTargetAtTime(document.hidden ? 0 : this.level(), t, 0.08);
    },
    setTheme(th) {
      if (th === this.theme && !this.pending) return;
      this.theme = th;
      if (!this.c) return;
      const t = this.c.currentTime;
      this.mix.gain.cancelScheduledValues(t);
      this.mix.gain.setTargetAtTime(0, t, 0.12);
      this.pending = th;
      this.switchAt = t + (this.style ? 0.5 : 0);
    },
    // Oyunun durumuna göre katmanlar: 'play' tam, 'calm' (menü, maç sonu) yumuşak, 'pause' kısık
    setMode(mode, now) {
      if (mode === this.mode) return;
      this.mode = mode;
      const L = { play: [1, 1, 1], calm: [1, 0.55, 0], pause: [0.55, 0.3, 0] }[mode];
      const t = this.c.currentTime;
      ['base', 'arp', 'beat'].forEach((k, i) => {
        const g = this.layers[k].gain;
        g.cancelScheduledValues(t);
        if (now) g.setValueAtTime(L[i], t);
        else g.setTargetAtTime(L[i], t, k === 'beat' && L[i] > 0 ? 0.05 : 0.35);
      });
    },
    // Her karede: oyun durumunu katmanlara yansıt
    update() {
      if (!this.c) return;
      const st = game.state;
      this.setMode(st === 'play' || st === 'countdown' || st === 'goal' ? 'play' : st === 'paused' ? 'pause' : 'calm');
      this.hype = st === 'play' && game.frenzy;
    },
    tick() {
      const c = this.c;
      if (!c || !this.playing()) {
        this.nextT = 0; // yeniden açılınca ölçü başından, şimdiden başla
        return;
      }
      const now = c.currentTime;
      if (this.pending && now >= this.switchAt) {
        this.style = MUSIC[this.pending] || MUSIC.water;
        this.pending = null;
        this.step = 0;
        this.nextT = now + 0.06;
        this.mix.gain.cancelScheduledValues(now);
        this.mix.gain.setTargetAtTime(this.style.gain || 1, now, 0.3); // temalar aynı yükseklikte duyulsun
      }
      if (!this.style || this.pending) return;
      if (this.nextT < now) { // sekme arka plandaydı ya da yeni açıldı: kaldığı ölçünün başından
        this.step -= this.step % 16;
        this.nextT = now + 0.06;
      }
      const spb = 60 / this.style.bpm / 4;
      while (this.nextT < now + 0.3) {
        this.playStep(this.step, this.nextT);
        this.nextT += spb;
        this.step++;
      }
    },
    // Bir 16'lık adımı t anına yerleştirir
    playStep(i, t) {
      const S = this.style, spb = 60 / S.bpm / 4;
      const bar = Math.floor(i / 16), s = i % 16, n = S.chords.length;
      const ci = Math.floor(bar / 2) % n, chord = S.chords[ci], root = S.bass[ci];
      const B = Math.floor(bar / (2 * n)) % 2 === 1; // B bölümü
      if (s % 2 === 1) t += S.swing * spb;
      const L = this.layers;
      const lenOf = (pat) => { let k = 1; while (k < 16 && pat[(s + k) % 16] === '.') k++; return k * spb; };

      if (s === 0 && bar % 2 === 0 && S.pad) for (const m of chord) this.pad(S.pad, t, m, spb * 32, L.base);
      if (S.keys && S.keysPat[s] === 'x') for (const m of chord) this.voice(S.keys, t, m, lenOf(S.keysPat) * 0.9, 0.5, L.base);
      const bc = S.bassPat[s];
      if (bc !== '.') this.voice(S.bassInst, t, root + BASS_INT[bc], lenOf(S.bassPat) * 0.92, 1, L.base);

      const ap = (B && S.arpB) || S.arpPat;
      if (S.arp && ap[s] !== '.') {
        const d = +ap[s];
        this.voice(S.arp, t, chord[d % 4] + 12 * Math.floor(d / 4), Math.min(lenOf(ap), spb * 6), 0.8, L.arp);
      }
      if (B && S.lead && S.leadPat[s] !== '.') {
        const d = +S.leadPat[s];
        this.voice(S.lead, t, chord[d % 4] + 12 * Math.floor(d / 4), lenOf(S.leadPat) * 0.95, 0.75, L.arp);
      }

      const D = S.drum;
      const hit = (pat) => (pat[s] === 'x' ? 1 : pat[s] === 'o' ? 0.55 : 0);
      if (hit(S.kick)) this.kick(t, hit(S.kick), D);
      let sn = hit(S.snare);
      if (!sn && S.fill && bar % 4 === 3 && s >= 12) sn = 0.25 + (s - 12) * 0.12; // dört ölçüde bir geçiş
      if (sn) this.snare(t, sn, D);
      let hh = hit(S.hat);
      if (!hh && this.hype && s % 2 === 1) hh = 0.35;
      if (hh) this.hat(t, hh, D);
    },

    // --- Tınılar ---
    // Tek osilatörlü nota: zarf + isteğe bağlı süzgeç; `rev` yankı payı
    osc(t, f, { type = 'sine', dur, vol, attack = 0.005, release = 0, lp = 0, lpTo = 0, q = 0.7, detune = 0, glide = 0, dest, rev = 0 }) {
      const c = this.c;
      const o = c.createOscillator();
      o.type = type;
      o.detune.value = detune;
      if (glide) {
        o.frequency.setValueAtTime(f * glide, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      } else o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      if (release) { // sürdürülen nota (yüzey): sonda yavaşça söner
        g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (lp) {
        const fl = c.createBiquadFilter();
        fl.type = 'lowpass';
        fl.Q.value = q;
        fl.frequency.setValueAtTime(lp, t);
        if (lpTo) fl.frequency.exponentialRampToValueAtTime(lpTo, t + Math.min(dur, 0.6));
        o.connect(fl);
        node = fl;
      }
      node.connect(g);
      g.connect(dest);
      if (rev) {
        const r = c.createGain();
        r.gain.value = rev;
        g.connect(r);
        r.connect(this.revIn);
      }
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    pad(kind, t, m, dur, dest) {
      const f = mtof(m), A = 0.9, R = 1.4;
      if (kind === 'soft') {
        for (const dt of [-7, 7]) this.osc(t, f, { type: 'sawtooth', dur, vol: 0.022, attack: A, release: R, lp: 900, detune: dt, dest, rev: 0.5 });
      } else if (kind === 'saw') {
        for (const dt of [-10, 10]) this.osc(t, f, { type: 'sawtooth', dur, vol: 0.024, attack: 0.4, release: R, lp: 1600, detune: dt, dest, rev: 0.4 });
      } else if (kind === 'dark') {
        for (const dt of [-6, 6]) this.osc(t, f * 0.5, { type: 'sawtooth', dur, vol: 0.03, attack: A, release: R, lp: 520, q: 2, detune: dt, dest, rev: 0.4 });
      } else if (kind === 'glass') {
        this.osc(t, f, { type: 'sine', dur, vol: 0.04, attack: 1.2, release: 1.8, dest, rev: 0.7 });
        this.osc(t, f * 2, { type: 'triangle', dur, vol: 0.012, attack: 1.6, release: 1.8, dest, rev: 0.8 });
      } else { // wide
        for (const dt of [-12, 0, 12]) this.osc(t, f, { type: 'triangle', dur, vol: 0.024, attack: 1.4, release: 2, lp: 2200, detune: dt, dest, rev: 0.8 });
      }
    },
    voice(kind, t, m, dur, v, dest) {
      const f = mtof(m);
      switch (kind) {
        case 'ep': // elektrik piyano
          this.osc(t, f, { dur: dur + 0.3, vol: 0.05 * v, attack: 0.006, dest, rev: 0.3 });
          this.osc(t, f * 2, { dur: 0.35, vol: 0.016 * v, attack: 0.004, dest });
          this.osc(t, f, { type: 'triangle', dur: dur * 0.6 + 0.1, vol: 0.02 * v, detune: 5, dest, rev: 0.3 });
          break;
        case 'round': // yuvarlak bas
          this.osc(t, f, { dur: dur + 0.05, vol: 0.2 * v, attack: 0.01, release: 0.08, dest });
          this.osc(t, f * 2, { type: 'triangle', dur: Math.min(dur, 0.25), vol: 0.03 * v, dest });
          break;
        case 'sub':
          this.osc(t, f, { dur: dur + 0.1, vol: 0.2 * v, attack: 0.08, release: 0.5, dest });
          break;
        case 'saw': // süzgeçli testere bas
          this.osc(t, f, { type: 'sawtooth', dur: dur + 0.04, vol: 0.09 * v, attack: 0.005, release: 0.05, lp: 1100, lpTo: 260, q: 3, dest });
          this.osc(t, f * 0.5, { dur: dur + 0.04, vol: 0.12 * v, attack: 0.005, release: 0.05, dest });
          break;
        case 'drop': // su damlası gibi yumuşak, tok nota
          this.osc(t, f, { dur: 0.5, vol: 0.07 * v, attack: 0.003, dest, rev: 0.45 });
          this.osc(t, f * 3, { dur: 0.08, vol: 0.012 * v, attack: 0.002, dest, rev: 0.3 });
          break;
        case 'square':
          this.osc(t, f, { type: 'square', dur: 0.16, vol: 0.026 * v, lp: 3200, lpTo: 900, dest, rev: 0.35 });
          break;
        case 'lead':
          this.osc(t, f, { type: 'sawtooth', dur: dur + 0.1, vol: 0.03 * v, attack: 0.02, release: 0.15, lp: 2400, detune: -6, dest, rev: 0.4 });
          this.osc(t, f, { type: 'square', dur: dur + 0.1, vol: 0.016 * v, attack: 0.02, release: 0.15, lp: 2000, detune: 6, dest, rev: 0.4 });
          break;
        case 'bell':
          this.osc(t, f, { dur: 1.6, vol: 0.045 * v, attack: 0.003, dest, rev: 0.6 });
          this.osc(t, f * 2.76, { dur: 0.45, vol: 0.012 * v, attack: 0.002, dest, rev: 0.6 });
          break;
        case 'oud': // mızrapla çalınan ud
          this.osc(t, f, { type: 'sawtooth', dur: 0.55, vol: 0.05 * v, attack: 0.003, lp: 2600, lpTo: 600, q: 1.5, glide: 1.012, dest, rev: 0.3 });
          this.osc(t, f * 2, { type: 'triangle', dur: 0.2, vol: 0.015 * v, attack: 0.002, dest });
          break;
        case 'twang': // gevşek telli gitar
          this.osc(t, f, { type: 'sawtooth', dur: 0.7, vol: 0.04 * v, attack: 0.003, lp: 1800, lpTo: 400, q: 2, glide: 0.985, dest, rev: 0.35 });
          break;
        case 'glide': // uzay ezgisi: aşağıdan kayarak gelen yumuşak nota
          this.osc(t, f, { type: 'triangle', dur: dur + 0.4, vol: 0.05 * v, attack: 0.08, release: 0.5, glide: 0.94, dest, rev: 0.8 });
          break;
      }
    },
    noiseHit(t, { dur, vol, type, freq, q = 0.8, dest, rev = 0 }) {
      const c = this.c;
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const fl = c.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = freq;
      fl.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl);
      fl.connect(g);
      g.connect(dest);
      if (rev) {
        const r = this.c.createGain();
        r.gain.value = rev;
        g.connect(r);
        r.connect(this.revIn);
      }
      s.start(t, Math.random() * 1.2);
      s.stop(t + dur + 0.05);
    },
    kick(t, v, D) {
      const c = this.c, dest = this.layers.beat;
      const o = c.createOscillator(), g = c.createGain();
      const top = D === 'hand' ? 110 : D === 'heavy' ? 140 : 120, low = D === 'hand' ? 62 : 44;
      o.frequency.setValueAtTime(top, t);
      o.frequency.exponentialRampToValueAtTime(low, t + 0.12);
      const vol = (D === 'soft' ? 0.22 : D === 'heavy' ? 0.42 : 0.34) * v;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (D === 'hand' ? 0.3 : 0.38));
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + 0.45);
    },
    snare(t, v, D) {
      const dest = this.layers.beat;
      if (D === 'hand') { // darbuka "tek": kuru, tiz
        this.noiseHit(t, { dur: 0.06, vol: 0.09 * v, type: 'bandpass', freq: 3400, q: 1.6, dest, rev: 0.2 });
        this.osc(t, 520, { dur: 0.05, vol: 0.05 * v, dest });
      } else if (D === 'soft') { // kenar vuruşu
        this.noiseHit(t, { dur: 0.05, vol: 0.05 * v, type: 'bandpass', freq: 2400, q: 2, dest, rev: 0.3 });
        this.osc(t, 820, { dur: 0.04, vol: 0.03 * v, dest });
      } else {
        this.noiseHit(t, { dur: D === 'heavy' ? 0.26 : 0.2, vol: 0.12 * v, type: 'bandpass', freq: 1900, q: 0.7, dest, rev: 0.35 });
        this.osc(t, D === 'heavy' ? 160 : 190, { dur: 0.1, vol: 0.08 * v, dest });
      }
    },
    hat(t, v, D) {
      const dest = this.layers.beat;
      if (D === 'hand') this.noiseHit(t, { dur: 0.04, vol: 0.04 * v, type: 'bandpass', freq: 5200, q: 1.2, dest });
      else this.noiseHit(t, { dur: D === 'heavy' ? 0.06 : 0.035, vol: (D === 'soft' ? 0.028 : 0.04) * v, type: 'highpass', freq: 7500, dest });
    },
  };

  function vibrate(ms) {
    if (lastInputTouch && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* yok say */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Tuval ve ölçekleme
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  // Saydam tuval: su temasında oyun alanının altından WebGL su katmanı görünür.
  const ctx = canvas.getContext('2d', { alpha: true });
  const waterCanvas = document.getElementById('water');
  const isWater = () => settings.theme === 'water';
  const isMud = () => settings.theme === 'mud';
  // Su motoruyla çizilen temalar (su ve çamur)
  const isLiquid = () => isWater() || isMud();
  const isIce = () => settings.theme === 'ice';
  const isLava = () => settings.theme === 'lava';
  const isSand = () => settings.theme === 'sand';
  const isSpace = () => settings.theme === 'space';
  const isCrystal = () => settings.theme === 'crystal';
  const stage = document.getElementById('stage');
  const tableEl = canvas.parentElement, boardEl = tableEl.parentElement;
  let S = 1; // mantıksal birim başına cihaz pikseli
  // Yatay ekranda (masaüstü penceresi, yatay telefon) masa 90° saat yönünde döner: oyuncu solda,
  // rakip sağda. Fizik ve yapay zekâ aynı (dikey) mantıksal alanda çalışır; yalnızca masayı taşıyan
  // kutu döndürülür, girdi ters dönüştürülür, metinler ve raket/pak parlamaları dik tutulur.
  let landscape = false;
  let cssScale = 1, boardShaken = false;
  const textCache = new Map();

  // Uyarlanabilir kalite: kareler yetişmiyorsa çözünürlüğü kademeli düşür.
  const deviceDpr = window.devicePixelRatio || 1;
  const quality = {
    levels: [Math.min(deviceDpr, 2), 1.5, 1.25, 1].filter((v, i, a) => i === 0 || (v < a[0] && v < a[i - 1])),
    level: 0,
    lite: false,          // en düşük çözünürlükte de yetişmiyorsa efektleri azalt
    acc: 0,
    n: 0,
    cooldown: 0,
  };

  function trackFrame(ms) {
    if (isShowcase) return; // tanıtım kaydında görüntü kalitesi düşürülmez
    if (!(game.state === 'play' || game.state === 'countdown' || game.state === 'goal')) {
      quality.acc = quality.n = 0;
      return;
    }
    if (ms > 250) return; // sekme değişimi vb.
    if (quality.cooldown > 0) { quality.cooldown--; return; }
    quality.acc += ms;
    quality.n++;
    if (quality.n < 90) return;
    const avg = quality.acc / quality.n;
    quality.acc = quality.n = 0;
    if (avg <= 22) return;
    if (quality.level < quality.levels.length - 1 && (quality.levels[quality.level + 1] >= 1.25 || avg > 40)) {
      quality.level++;
      quality.cooldown = 60;
      resize();
    } else if (!quality.lite) {
      quality.lite = true;
    }
  }
  let tableLayer = null, puckSprite = null;
  let malletSprites = [], glowSprites = [];

  // iOS Safari bir sayfadaki toplam tuval belleğini sınırlar; atılan tuvaller hemen serbest
  // bırakılır (boyutu 0 yapılarak). Sınır yine de aşılırsa yazı önbelleği boşaltılıp yeniden
  // denenir, olmazsa küçük bir tuvalle devam edilir (oyun hata verip donmasın).
  function freeCanvas(c) {
    if (c && c.width) c.width = c.height = 0;
  }

  function clearTextCache() {
    for (const sp of textCache.values()) freeCanvas(sp.c);
    textCache.clear();
  }

  function makeLayer(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * S));
    c.height = Math.max(1, Math.ceil(h * S));
    let g = c.getContext('2d');
    if (!g) {
      clearTextCache();
      g = c.getContext('2d');
    }
    if (!g) {
      c.width = c.height = 1;
      g = c.getContext('2d') || document.createElement('canvas').getContext('2d');
    }
    g.setTransform(S, 0, 0, S, 0, 0);
    return [c, g];
  }

  function resize() {
    landscape = stage.clientWidth > stage.clientHeight;
    document.body.classList.toggle('landscape', landscape);
    const cs = getComputedStyle(stage);
    const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const [fw, fh] = landscape ? [LH, LW] : [LW, LH]; // masanın ekrandaki genişliği / yüksekliği
    const scale = Math.max(0.1, Math.min(aw / fw, ah / fh));
    const cssW = Math.floor(LW * scale), cssH = Math.floor(LH * scale);
    const dpr = quality.levels[quality.level];
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.borderRadius = Math.round(44 * scale) + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    S = canvas.width / LW;
    cssScale = scale;
    clearTextCache();
    tableEl.style.width = cssW + 'px';
    tableEl.style.height = cssH + 'px';
    boardEl.style.width = (landscape ? cssH : cssW) + 'px';
    boardEl.style.height = (landscape ? cssW : cssH) + 'px';
    if (isLiquid()) {
      // Su yumuşak bir yüzey: daha düşük çözünürlükte çizmek görüntüyü bozmaz, çok hızlandırır
      const wd = Math.min(dpr, 1.5) * (quality.lite ? 0.75 : 1);
      Water.resize(cssW, cssH, wd, Math.round(44 * scale));
    }
    buildTable();
    buildSprites();
    if (isLiquid()) Water.render();
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Lav teması: volkanik kaya kenar, kararmış bazalt kabuk, kabuğun çatlak ağı (sabit hafif
  // parıltı dahil) ve ısıya dayanıklı soluk saha çizgileri.
  function buildLavaTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const rock = g.createLinearGradient(0, 0, LW, LH);
    rock.addColorStop(0, '#3a302b');
    rock.addColorStop(0.5, '#1c1714');
    rock.addColorStop(1, '#2e2520');
    g.fillStyle = rock;
    g.fill();
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    for (let i = 0; i < 700; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.25)';
      g.fillRect(rnd() * LW, rnd() * LH, 1.4, 1.4);
    }
    g.restore();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.6)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    // Kenardan sızan kor
    g.save();
    g.shadowColor = 'rgba(255, 90, 20, 0.9)';
    g.shadowBlur = 14 * S;
    rr(g, B - 2, B - 2, W + 4, H + 4, 28);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 110, 30, 0.75)';
    g.stroke();
    g.restore();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();
    // Bazalt kabuk plakaları ve dikişleri
    g.drawImage(Lava.crust, 0, 0, W, H);
    // Isıya dayanıklı soluk saha çizgileri
    g.lineCap = 'round';
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#e8d8c8', 5, 0.5, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#e8d8c8', 4, 0.45, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    [['#ff6aa6', 0, 0, Math.PI], ['#4cc8f5', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      paint(colr, 5, 0.6, () => g.arc(W / 2, y, 118, a0, a1));
    });
    // Sabit hafif lav parıltısı (hafif modda tek parıltı budur)
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    g.drawImage(Lava.glow, 0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Kenarlarda koyu kabuk
    const E = 26;
    const edge = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gr;
    };
    g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
  }

  // Lav teması pakı: içi kızgın, kenarı parlayan obsidyen disk (koyu kabuk üzerinde seçilir)
  function buildLavaPuck(c, g, r) {
    const halo = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r + PS_PAD * 0.7);
    halo.addColorStop(0, 'rgba(255, 140, 40, 0.5)');
    halo.addColorStop(1, 'rgba(255, 90, 20, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD * 0.7, 0, TAU);
    g.fill();
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#4a3a34');
    body.addColorStop(1, '#0c0706');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.shadowColor = 'rgba(255, 120, 30, 1)';
    g.shadowBlur = 10 * S;
    g.strokeStyle = '#ffb347';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, r - 2, 0, TAU);
    g.stroke();
    // Yüzeydeki kızgın damarlar
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(255, 170, 60, 0.9)';
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.1); g.lineTo(-r * 0.1, r * 0.05); g.lineTo(r * 0.15, -r * 0.3);
    g.moveTo(-r * 0.1, r * 0.05); g.lineTo(r * 0.2, r * 0.45);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255, 255, 255, 0.2)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.11, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Kum teması: güneşte ağarmış ahşap kenar, ince taneli kum zemin, kuma çakılmış ip/bant
  // saha çizgileri, bantların kuma düşen gölgesi. Kumun kabartısı Sand katmanıyla üstten gelir.
  function buildSandTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const wood = g.createLinearGradient(0, 0, LW, LH);
    wood.addColorStop(0, '#9a7450');
    wood.addColorStop(0.5, '#7a5738');
    wood.addColorStop(1, '#8e6a47');
    g.fillStyle = wood;
    g.fill();
    let seed = 41;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Tahta damarları
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const vert = rnd() < 0.5;
      const p = rnd() * (vert ? LW : LH);
      g.strokeStyle = rnd() < 0.5 ? 'rgba(60, 36, 18, 0.25)' : 'rgba(255, 230, 190, 0.08)';
      g.beginPath();
      if (vert) { g.moveTo(p, 0); g.bezierCurveTo(p + rnd() * 6 - 3, LH * 0.3, p + rnd() * 6 - 3, LH * 0.7, p, LH); }
      else { g.moveTo(0, p); g.bezierCurveTo(LW * 0.3, p + rnd() * 6 - 3, LW * 0.7, p + rnd() * 6 - 3, LW, p); }
      g.stroke();
    }
    g.restore();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.75)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    rr(g, B - 3, B - 3, W + 6, H + 6, 29);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(40, 24, 10, 0.55)';
    g.stroke();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();
    // Kum: sıcak temel renk + yumuşak lekeler + ince taneler
    const base = g.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#e9cf9c');
    base.addColorStop(0.5, '#dcbc85');
    base.addColorStop(1, '#cfa870');
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H, r = 60 + rnd() * 140;
      const blob = g.createRadialGradient(x, y, 0, x, y, r);
      const c = rnd() < 0.5 ? '245, 222, 176' : '190, 150, 96';
      blob.addColorStop(0, `rgba(${c}, 0.22)`);
      blob.addColorStop(1, `rgba(${c}, 0)`);
      g.fillStyle = blob;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const grains = [['rgba(120, 82, 44, 0.35)', 0.9], ['rgba(255, 248, 228, 0.45)', 0.8], ['rgba(160, 110, 70, 0.4)', 1.2], ['rgba(90, 80, 72, 0.35)', 1]];
    for (let i = 0; i < 5200; i++) {
      const [c, s] = grains[(rnd() * grains.length) | 0];
      g.fillStyle = c;
      g.fillRect(rnd() * W, rnd() * H, s, s);
    }
    // Kuma gömülü saha çizgileri (soluk, kum rengine karışmış)
    g.lineCap = 'round';
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#fffaf0', 5, 0.55, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#fffaf0', 4, 0.5, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    [['#e2487e', 0, 0, Math.PI], ['#2a8fc4', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      paint(colr, 5, 0.55, () => g.arc(W / 2, y, 118, a0, a1));
    });
    // Bantların kuma düşen gölgesi: güneş sol üstte, gölge üst ve sol iç kenarda
    const edge = (x0, y0, x1, y1, a) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, `rgba(80, 48, 18, ${a})`);
      gr.addColorStop(1, 'rgba(80, 48, 18, 0)');
      return gr;
    };
    g.fillStyle = edge(0, 0, 22, 0, 0.42); g.fillRect(0, 0, 22, H);
    g.fillStyle = edge(0, 0, 0, 18, 0.36); g.fillRect(0, 0, W, 18);
    g.fillStyle = edge(W, 0, W - 8, 0, 0.14); g.fillRect(W - 8, 0, 8, H);
    g.fillStyle = edge(0, H, 0, H - 8, 0.14); g.fillRect(0, H - 8, W, 8);
    g.restore();
  }

  // Kum teması pakı: kırmızı kauçuk disk, üstünde kum tozu
  function buildSandPuck(c, g, r) {
    g.save();
    g.shadowColor = 'rgba(70, 40, 10, 0.55)';
    g.shadowBlur = 6 * S;
    g.shadowOffsetX = 4 * S;
    g.shadowOffsetY = -3 * S;
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#e2553f');
    body.addColorStop(1, '#8e1f14');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.restore();
    g.lineWidth = 3;
    g.strokeStyle = '#5e140c';
    g.beginPath();
    g.arc(0, 0, r - 1.5, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255, 190, 160, 0.45)';
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, TAU);
    g.stroke();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = 'rgba(240, 214, 160, 0.7)';
    for (let i = 0; i < 40; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * (r - 3);
      g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.1, 1.1);
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.11, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Uzay teması: koyu metal kenar, derin uzay, bulutsular, uzak yıldızlar ve bir sarmal gökada,
  // soluk saha çizgileri. Işık ağı, kutup ışığı ve parlak yıldızlar Space katmanıyla üstten gelir.
  function buildSpaceTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const metal = g.createLinearGradient(0, 0, LW, LH);
    metal.addColorStop(0, '#262a48');
    metal.addColorStop(0.5, '#0e1024');
    metal.addColorStop(1, '#22254a');
    g.fillStyle = metal;
    g.fill();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(180, 200, 255, 0.12)';
    g.stroke();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.8)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    g.save();
    g.shadowColor = 'rgba(110, 170, 255, 0.9)';
    g.shadowBlur = 12 * S;
    rr(g, B - 2, B - 2, W + 4, H + 4, 28);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(140, 190, 255, 0.7)';
    g.stroke();
    g.restore();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();
    const sky = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62);
    sky.addColorStop(0, '#0d1236');
    sky.addColorStop(0.6, '#060920');
    sky.addColorStop(1, '#020309');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Bulutsular
    const neb = [['120, 60, 220', 0.22], ['40, 160, 220', 0.16], ['220, 60, 150', 0.12], ['60, 220, 170', 0.08]];
    for (let i = 0; i < 9; i++) {
      const [c, a] = neb[i % neb.length];
      const x = rnd() * W, y = rnd() * H, r = 90 + rnd() * 170;
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * TAU);
      g.scale(1, 0.45 + rnd() * 0.4);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, `rgba(${c}, ${a})`);
      gr.addColorStop(0.5, `rgba(${c}, ${a * 0.4})`);
      gr.addColorStop(1, `rgba(${c}, 0)`);
      g.fillStyle = gr;
      g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    }
    // Uzak sarmal gökada
    g.save();
    g.translate(W * 0.78, H * 0.13);
    g.rotate(-0.5);
    g.scale(1, 0.38);
    const gal = g.createRadialGradient(0, 0, 0, 0, 0, 46);
    gal.addColorStop(0, 'rgba(255, 240, 220, 0.55)');
    gal.addColorStop(0.2, 'rgba(200, 190, 255, 0.25)');
    gal.addColorStop(1, 'rgba(120, 120, 255, 0)');
    g.fillStyle = gal;
    g.fillRect(-46, -46, 92, 92);
    g.fillStyle = 'rgba(220, 220, 255, 0.35)';
    for (let i = 0; i < 160; i++) {
      const t = rnd() * 3.2, arm = rnd() < 0.5 ? 0 : Math.PI;
      const rad = 4 + t * 12, a = t * 1.7 + arm + (rnd() - 0.5) * 0.5;
      g.fillRect(Math.cos(a) * rad, Math.sin(a) * rad, 1, 1);
    }
    g.restore();
    // Uzak yıldızlar
    for (let i = 0; i < 900; i++) {
      const b = rnd();
      g.fillStyle = b < 0.7 ? 'rgba(200, 215, 255, 0.35)' : b < 0.95 ? 'rgba(235, 240, 255, 0.6)' : 'rgba(255, 225, 200, 0.8)';
      const s = b < 0.9 ? 0.8 : 1.3;
      g.fillRect(rnd() * W, rnd() * H, s, s);
    }
    // Soluk saha çizgileri
    g.lineCap = 'round';
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#cfe0ff', 3, 0.35, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#cfe0ff', 3, 0.3, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    [['#ff6aa6', 0, 0, Math.PI], ['#4cc8f5', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      paint(colr, 4, 0.5, () => g.arc(W / 2, y, 118, a0, a1));
    });
    const E = 30;
    const edge = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gr;
    };
    g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
  }

  // Uzay teması pakı: ak-mavi parlayan küçük bir yıldız
  function buildSpacePuck(c, g, r) {
    const halo = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r + PS_PAD * 0.8);
    halo.addColorStop(0, 'rgba(160, 220, 255, 0.55)');
    halo.addColorStop(0.5, 'rgba(120, 140, 255, 0.18)');
    halo.addColorStop(1, 'rgba(120, 100, 255, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD * 0.8, 0, TAU);
    g.fill();
    const body = g.createRadialGradient(-r * 0.15, -r * 0.15, 0, 0, 0, r);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.35, '#e6f6ff');
    body.addColorStop(0.75, '#8fd0ff');
    body.addColorStop(1, '#4a78ff');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.stroke();
    // Yıldız ışıltısı
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(220, 240, 255, 0.55)';
    g.fillRect(-r - PS_PAD * 0.6, -0.8, (r + PS_PAD * 0.6) * 2, 1.6);
    g.fillRect(-0.8, -r - PS_PAD * 0.6, 1.6, (r + PS_PAD * 0.6) * 2);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // Kristal Mağarası: kaba kaya kenar, karanlık zeminde koyu renkli fasetli kristaller (her yüz
  // ışığa göre farklı tonda), ince parlak kenarlar ve kristale kazınmış soluk saha çizgileri.
  // Işık dalgaları ve parıltı Crystal katmanıyla üstten gelir.
  function buildCrystalTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const rock = g.createLinearGradient(0, 0, LW, LH);
    rock.addColorStop(0, '#2a2638');
    rock.addColorStop(0.5, '#15131f');
    rock.addColorStop(1, '#241f33');
    g.fillStyle = rock;
    g.fill();
    let seed = 57;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    for (let i = 0; i < 600; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.3)';
      g.fillRect(rnd() * LW, rnd() * LH, 1.5, 1.5);
    }
    // Kenarda küçük kristal kümeleri
    const fams = Crystal.FAMILIES;
    for (let i = 0; i < 26; i++) {
      const side = i % 4;
      const t = rnd();
      const x = side === 0 ? t * LW : side === 1 ? LW - B * 0.5 : side === 2 ? t * LW : B * 0.5;
      const y = side === 0 ? B * 0.5 : side === 1 ? t * LH : side === 2 ? LH - B * 0.5 : t * LH;
      const [r, gg, b] = fams[(rnd() * fams.length) | 0].rgb;
      for (let k = 0; k < 3; k++) {
        const a = rnd() * TAU, len = 5 + rnd() * 9, w = 2 + rnd() * 2;
        g.save();
        g.translate(x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 8);
        g.rotate(a);
        g.fillStyle = `rgba(${r}, ${gg}, ${b}, 0.55)`;
        g.beginPath();
        g.moveTo(0, -w); g.lineTo(len, 0); g.lineTo(0, w);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
    g.restore();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.8)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    rr(g, B - 2, B - 2, W + 4, H + 4, 28);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(190, 170, 255, 0.35)';
    g.stroke();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();
    g.fillStyle = '#06050b';
    g.fillRect(0, 0, W, H);
    // Kristaller: her yüz ışığa göre farklı koyulukta
    for (const c of Crystal.cells) {
      const [r, gg, b] = fams[c.fam].rgb;
      const poly = c.poly;
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], q = poly[(k + 1) % poly.length], f = c.facets[k];
        const m = 0.06 + f * 0.11;
        g.fillStyle = `rgb(${(r * m + 8) | 0}, ${(gg * m + 6) | 0}, ${(b * m + 12) | 0})`;
        g.beginPath();
        g.moveTo(c.apex[0], c.apex[1]);
        g.lineTo(a[0], a[1]);
        g.lineTo(q[0], q[1]);
        g.closePath();
        g.fill();
      }
    }
    // Faset çizgileri ve kristal kenarları
    g.lineWidth = 0.7;
    g.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    g.beginPath();
    for (const c of Crystal.cells) {
      for (const a of c.poly) { g.moveTo(c.apex[0], c.apex[1]); g.lineTo(a[0], a[1]); }
    }
    g.stroke();
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    g.beginPath();
    for (const c of Crystal.cells) {
      c.poly.forEach((a, k) => (k ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1])));
      g.closePath();
    }
    g.stroke();
    // Kristale kazınmış soluk saha çizgileri
    g.lineCap = 'round';
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#e6e0ff', 2.5, 0.3, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#e6e0ff', 2.5, 0.28, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    [['#ff6aa6', 0, 0, Math.PI], ['#4cc8f5', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      paint(colr, 3.5, 0.45, () => g.arc(W / 2, y, 118, a0, a1));
    });
    // Mağara karanlığı: kenarlara doğru koyulaşır
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.62);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  // Kristal Mağarası pakı: berrak, fasetli bir kristal disk
  function buildCrystalPuck(c, g, r) {
    const halo = g.createRadialGradient(0, 0, r * 0.7, 0, 0, r + PS_PAD * 0.7);
    halo.addColorStop(0, 'rgba(220, 230, 255, 0.4)');
    halo.addColorStop(1, 'rgba(180, 160, 255, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD * 0.7, 0, TAU);
    g.fill();
    // Altıgen fasetler
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * TAU - Math.PI / 2, a1 = ((k + 1) / n) * TAU - Math.PI / 2;
      const l = 0.55 + 0.4 * Math.max(0, Math.cos((a0 + a1) / 2 + 2.3));
      g.fillStyle = `rgba(${(200 + 55 * l) | 0}, ${(215 + 40 * l) | 0}, 255, ${0.55 + 0.35 * l})`;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, r, a0, a1);
      g.closePath();
      g.fill();
    }
    // İç altıgen tabla
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU - Math.PI / 2;
      g.lineTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
    }
    g.closePath();
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    g.stroke();
    g.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU - Math.PI / 2;
      g.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.stroke();
    // Prizma pırıltısı
    g.globalCompositeOperation = 'lighter';
    [['255, 80, 120', -0.9], ['255, 220, 80', -0.7], ['80, 255, 160', -0.5], ['90, 140, 255', -0.3]].forEach(([col, a]) => {
      g.strokeStyle = `rgba(${col}, 0.5)`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(0, 0, r * 0.78, a * Math.PI - 0.12, a * Math.PI + 0.12);
      g.stroke();
    });
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // Bataklık teması: eski, yosun tutmuş ahşap iskele kenarı, köşelerde sazlar; oyun alanı saydam
  // bırakılır, altından WebGL çamur katmanı görünür (WebGL yoksa çamur durağan çizilir).
  function buildSwampTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const wood = g.createLinearGradient(0, 0, LW, LH);
    wood.addColorStop(0, '#4a3a26');
    wood.addColorStop(0.5, '#33271a');
    wood.addColorStop(1, '#443422');
    g.fillStyle = wood;
    g.fill();
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    // Tahta aralıkları ve damarlar
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(15, 10, 5, 0.6)';
    for (let x = 30; x < LW; x += 30 + rnd() * 16) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, B - 4); g.moveTo(x, LH - B + 4); g.lineTo(x, LH); g.stroke();
    }
    for (let y = 30; y < LH; y += 30 + rnd() * 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(B - 4, y); g.moveTo(LW - B + 4, y); g.lineTo(LW, y); g.stroke();
    }
    g.lineWidth = 0.7;
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = rnd() < 0.5 ? 'rgba(20, 12, 5, 0.35)' : 'rgba(160, 130, 90, 0.08)';
      const vert = rnd() < 0.5, p = rnd() * (vert ? LW : LH);
      g.beginPath();
      if (vert) { g.moveTo(p, 0); g.lineTo(p + rnd() * 4 - 2, LH); } else { g.moveTo(0, p); g.lineTo(LW, p + rnd() * 4 - 2); }
      g.stroke();
    }
    // Yosun lekeleri
    for (let i = 0; i < 40; i++) {
      const x = rnd() * LW, y = rnd() * LH, r = 6 + rnd() * 16;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${80 + rnd() * 30}, ${110 + rnd() * 30}, 40, 0.55)`);
      gr.addColorStop(1, 'rgba(70, 100, 35, 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.7)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });

    g.save();
    g.translate(B, B);
    if (Water.ok) {
      g.globalCompositeOperation = 'destination-out';
      rr(g, 0, 0, W, H, 26);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    } else {
      rr(g, 0, 0, W, H, 26);
      g.save();
      g.clip();
      g.drawImage(Water.floor, 0, 0, W, H);
      g.restore();
    }
    // Kenara vuran ıslak çamur çizgisi ve iskelenin çamura düşen gölgesi
    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();
    const E = 16;
    const side = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(10, 6, 2, 0.5)');
      gr.addColorStop(1, 'rgba(10, 6, 2, 0)');
      return gr;
    };
    g.fillStyle = side(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = side(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = side(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = side(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
    rr(g, 0, 0, W, H, 26);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(150, 120, 80, 0.45)';
    g.stroke();
    g.restore();
    // Köşelerde sazlar ve su kamışları (kenarın üstünde)
    const reeds = (cx, cy, dir) => {
      for (let i = 0; i < 7; i++) {
        const bx = cx + (rnd() - 0.5) * 22, by = cy + (rnd() - 0.5) * 14;
        const len = 18 + rnd() * 22, lean = (rnd() - 0.5) * 0.5 + dir * 0.25;
        g.strokeStyle = `hsl(${70 + rnd() * 25}, 40%, ${22 + rnd() * 14}%)`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(bx, by);
        g.quadraticCurveTo(bx + lean * len * 0.5, by - len * 0.6, bx + lean * len, by - len);
        g.stroke();
        if (rnd() < 0.4) {
          g.fillStyle = '#4a2c18';
          g.save();
          g.translate(bx + lean * len * 0.8, by - len * 0.8);
          g.rotate(lean);
          rr(g, -2, -6, 4, 12, 2);
          g.fill();
          g.restore();
        }
      }
    };
    reeds(14, 40, 1);
    reeds(LW - 14, 40, -1);
    reeds(14, LH - 14, 1);
    reeds(LW - 14, LH - 14, -1);
  }

  // Bataklık teması pakı: sarı kauçuk disk, üstünde çamur lekeleri (koyu çamurda seçilir)
  function buildMudPuck(c, g, r) {
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.6)';
    g.shadowBlur = 5 * S;
    g.shadowOffsetX = 3 * S;
    g.shadowOffsetY = 5 * S;
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#fff07a');
    body.addColorStop(0.6, '#f0c21c');
    body.addColorStop(1, '#a87a08');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.restore();
    g.lineWidth = 2.5;
    g.strokeStyle = '#6e4f06';
    g.beginPath();
    g.arc(0, 0, r - 1.2, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, TAU);
    g.stroke();
    // Çamur lekeleri
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 6; i++) {
      const a = rnd() * TAU, d = r * (0.3 + rnd() * 0.6), s = 2 + rnd() * 4;
      g.fillStyle = 'rgba(70, 45, 20, 0.75)';
      g.beginPath();
      g.ellipse(Math.cos(a) * d, Math.sin(a) * d, s, s * 0.7, a, 0, TAU);
      g.fill();
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.4)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.32, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Buz teması: saha kenarı (beyaz bant + sarı tekme şeridi), derin buzul gölü, buzun içinde
  // donmuş kabarcıklar ve eski çatlaklar, buz altı çizgileri, kırağı, kenarda kar, ışık parlaması.
  function buildIceTable(g) {
    // Kenar bantları
    rr(g, 0, 0, LW, LH, 44);
    const bd = g.createLinearGradient(0, 0, LW, LH);
    bd.addColorStop(0, '#f4f8fb');
    bd.addColorStop(0.5, '#cfdbe4');
    bd.addColorStop(1, '#eaf1f6');
    g.fillStyle = bd;
    g.fill();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.stroke();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.6)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    // Tekme şeridi
    rr(g, B - 6, B - 6, W + 12, H + 12, 31);
    g.fillStyle = '#e9b93c';
    g.fill();
    rr(g, B - 3, B - 3, W + 6, H + 6, 28);
    g.fillStyle = '#2a5f86';
    g.fill();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();

    // Derin göl: ortada aydınlık turkuaz, kenarlara doğru koyu derinlik
    const deep = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.72);
    deep.addColorStop(0, '#1b8aa6');
    deep.addColorStop(0.45, '#0c5a77');
    deep.addColorStop(1, '#03263c');
    g.fillStyle = deep;
    g.fillRect(0, 0, W, H);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Göl tabanı: koyu taş gölgeleri ve açık su lekeleri
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.4;
      gr.addColorStop(0, light ? 'rgba(90, 210, 230, 0.12)' : 'rgba(0, 20, 35, 0.16)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Derinde donmuş küçük kabarcıklar (bulanık, mavimsi)
    g.shadowColor = 'rgba(180, 235, 255, 0.6)';
    g.shadowBlur = 4 * S;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 3;
      g.fillStyle = `rgba(190, 235, 250, ${0.08 + rnd() * 0.14})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.shadowBlur = 0;

    // Buzun içinde kalmış eski çatlaklar
    Ice.staticFractures(g);

    // Buz altına boyanmış çizgiler (hafif bulanık, buzun içinden görünür)
    g.lineCap = 'round';
    g.shadowBlur = 5 * S;
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#d8283e', 6, 0.6, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#2a6fd6', 4, 0.55, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    paint('#2a6fd6', 3, 0.45, () => {
      [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => { g.moveTo(x + 34, y); g.arc(x, y, 34, 0, TAU); });
    });
    g.globalAlpha = 0.7;
    g.fillStyle = '#2a6fd6';
    g.beginPath();
    g.arc(W / 2, H / 2, 7, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    [['#d6407c', 0, 0, Math.PI], ['#1f97d8', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      g.globalAlpha = 0.1;
      g.fillStyle = colr;
      g.beginPath();
      g.arc(W / 2, y, 118, a0, a1);
      g.fill();
      paint(colr, 4, 0.55, () => g.arc(W / 2, y, 118, a0, a1));
    });
    g.shadowBlur = 0;

    // Yarı saydam buz gövdesi
    g.fillStyle = 'rgba(170, 225, 240, 0.12)';
    g.fillRect(0, 0, W, H);

    // Buza hapsolmuş kabarcık kümeleri (farklı derinliklerde üst üste yassı diskler)
    for (let s = 0; s < 11; s++) {
      const bx = 30 + rnd() * (W - 60), by = 40 + rnd() * (H - 80);
      const ang = rnd() * TAU, count = 3 + ((rnd() * 4) | 0);
      for (let i = count - 1; i >= 0; i--) {
        const x = bx + Math.cos(ang) * i * 4, y = by + Math.sin(ang) * i * 4;
        const r = (5 + rnd() * 7) * (1 - i * 0.12);
        const deepK = i / count;
        g.fillStyle = `rgba(${Math.round(225 - deepK * 40)}, 248, 255, ${0.12 + (1 - deepK) * 0.16})`;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.82, ang, 0, TAU);
        g.fill();
        g.lineWidth = 0.8;
        g.strokeStyle = `rgba(255, 255, 255, ${0.2 + (1 - deepK) * 0.3})`;
        g.stroke();
        g.fillStyle = `rgba(255, 255, 255, ${0.25 + (1 - deepK) * 0.35})`;
        g.beginPath();
        g.ellipse(x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.14, -0.7, 0, TAU);
        g.fill();
      }
    }

    // Yüzey kırağısı: ince tozlanma ve eski kullanım çizikleri
    g.fillStyle = 'rgba(255, 255, 255, 0.09)';
    for (let i = 0; i < 1600; i++) g.fillRect(rnd() * W, rnd() * H, 0.9, 0.9);
    g.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, l = 20 + rnd() * 70;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.3) * l * 0.5, y + Math.sin(a + 0.3) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.stroke();

    // Bantların dibinde biriken kar
    const E = 24;
    const snow = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(245, 252, 255, 0.5)');
      gr.addColorStop(0.35, 'rgba(235, 248, 255, 0.18)');
      gr.addColorStop(1, 'rgba(235, 248, 255, 0)');
      return gr;
    };
    g.fillStyle = snow(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = snow(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = snow(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = snow(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 500; i++) {
      const side = (rnd() * 4) | 0, d = Math.pow(rnd(), 2) * 16;
      const t = rnd();
      const x = side === 0 ? d : side === 1 ? W - d : t * W;
      const y = side === 2 ? d : side === 3 ? H - d : t * H;
      g.fillRect(x, y, 1.2, 1.2);
    }

    // Arena ışıklarının buzdaki parlaması
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.36, 'rgba(255, 255, 255, 0.07)');
    sheen.addColorStop(0.46, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)');
    sheen.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    [[W * 0.26, H * 0.2], [W * 0.74, H * 0.8]].forEach(([x, y]) => {
      g.save();
      g.translate(x, y);
      g.scale(1, 0.55);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      gr.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = gr;
      g.fillRect(-120, -120, 240, 240);
      g.restore();
    });
    g.restore();

    // Buz kenarı
    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(230, 250, 255, 0.7)';
    g.stroke();
    g.restore();
  }

  // Buz teması pakı: klasik siyah kauçuk hokey diski
  function buildIcePuck(c, g, r) {
    g.save();
    g.shadowColor = 'rgba(0, 20, 40, 0.55)';
    g.shadowBlur = 8 * S;
    g.shadowOffsetX = 3 * S;
    g.shadowOffsetY = 5 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.fill();
    g.restore();
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#4a4f5a');
    body.addColorStop(0.6, '#1b1d22');
    body.addColorStop(1, '#07080a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    // Kenardaki tırtıklı doku
    g.setLineDash([2, 2]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    g.beginPath();
    g.arc(0, 0, r - 1.5, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.34, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Su teması: havuz kenarı (taş kaplama + su hattı fayans bandı); oyun alanı saydam bırakılır,
  // altından WebGL su katmanı görünür. WebGL yoksa taban durağan olarak çizilir.
  function buildPoolTable(g) {
    // Kaplama taşı
    rr(g, 0, 0, LW, LH, 44);
    const st = g.createLinearGradient(0, 0, LW, LH);
    st.addColorStop(0, '#eef2f5');
    st.addColorStop(0.5, '#c9d2da');
    st.addColorStop(1, '#e3e8ed');
    g.fillStyle = st;
    g.fill();
    // Taş derzleri
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    g.strokeStyle = 'rgba(90, 105, 120, 0.25)';
    g.lineWidth = 1;
    for (let x = 36; x < LW; x += 36) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, B - 7); g.moveTo(x, LH - B + 7); g.lineTo(x, LH); g.stroke();
    }
    for (let y = 36; y < LH; y += 36) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(B - 7, y); g.moveTo(LW - B + 7, y); g.lineTo(LW, y); g.stroke();
    }
    g.restore();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    g.stroke();

    // Kale uçlarında takım renginde şerit
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.55)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });

    // Su hattı: koyu mavi fayans bandı
    rr(g, B - 7, B - 7, W + 14, H + 14, 32);
    g.fillStyle = '#0d4f7c';
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 1;
    g.stroke();

    g.save();
    g.translate(B, B);
    if (Water.ok) {
      // Oyun alanını sil: su altta görünür
      g.globalCompositeOperation = 'destination-out';
      rr(g, 0, 0, W, H, 26);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    } else {
      rr(g, 0, 0, W, H, 26);
      g.save();
      g.clip();
      g.drawImage(Water.floor, 0, 0, W, H);
      g.fillStyle = 'rgba(4, 60, 96, 0.38)';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    // Duvarın suya düşen gölgesi ve suyun kenara değdiği ince parlak çizgi
    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();
    const E = 18;
    const side = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0, 20, 35, 0.35)');
      gr.addColorStop(1, 'rgba(0, 20, 35, 0)');
      return gr;
    };
    g.fillStyle = side(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = side(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = side(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = side(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
    rr(g, 0, 0, W, H, 26);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(210, 240, 255, 0.55)';
    g.stroke();
    g.restore();
  }

  // Statik masa katmanı: yalnızca boyut değiştiğinde yeniden çizilir.
  function buildTable() {
    const [c, g] = makeLayer(LW, LH);
    freeCanvas(tableLayer);
    tableLayer = c;
    g.fillStyle = '#05060f'; // opak tuvalin köşeleri (CSS ile yuvarlatılır)
    g.fillRect(0, 0, LW, LH);
    if (isWater()) {
      buildPoolTable(g);
      return;
    }
    if (isMud()) {
      buildSwampTable(g);
      return;
    }
    if (isIce()) {
      buildIceTable(g);
      Ice.attach(c, g);
      return;
    }
    if (isLava()) {
      buildLavaTable(g);
      Lava.attach(c, g);
      return;
    }
    if (isSand()) {
      buildSandTable(g);
      return;
    }
    if (isSpace()) {
      buildSpaceTable(g);
      return;
    }
    if (isCrystal()) {
      buildCrystalTable(g);
      return;
    }

    // Dış çerçeve
    rr(g, 0, 0, LW, LH, 44);
    const fr = g.createLinearGradient(0, 0, LW, LH);
    fr.addColorStop(0, '#20264c');
    fr.addColorStop(0.5, '#0f1229');
    fr.addColorStop(1, '#1d2046');
    g.fillStyle = fr;
    g.fill();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.09)';
    g.stroke();
    rr(g, B - 7, B - 7, W + 14, H + 14, 32);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.stroke();

    g.save();
    g.translate(B, B);

    // Oyun yüzeyi
    rr(g, 0, 0, W, H, 26);
    const sg = g.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, H * 0.72);
    sg.addColorStop(0, '#18225e');
    sg.addColorStop(0.55, '#0c1339');
    sg.addColorStop(1, '#050920');
    g.fillStyle = sg;
    g.fill();

    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();

    // Yarı alan renk tonları
    const tTop = g.createLinearGradient(0, 0, 0, H / 2);
    tTop.addColorStop(0, `rgba(${COLORS[1].rgb},0.16)`);
    tTop.addColorStop(1, `rgba(${COLORS[1].rgb},0)`);
    g.fillStyle = tTop;
    g.fillRect(0, 0, W, H / 2);
    const tBot = g.createLinearGradient(0, H, 0, H / 2);
    tBot.addColorStop(0, `rgba(${COLORS[0].rgb},0.16)`);
    tBot.addColorStop(1, `rgba(${COLORS[0].rgb},0)`);
    g.fillStyle = tBot;
    g.fillRect(0, H / 2, W, H / 2);

    // Hava delikleri
    g.fillStyle = 'rgba(170,195,255,0.13)';
    g.beginPath();
    const step = 27;
    for (let row = 0, y = step / 2; y < H; y += step, row++) {
      for (let x = step / 2 + (row % 2) * (step / 2); x < W; x += step) {
        g.moveTo(x + 1.4, y);
        g.arc(x, y, 1.4, 0, TAU);
      }
    }
    g.fill();

    // Buz parlaması
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.25, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.045)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.62, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);

    // Çizgiler (neon parıltılı)
    g.shadowBlur = 16 * S;
    g.lineCap = 'round';

    g.shadowColor = 'rgba(175,130,255,0.95)';
    g.strokeStyle = 'rgba(215,195,255,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();

    g.beginPath();
    g.arc(W / 2, H / 2, 80, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(155,107,255,0.06)';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(215,195,255,0.25)';
    g.beginPath();
    g.arc(W / 2, H / 2, 66, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(225,210,255,0.8)';
    g.beginPath();
    g.arc(W / 2, H / 2, 6, 0, TAU);
    g.fill();

    // Kale yarım daireleri
    [[1, 0, 0, Math.PI], [0, H, Math.PI, TAU]].forEach(([ci, y, a0, a1]) => {
      const col = COLORS[ci];
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.strokeStyle = `rgba(${col.rgb},0.7)`;
      g.fillStyle = `rgba(${col.rgb},0.07)`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, y, 118, a0, a1);
      g.fill();
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = `rgba(${col.rgb},0.3)`;
      g.beginPath();
      g.arc(W / 2, y, 60, a0, a1);
      g.stroke();
    });

    // Köşe işaretleri
    g.shadowColor = 'rgba(175,130,255,0.9)';
    g.strokeStyle = 'rgba(215,195,255,0.28)';
    g.lineWidth = 2;
    [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 34, 0, TAU);
      g.stroke();
    });

    g.restore(); // clip

    // Neon iç kenar
    g.shadowBlur = 22 * S;
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, COLORS[1].main);
    edge.addColorStop(0.5, '#9b6bff');
    edge.addColorStop(1, COLORS[0].main);
    g.shadowColor = 'rgba(155,107,255,0.9)';
    g.strokeStyle = edge;
    g.lineWidth = 4;
    rr(g, 0, 0, W, H, 26);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    rr(g, 0, 0, W, H, 26);
    g.stroke();

    g.restore();
  }

  const MS_PAD = 30, MS = (MALLET_R + MS_PAD) * 2;
  const PS_PAD = 28, PS = (PUCK_R + PS_PAD) * 2;

  // Yatay masada raket ve pak görselleri -90° döndürülür: masa kutusu 90° döndüğünde parlamaları
  // ekranda yine sol üstten ışık alır.
  function upright(c) {
    if (!landscape || !c || !c.width) return c;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const g = o.getContext('2d');
    if (!g) return c;
    g.translate(o.width / 2, o.height / 2);
    g.rotate(-Math.PI / 2);
    g.drawImage(c, -c.width / 2, -c.height / 2);
    freeCanvas(c);
    return o;
  }

  function buildSprites() {
    if (malletSprites) [...malletSprites, ...glowSprites, puckSprite].forEach(freeCanvas);
    malletSprites = COLORS.map((col, i) => upright(buildMallet(malletCol(i), settings.theme)));
    glowSprites = COLORS.map((c0, i) => {
      const col = malletCol(i);
      const [c, g] = makeLayer(MS, MS);
      const r = MS / 2;
      const gr = g.createRadialGradient(r, r, MALLET_R * 0.6, r, r, r);
      gr.addColorStop(0, `rgba(${col.rgb},0.9)`);
      gr.addColorStop(0.45, `rgba(${col.rgb},0.35)`);
      gr.addColorStop(1, `rgba(${col.rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, MS, MS);
      return c;
    });
    puckSprite = upright(settings.puck !== 'theme' ? buildSkinPuck(settings.puck, settings.theme) : buildPuck(settings.theme));
  }

  // Raketin renk seti: alttaki oyuncu seçtiği görünümle, üstteki hep pembe
  function malletCol(i) {
    return i === 0 ? SKINS[settings.skin] || SKINS.classic : COLORS[i];
  }

  // Görünüm deseni: raketin dış halkasına (iç çukurun dışına) çizilir
  function malletDeco(g, R, deco) {
    const inner = R * 0.68;
    if (deco === 'flame') {
      // Halka boyunca dışa doğru yalazlanan alev dilleri
      for (let k = 0; k < 11; k++) {
        const a = (k / 11) * TAU + 0.2, w = 0.2, len = R * (0.93 - (k % 2) * 0.08);
        const gr = g.createRadialGradient(0, 0, inner, 0, 0, len);
        gr.addColorStop(0, 'rgba(255,240,150,0.95)');
        gr.addColorStop(1, 'rgba(255,90,20,0.2)');
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(Math.cos(a - w) * inner, Math.sin(a - w) * inner);
        g.quadraticCurveTo(Math.cos(a - w * 0.2) * len * 0.95, Math.sin(a - w * 0.2) * len * 0.95, Math.cos(a + w * 0.35) * len, Math.sin(a + w * 0.35) * len);
        g.quadraticCurveTo(Math.cos(a + w * 0.5) * inner * 1.08, Math.sin(a + w * 0.5) * inner * 1.08, Math.cos(a + w) * inner, Math.sin(a + w) * inner);
        g.fill();
      }
    } else if (deco === 'shine') {
      // Altın: ışınsal ince yivler
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        g.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        g.stroke();
      }
    } else if (deco === 'stars') {
      // Galaksi: sabit (her seferinde aynı) yıldız serpintisi
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < 26; k++) {
        const a = rnd() * TAU, r = inner + rnd() * (R * 0.95 - inner), s = 0.5 + rnd() * 1.3;
        g.fillStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`;
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, s, 0, TAU);
        g.fill();
      }
    } else if (deco === 'rainbow') {
      // Gökkuşağı: halkayı renk çemberi kaplar, üstüne hafif derinlik
      const cg = g.createConicGradient ? g.createConicGradient(0, 0, 0) : null;
      if (cg) {
        ['#ff4d4d', '#ffb13d', '#ffe94d', '#4dff88', '#3dd8ff', '#6a6bff', '#d65cff', '#ff4d4d'].forEach((c, i, a) => cg.addColorStop(i / (a.length - 1), c));
        g.fillStyle = cg;
        g.beginPath();
        g.arc(0, 0, R * 0.97, 0, TAU);
        g.fill();
      }
      const sh = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
      sh.addColorStop(0, 'rgba(255,255,255,0.45)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0)');
      sh.addColorStop(1, 'rgba(20,0,40,0.45)');
      g.fillStyle = sh;
      g.beginPath();
      g.arc(0, 0, R * 0.97, 0, TAU);
      g.fill();
    }
  }

  // neon: parlak hale + gölge; su: hale yok, suyla temas çizgisi (menisküs); buz: yalnızca gölge
  function buildMallet(col, style = 'neon') {
    const [c, g] = makeLayer(MS, MS);
    const R = MALLET_R;
    g.translate(MS / 2, MS / 2);

    if (style === 'water') {
      meniscus(g, R);
    } else if (style === 'mud') {
      // Çamura gömülen raketin çevresinde koyu, ıslak parlak bir halka
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(20, 12, 4, 0.55)';
      g.beginPath();
      g.arc(0, 0, R + 3, 0, TAU);
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = 'rgba(255, 235, 200, 0.35)';
      g.beginPath();
      g.arc(-1, -1.5, R + 4.5, Math.PI * 0.9, Math.PI * 1.6);
      g.stroke();
    } else {
    // Gölge
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 14 * S;
    g.shadowOffsetX = 4 * S;
    g.shadowOffsetY = 8 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, R - 2, 0, TAU);
    g.fill();
    g.restore();

    if (style === 'neon') {
      // Hale
      const halo = g.createRadialGradient(0, 0, R * 0.85, 0, 0, R + MS_PAD);
      halo.addColorStop(0, `rgba(${col.rgb},0.5)`);
      halo.addColorStop(1, `rgba(${col.rgb},0)`);
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, 0, R + MS_PAD, 0, TAU);
      g.fill();
    }
    }

    // Gövde
    const base = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    base.addColorStop(0, col.light);
    base.addColorStop(0.45, col.main);
    base.addColorStop(1, col.dark);
    g.fillStyle = base;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    if (col.deco) malletDeco(g, R, col.deco);
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(0, 0, R - 1.5, 0, TAU);
    g.stroke();

    // İç çukur
    const well = g.createRadialGradient(R * 0.2, R * 0.25, R * 0.05, 0, 0, R * 0.66);
    well.addColorStop(0, col.main);
    well.addColorStop(1, col.dark);
    g.fillStyle = well;
    g.beginPath();
    g.arc(0, 0, R * 0.66, 0, TAU);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();

    // Tutamak
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.arc(2.5, 4, R * 0.42, 0, TAU);
    g.fill();
    const knob = g.createRadialGradient(-R * 0.14, -R * 0.17, 1, 0, 0, R * 0.42);
    knob.addColorStop(0, '#ffffff');
    knob.addColorStop(0.35, col.light);
    knob.addColorStop(1, col.main);
    g.fillStyle = knob;
    g.beginPath();
    g.arc(0, 0, R * 0.42, 0, TAU);
    g.fill();

    // Parlama
    g.fillStyle = 'rgba(255,255,255,0.38)';
    g.beginPath();
    g.ellipse(-R * 0.38, -R * 0.48, R * 0.34, R * 0.14, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Suya oturan nesnenin çevresindeki ince karanlık/aydınlık halka
  function meniscus(g, R) {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0, 25, 45, 0.35)';
    g.beginPath();
    g.arc(0, 0, R + 3.5, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(225, 245, 255, 0.55)';
    g.beginPath();
    g.arc(0, 0, R + 1.5, 0, TAU);
    g.stroke();
  }

  // Kıvılcım ve iz rengi: seçili pak görünümünün rengi ya da varsayılan sarı
  const puckRgb = () => (PUCKS[settings.puck] && PUCKS[settings.puck].rgb) || PUCK_RGB;

  // Satın alınan pak görünümü (temanın pakı yerine). Su ve çamurda suya oturma halkası korunur.
  function buildSkinPuck(id, style = 'neon') {
    const [c, g] = makeLayer(PS, PS);
    const r = PUCK_R, sk = PUCKS[id];
    g.translate(PS / 2, PS / 2);
    if (style === 'water' || style === 'mud') meniscus(g, r);
    else {
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.7)';
      g.shadowBlur = 10 * S;
      g.shadowOffsetX = 3 * S;
      g.shadowOffsetY = 6 * S;
      g.fillStyle = '#000';
      g.beginPath();
      g.arc(0, 0, r - 1, 0, TAU);
      g.fill();
      g.restore();
    }
    if (sk.glow) {
      const halo = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r + PS_PAD);
      halo.addColorStop(0, `rgba(${sk.rgb},0.6)`);
      halo.addColorStop(1, `rgba(${sk.rgb},0)`);
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, 0, r + PS_PAD, 0, TAU);
      g.fill();
    }
    const disc = (stops) => {
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
      stops.forEach(([o, col]) => gr.addColorStop(o, col));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
    };
    const ring = (rr, w, col) => {
      g.lineWidth = w;
      g.strokeStyle = col;
      g.beginPath();
      g.arc(0, 0, rr, 0, TAU);
      g.stroke();
    };
    g.save();
    if (id === 'ember') {
      disc([[0, '#fff1a8'], [0.35, '#ffb02e'], [0.75, '#ff4a12'], [1, '#7a1204']]);
      g.strokeStyle = 'rgba(90,10,0,0.55)'; // közün çatlakları
      g.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + 0.4;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25);
        g.lineTo(Math.cos(a + 0.3) * r * 0.6, Math.sin(a + 0.3) * r * 0.6);
        g.lineTo(Math.cos(a + 0.1) * r * 0.92, Math.sin(a + 0.1) * r * 0.92);
        g.stroke();
      }
      ring(r - 1.5, 2.5, 'rgba(255,230,150,0.8)');
    } else if (id === 'mint') {
      disc([[0, '#ffffff'], [0.5, '#9dffd9'], [1, '#1f8a66']]);
      ring(r - 2, 3, 'rgba(255,255,255,0.85)');
      ring(r * 0.5, 2, 'rgba(20,110,80,0.55)');
    } else if (id === 'carbon') {
      disc([[0, '#4a4d55'], [1, '#0d0e12']]);
      g.setLineDash([5, 4]); // sarı-siyah uyarı şeridi
      ring(r - 3.5, 5, '#ffd63c');
      g.setLineDash([]);
      ring(r * 0.42, 2, 'rgba(255,214,60,0.7)');
    } else if (id === 'soccer') {
      disc([[0, '#ffffff'], [0.7, '#e9edf2'], [1, '#9aa3ae']]);
      g.beginPath();
      g.arc(0, 0, r - 0.5, 0, TAU);
      g.clip();
      const pent = (cx, cy, s, rot) => {
        g.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = rot + (k / 5) * TAU;
          g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        }
        g.closePath();
        g.fill();
      };
      g.fillStyle = '#1b1d22';
      pent(0, 0, r * 0.32, -Math.PI / 2);
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * TAU + Math.PI / 5;
        pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3, a);
      }
      g.strokeStyle = 'rgba(40,44,52,0.6)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k / 5) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32);
        g.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
        g.stroke();
      }
    } else if (id === 'melon') {
      disc([[0, '#4fd36a'], [1, '#1d6b2c']]); // kabuk
      ring(r * 0.86, 2, 'rgba(210,255,190,0.9)');
      const fl = g.createRadialGradient(-r * 0.2, -r * 0.25, 1, 0, 0, r * 0.8);
      fl.addColorStop(0, '#ff8a96');
      fl.addColorStop(1, '#e8243e');
      g.fillStyle = fl;
      g.beginPath();
      g.arc(0, 0, r * 0.78, 0, TAU);
      g.fill();
      g.fillStyle = '#1a0d0d';
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + 0.3, d = r * (k % 2 ? 0.48 : 0.3);
        g.beginPath();
        g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 1.6, 2.8, a, 0, TAU);
        g.fill();
      }
    } else if (id === 'plasma') {
      disc([[0, '#d6b8ff'], [0.4, '#6b2cd9'], [1, '#14062e']]);
      g.lineCap = 'round';
      for (let k = 0; k < 3; k++) { // enerji sarmalı
        const a0 = (k / 3) * TAU;
        g.strokeStyle = k % 2 ? 'rgba(80,240,255,0.9)' : 'rgba(255,120,240,0.9)';
        g.lineWidth = 2.2;
        g.beginPath();
        for (let t = 0; t <= 1.001; t += 0.1) {
          const a = a0 + t * 2.6, rr = r * (0.15 + 0.75 * t);
          g[t ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
      ring(r - 1.5, 2.5, 'rgba(200,170,255,0.85)');
    } else if (id === 'diamond') {
      disc([[0, '#ffffff'], [0.5, '#9fdcff'], [1, '#2a6fa8']]);
      // Yontulmuş yüzeyler: merkezde sekizgen, çevresinde açık-koyu üçgenler
      const N = 8, ri = r * 0.45, ro = r * 0.97;
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU, am = (a0 + a1) / 2;
        g.fillStyle = k % 2 ? 'rgba(255,255,255,0.32)' : 'rgba(20,70,120,0.28)';
        g.beginPath();
        g.moveTo(Math.cos(a0) * ri, Math.sin(a0) * ri);
        g.lineTo(Math.cos(am) * ro, Math.sin(am) * ro);
        g.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(230,248,255,0.7)';
      g.beginPath();
      for (let k = 0; k < N; k++) {
        const a = (k / N) * TAU;
        g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * ri, Math.sin(a) * ri);
      }
      g.closePath();
      g.fill();
      ring(r - 1, 1.5, 'rgba(255,255,255,0.9)');
    }
    g.restore();
    // Parlama
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.32, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  function buildPuck(style = 'neon') {
    const [c, g] = makeLayer(PS, PS);
    const r = PUCK_R;
    g.translate(PS / 2, PS / 2);

    if (style === 'water') return buildWaterPuck(c, g, r);
    if (style === 'ice') return buildIcePuck(c, g, r);
    if (style === 'lava') return buildLavaPuck(c, g, r);
    if (style === 'sand') return buildSandPuck(c, g, r);
    if (style === 'space') return buildSpacePuck(c, g, r);
    if (style === 'crystal') return buildCrystalPuck(c, g, r);
    if (style === 'mud') return buildMudPuck(c, g, r);

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 10 * S;
    g.shadowOffsetX = 3 * S;
    g.shadowOffsetY = 6 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.fill();
    g.restore();

    const halo = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r + PS_PAD);
    halo.addColorStop(0, `rgba(${PUCK_RGB},0.55)`);
    halo.addColorStop(1, `rgba(${PUCK_RGB},0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD, 0, TAU);
    g.fill();

    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#3a3f60');
    body.addColorStop(1, '#0b0d1a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();

    g.shadowBlur = 10 * S;
    g.shadowColor = `rgba(${PUCK_RGB},1)`;
    g.strokeStyle = '#fff1b0';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(0, 0, r - 2, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = `rgba(${PUCK_RGB},0.55)`;
    g.beginPath();
    g.arc(0, 0, r * 0.52, 0, TAU);
    g.stroke();
    g.shadowBlur = 0;

    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.32, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Su teması pakı: suda yüzen, parlak turuncu kauçuk disk (mavi su üzerinde iyi seçilir)
  function buildWaterPuck(c, g, r) {
    meniscus(g, r);
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#ffb066');
    body.addColorStop(0.55, '#ff6a1a');
    body.addColorStop(1, '#a8360a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath();
    g.arc(0, 0, r * 0.6, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.45)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.34, r * 0.13, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // ---------------------------------------------------------------------------
  // Su Stadyumu: gerçek zamanlı su yüzeyi
  // Fizik: yükseklik alanında dalga denklemi (duvarlardan yansır, zamanla söner).
  // Etkileşim: raket ve paklar suyun hacmini iter (önde çukur, arkada kabarma → baş dalgası
  // ve iz); çarpışmalar sıçrama, hızlı hareket köpük üretir.
  // Görüntü (WebGL): havuz tabanı ışığın kırılmasıyla görünür; yüzey eğriliğinden kostikler,
  // Fresnel yansıması, projektör pırıltıları, nesnelerin tabana düşen gölgeleri ve köpük.
  // ---------------------------------------------------------------------------
  const Water = (() => {
    const NX = 108, NY = 180;          // ızgara: hücre = 5 oyun birimi
    const CELL = W / NX;
    const N = NX * NY;
    const STEP = 1 / 150;              // simülasyon adımı (sn)
    // Sıvı ayarları. Su: hızlı, uzun ömürlü dalgalar. Çamur: çok ağır ve yapışkan; dalgalar yavaş
    // yayılır ve çabuk söner, açılan çukurlar ancak saniyeler içinde yavaşça kapanır.
    //   speed: dalga hızı katsayısı (< 2 kararlı), damp: adım başına sönümleme,
    //   visc: viskozite (kısa dalgaları yumuşatır), settle: çukur/tümseklerin düzleşme hızı,
    //   churn: köpük (çamurda karıştırılmış ıslak iz) sönümü
    const LIQUIDS = {
      water: { speed: 0.62, damp: 0.9985, visc: 0.05, settle: 0.00005, churn: 0.991 },
      mud: { speed: 0.05, damp: 0.985, visc: 0.02, settle: 0.00005, churn: 0.9975 },
    };
    let mode = 'water', P = LIQUIDS.water;
    const h = new Float32Array(N), v = new Float32Array(N), foam = new Float32Array(N);
    const Water_h = h;
    // Çamurun kalıcı biçim bozulması (oluklar, kraterler, dudaklar): dalgalardan ayrı tutulur ve
    // çok yavaş düzleşir. Görünen yüzey = dalga (h) + biçim (def).
    const def = new Float32Array(N), sum = new Float32Array(N);
    const DEF_SETTLE = 0.0011, DEF_FLOW = 0.06;
    let defStep = 0;
    const avgBuf = new Float32Array(N);
    const pix = new Uint8ClampedArray(N * 4);
    const pixU8 = new Uint8Array(pix.buffer);
    const bodies = new Map();
    const objs = new Float32Array(16); // gölgeler için en fazla 4 nesne: x, y, yarıçap, güç
    let acc = 0, time = 0, dirty = true;
    let gl = null, canvas = null, prog = null, simTex = null, floorTex = null, U = null;
    let ok = false, tried = false;
    let floor = null;
    const progs = {}, floors = {}, floorTexs = {};

    const VS = `
      attribute vec2 aPos;
      attribute vec2 aUv;
      varying vec2 vUv;
      void main() { vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec2 vUv;
      uniform sampler2D uSim;
      uniform sampler2D uFloor;
      uniform vec2 uSize;
      uniform float uTime;
      uniform float uLite;
      uniform vec4 uObj[4];

      const float DEPTH = 60.0;                  // su derinliği (oyun birimi)
      const float SLOPE = 3.0;                   // simülasyon eğimi → yüzey normali
      const vec3 DEEP = vec3(0.0, 0.30, 0.46);   // derin su rengi (soğurma)

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Hareketli hücre deseni: F2 - F1 sınırları, ince dalgacıkların taban üzerinde
      // topladığı ışık çizgilerine (kostik) benzer.
      float cells(vec2 p, float t) {
        vec2 ip = floor(p), fp = fract(p);
        float f1 = 8.0, f2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            float a = hash(ip + g), b = hash(ip + g + 17.7);
            vec2 o = 0.5 + 0.4 * vec2(sin(t * (0.8 + a) + 6.2831 * a), cos(t * (0.7 + b) + 6.2831 * b));
            float d = length(g + o - fp);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
          }
        }
        return 1.0 - smoothstep(0.02, 0.2, f2 - f1);
      }

      // Havuz sirkülasyonunun oluşturduğu çok küçük dalgacıklar (yüzey eğimine katkı)
      vec2 ripples(vec2 p, float t) {
        vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.55, 0.83), d3 = vec2(0.15, -0.99), d4 = vec2(-0.96, -0.28);
        vec2 g = d1 * cos(dot(p, d1) * 0.23 + t * 1.7);
        g += d2 * cos(dot(p, d2) * 0.37 + t * 2.3) * 0.7;
        g += d3 * cos(dot(p, d3) * 0.61 + t * 2.9) * 0.45;
        g += d4 * cos(dot(p, d4) * 0.97 + t * 3.8) * 0.3;
        return g * 0.012;
      }

      void main() {
        vec2 p = vUv * uSize;
        vec4 s = texture2D(uSim, vUv);
        vec2 grad = (s.rg - 0.5) * SLOPE + ripples(p, uTime);
        vec3 N = normalize(vec3(grad.x, 1.0, grad.y));
        vec3 I = vec3(0.0, -1.0, 0.0);

        // Kırılma: taban, dalga eğimine göre kaymış görünür (hava → su, n = 1.33)
        vec3 T = refract(I, N, 0.7519);
        vec2 off = T.xz / max(-T.y, 0.3) * DEPTH;
        vec2 fp = p + off;
        vec2 fuv = fp / uSize;
        vec2 disp = off / uSize * 0.035; // renk ayrışması (hafif dispersiyon)
        vec3 floorCol = vec3(
          texture2D(uFloor, fuv + disp).r,
          texture2D(uFloor, fuv).g,
          texture2D(uFloor, fuv - disp).b);

        // Kostikler: dışbükey yüzey ışığı tabanda toplar (simülasyondan) + ince dalgacık deseni
        float focus = (texture2D(uSim, fuv).b - 0.5) * 3.2;
        float c = cells(fp / 34.0 + grad * 3.0, uTime * 0.8) * 0.6;
        if (uLite < 0.5) c += cells(fp / 21.0 - grad * 4.0 + 5.1, uTime * 1.15) * 0.4;
        floorCol *= 0.8 + clamp(focus, -0.55, 1.6) * 0.7 + c * 0.24;

        // Yüzen nesnelerin tabana düşen yumuşak gölgeleri
        float sh = 1.0;
        for (int k = 0; k < 4; k++) {
          vec4 o = uObj[k];
          float d = length(fp - o.xy - vec2(9.0, 15.0)) / max(o.z, 1.0);
          sh *= 1.0 - o.w * 0.42 * (1.0 - smoothstep(0.7, 1.55, d));
        }
        floorCol *= sh;

        // Derinlik boyunca ışık soğurması
        vec3 col = mix(DEEP, floorCol, 0.66);

        // Fresnel: eğik yüzeyler stadyum çatısını yansıtır
        vec3 Rf = reflect(I, N);
        float fres = 0.02 + 0.98 * pow(1.0 - clamp(N.y, 0.0, 1.0), 5.0);
        vec3 env = mix(vec3(0.02, 0.04, 0.08), vec3(0.09, 0.13, 0.19), clamp(Rf.y, 0.0, 1.0));
        col = mix(col, env, clamp(fres * 1.4, 0.0, 1.0));

        // Dört köşe projektörünün dalga yamaçlarındaki pırıltısı
        vec3 L1 = normalize(vec3(-0.42, 1.0, -0.58)), L2 = normalize(vec3(0.42, 1.0, -0.58));
        vec3 L3 = normalize(vec3(-0.42, 1.0, 0.58)), L4 = normalize(vec3(0.42, 1.0, 0.58));
        float sp = pow(max(dot(Rf, L1), 0.0), 700.0) + pow(max(dot(Rf, L2), 0.0), 700.0)
                 + pow(max(dot(Rf, L3), 0.0), 700.0) + pow(max(dot(Rf, L4), 0.0), 700.0);
        float sheen = pow(max(dot(Rf, L1), 0.0), 40.0) + pow(max(dot(Rf, L4), 0.0), 40.0);
        col += vec3(1.0, 0.97, 0.9) * (sp * 2.6 + sheen * 0.05);

        // Köpük: kabarcık dokusuyla
        float fo = s.a;
        if (uLite < 0.5) fo *= 0.55 + 0.45 * cells(p / 5.0, uTime * 2.0);
        col = mix(col, vec3(0.94, 0.98, 1.0), clamp(fo, 0.0, 0.92));

        gl_FragColor = vec4(col, 1.0);
      }`;

    // Çamur: opak, koyu ve parlak. Taban yok; renk dokusu yüzeyin kendisidir (eğimle hafifçe
    // sürüklenir). Islak yüzeyde keskin pırıltılar, çukurlar daha koyu, karıştırılmış çamur açık ve ıslak.
    const FS_MUD = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec2 vUv;
      uniform sampler2D uSim;
      uniform sampler2D uFloor;
      uniform vec2 uSize;
      uniform float uTime;
      uniform float uLite;
      uniform vec4 uObj[4];

      const float SLOPE = 4.5;

      // Yoğun çamurun çok yavaş, iri yüzey kıvrımları (ıslak parlaklık bunlarda kırılır)
      vec2 folds(vec2 p, float t) {
        vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.55, 0.83), d3 = vec2(0.2, -0.98);
        vec2 g = d1 * cos(dot(p, d1) * 0.09 + t * 0.35);
        g += d2 * cos(dot(p, d2) * 0.15 + t * 0.27) * 0.8;
        g += d3 * cos(dot(p, d3) * 0.27 - t * 0.21) * 0.5;
        return g * 0.045;
      }

      void main() {
        vec2 p = vUv * uSize;
        vec4 s = texture2D(uSim, vUv);
        vec2 grad = (s.rg - 0.5) * SLOPE + folds(p, uTime);
        vec3 N = normalize(vec3(grad.x, 1.0, grad.y));
        float curv = (s.b - 0.5) * 3.0;
        float churn = s.a;

        // Renk dokusu yüzeyle birlikte hafifçe akar
        vec3 alb = texture2D(uFloor, (p - grad * 7.0) / uSize).rgb;
        // Karıştırılmış çamur: daha açık, kızılımsı, daha ıslak
        alb = mix(alb, alb * vec3(1.35, 1.2, 1.05) + vec3(0.04, 0.025, 0.0), clamp(churn, 0.0, 1.0) * 0.7);

        // Alçak açılı ışık: çukurların ve tümseklerin biçimi belirgin olsun
        vec3 L = normalize(vec3(-0.6, 0.8, -0.7));
        float dif = 0.2 + 1.15 * max(dot(N, L), 0.0);
        vec3 col = alb * dif;
        col *= 1.0 + clamp(curv, -0.7, 0.7) * 0.6;

        // Nesnelerin çamura düşen gölgeleri (yüzeye yakın: kısa ve koyu)
        float sh = 1.0;
        for (int k = 0; k < 4; k++) {
          vec4 o = uObj[k];
          float d = length(p - o.xy - vec2(6.0, 9.0)) / max(o.z, 1.0);
          sh *= 1.0 - o.w * 0.5 * (1.0 - smoothstep(0.85, 1.35, d));
        }
        col *= sh;

        // Islak yüzey: keskin ışık pırıltıları ve geniş parlaklık, kenarlarda gökyüzü yansıması
        vec3 R = reflect(vec3(0.0, -1.0, 0.0), N);
        vec3 L2 = normalize(vec3(0.55, 1.0, 0.4));
        float spec = pow(max(dot(R, L), 0.0), 110.0) * 1.2 + pow(max(dot(R, L2), 0.0), 160.0) * 0.45;
        float sheen = pow(max(dot(R, L), 0.0), 6.0) * 0.09;
        float fres = 0.03 + 0.97 * pow(1.0 - clamp(N.y, 0.0, 1.0), 5.0);
        col = mix(col, vec3(0.2, 0.22, 0.17), clamp(fres * 1.3, 0.0, 0.55));
        col += vec3(1.0, 0.96, 0.86) * (spec * (0.8 + churn * 0.6) + sheen);

        gl_FragColor = vec4(col, 1.0);
      }`;

    // Çamur rengi dokusu: koyu kahve zemin, açık/koyu lekeler, yosun yeşili tonlar, çakıl ve
    // saz kırıntıları; saha çizgileri çamura gömülmüş açık kil şeritleri
    function buildMudFloor() {
      const k = 1.25;
      const c = document.createElement('canvas');
      c.width = Math.round(W * k);
      c.height = Math.round(H * k);
      const g = c.getContext('2d');
      g.scale(k, k);
      g.fillStyle = '#3a2819';
      g.fillRect(0, 0, W, H);
      let seed = 31;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const blobs = [['92, 64, 38', 0.35], ['28, 18, 10', 0.45], ['70, 72, 34', 0.28], ['110, 78, 46', 0.25], ['48, 52, 26', 0.3]];
      for (let i = 0; i < 90; i++) {
        const [col, a] = blobs[i % blobs.length];
        const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 90;
        g.save();
        g.translate(x, y);
        g.rotate(rnd() * TAU);
        g.scale(1, 0.5 + rnd() * 0.5);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, `rgba(${col}, ${a})`);
        gr.addColorStop(1, `rgba(${col}, 0)`);
        g.fillStyle = gr;
        g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
      for (let i = 0; i < 2600; i++) {
        const b = rnd();
        g.fillStyle = b < 0.5 ? 'rgba(20, 12, 6, 0.45)' : b < 0.85 ? 'rgba(140, 108, 70, 0.35)' : 'rgba(170, 160, 120, 0.4)';
        const s = 0.8 + rnd() * 1.6;
        g.fillRect(rnd() * W, rnd() * H, s, s);
      }
      // Saz ve ot kırıntıları
      g.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, l = 4 + rnd() * 10;
        g.strokeStyle = rnd() < 0.5 ? 'rgba(120, 100, 50, 0.45)' : 'rgba(60, 70, 30, 0.5)';
        g.lineWidth = 0.8 + rnd();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      // Açık kil saha çizgileri
      const paint = (color, width, alpha, fn) => {
        g.globalAlpha = alpha;
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        fn();
        g.stroke();
        g.globalAlpha = 1;
      };
      paint('#c9b48a', 6, 0.45, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
      paint('#c9b48a', 5, 0.4, () => g.arc(W / 2, H / 2, 80, 0, TAU));
      [['#c0587e', 0, 0, Math.PI], ['#4f8fb8', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
        paint(colr, 6, 0.5, () => g.arc(W / 2, y, 118, a0, a1));
      });
      // Kenarlarda koyu, ıslak çamur
      const edge = (x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(12, 8, 4, 0.55)');
        gr.addColorStop(1, 'rgba(12, 8, 4, 0)');
        return gr;
      };
      const E = 34;
      g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
      g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
      g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
      g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
      return c;
    }

    // Havuz tabanı: mozaik fayanslar ve tabana boyanmış saha çizgileri
    function buildFloor() {
      const k = 1.25;
      const c = document.createElement('canvas');
      c.width = Math.round(W * k);
      c.height = Math.round(H * k);
      const g = c.getContext('2d');
      g.scale(k, k);
      g.fillStyle = '#6fb4c9'; // derz
      g.fillRect(0, 0, W, H);
      const T = 18, gap = 1.3;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < H; y += T) {
        for (let x = 0; x < W; x += T) {
          const l = 74 + rnd() * 7, s = 62 + rnd() * 12;
          g.fillStyle = `hsl(${188 + rnd() * 6}, ${s}%, ${l}%)`;
          g.fillRect(x + gap / 2, y + gap / 2, T - gap, T - gap);
        }
      }
      // Boyalı çizgiler
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(12, 52, 96, 0.85)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 80, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(12, 52, 96, 0.85)';
      g.beginPath();
      g.arc(W / 2, H / 2, 10, 0, TAU);
      g.fill();
      [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => {
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, y, 34, 0, TAU);
        g.stroke();
      });
      [['#b8285e', 0, 0, Math.PI], ['#0d6fb3', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
        g.globalAlpha = 0.22;
        g.fillStyle = colr;
        g.beginPath();
        g.arc(W / 2, y, 118, a0, a1);
        g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = colr;
        g.lineWidth = 7;
        g.beginPath();
        g.arc(W / 2, y, 118, a0, a1);
        g.stroke();
        g.globalAlpha = 1;
      });
      // Duvar diplerinde ortam gölgesi
      const edge = (x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(0, 30, 50, 0.45)');
        gr.addColorStop(1, 'rgba(0, 30, 50, 0)');
        return gr;
      };
      const E = 40;
      g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
      g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
      g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
      g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
      return c;
    }

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }

    function link(fs) {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
      // Her iki programda da öznitelikler aynı yerde: tek köşe tamponu ikisine de yeter
      gl.bindAttribLocation(pr, 0, 'aPos');
      gl.bindAttribLocation(pr, 1, 'aUv');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'link');
      return pr;
    }

    function setupGL() {
      progs.water = { prog: link(FS) };
      progs.mud = { prog: link(FS_MUD) };
      prog = progs.water.prog;
      gl.useProgram(prog);

      // Yalnızca oyun alanını kaplayan dörtgen (kenar 2B katmanda çizilir)
      const x0 = (B / LW) * 2 - 1, x1 = ((B + W) / LW) * 2 - 1;
      const yT = 1 - (B / LH) * 2, yB = 1 - ((B + H) / LH) * 2;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x0, yT, 0, 0, x1, yT, 1, 0, x0, yB, 0, 1, x1, yB, 1, 1,
      ]), gl.STATIC_DRAW);
      const aPos = 0, aUv = 1;
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

      const tex = (unit) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      simTex = tex(0);
      encode();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NX, NY, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixU8);
      for (const m of ['water', 'mud']) {
        floorTexs[m] = tex(1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, floorOf(m));
        const pr = progs[m], u = (pr.U = {});
        gl.useProgram(pr.prog);
        for (const n of ['uSim', 'uFloor', 'uSize', 'uTime', 'uLite', 'uObj']) u[n] = gl.getUniformLocation(pr.prog, n);
        gl.uniform1i(u.uSim, 0);
        gl.uniform1i(u.uFloor, 1);
        gl.uniform2f(u.uSize, W, H);
      }
      useMode();
      gl.clearColor(0.02, 0.05, 0.09, 1);
      dirty = true;
    }

    function floorOf(m) {
      return floors[m] || (floors[m] = m === 'mud' ? buildMudFloor() : buildFloor());
    }

    function useMode() {
      prog = progs[mode].prog;
      U = progs[mode].U;
      floorTex = floorTexs[mode];
    }

    // Sıvı türü: 'water' | 'mud'
    function setMode(m) {
      mode = m === 'mud' ? 'mud' : 'water';
      P = LIQUIDS[mode];
      if (ok) useMode();
      reset();
    }

    function init(el) {
      if (tried) return ok;
      tried = true;
      canvas = el;
      try {
        const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
        gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
        if (!gl) return false;
        setupGL();
        ok = true;
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ok = false; });
        canvas.addEventListener('webglcontextrestored', () => {
          try { setupGL(); ok = true; } catch (err) { ok = false; }
        });
      } catch (err) {
        ok = false;
      }
      return ok;
    }

    function resize(cssW, cssH, dpr, radius) {
      if (!canvas) return;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.style.borderRadius = radius + 'px';
      if (!ok) return;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Yumuşak (kosinüs) tümsek ekler; amt < 0 çukur açar
    function stamp(cx, cy, r, amt, arr = h) {
      const gx = cx / CELL - 0.5, gy = cy / CELL - 0.5, gr = r / CELL;
      const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(NX - 1, Math.ceil(gx + gr));
      const y0 = Math.max(0, Math.floor(gy - gr)), y1 = Math.min(NY - 1, Math.ceil(gy + gr));
      const inv = 1 / gr;
      for (let y = y0; y <= y1; y++) {
        const dy = y - gy;
        for (let x = x0; x <= x1; x++) {
          const dx = x - gx;
          const t = Math.sqrt(dx * dx + dy * dy) * inv;
          if (t < 1) arr[y * NX + x] += amt * (0.5 + 0.5 * Math.cos(Math.PI * t));
        }
      }
    }

    function addFoam(cx, cy, r, amt) {
      const gx = cx / CELL - 0.5, gy = cy / CELL - 0.5, gr = r / CELL;
      const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(NX - 1, Math.ceil(gx + gr));
      const y0 = Math.max(0, Math.floor(gy - gr)), y1 = Math.min(NY - 1, Math.ceil(gy + gr));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = Math.hypot(x - gx, y - gy) / gr;
          if (t < 1) {
            const i = y * NX + x;
            foam[i] = Math.min(1, foam[i] + amt * (1 - t));
          }
        }
      }
    }

    // Çarpışma / gol sıçraması: çukur + halka dalgası + köpük
    function splash(x, y, k) {
      if (!tried) return;
      k = clamp(k, 0, 2);
      if (mode === 'mud') {
        // Çamur: krater açılır, çamur dudağa yığılır; ağır bir halka dalgası yavaşça yayılır
        plow(x, y, 10 + k * 14, 0.35 + k * 0.7, 0, 0, 2.1);
        stamp(x, y, 22 + k * 22, -(0.15 + k * 0.5));
        addFoam(x, y, 16 + k * 14, 0.35 + k * 0.5);
        return;
      }
      stamp(x, y, 12 + k * 16, -(0.2 + k * 0.8));
      addFoam(x, y, 14 + k * 14, 0.25 + k * 0.6);
    }

    // Çamurda iz: dairenin içi kazınır (hedef derinliğe kadar), çıkan çamur önde/yanlarda
    // halkaya yığılır (hacim korunur). Oluk, yalnızca çamur yavaşça akıp düzleştikçe kapanır.
    function plow(cx, cy, r, depth, dx, dy, ring = 1.6) {
      const gx = cx / CELL - 0.5, gy = cy / CELL - 0.5, gr = r / CELL, gr2 = gr * ring;
      const x0 = Math.max(0, Math.floor(gx - gr2)), x1 = Math.min(NX - 1, Math.ceil(gx + gr2));
      const y0 = Math.max(0, Math.floor(gy - gr2)), y1 = Math.min(NY - 1, Math.ceil(gy + gr2));
      let V = 0, ws = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - gx, y - gy);
          if (d >= gr) continue;
          const i = y * NX + x, t = d / gr;
          const target = -depth * (0.5 + 0.5 * Math.cos(Math.PI * t));
          if (def[i] > target) {
            const m = (def[i] - target) * 0.7;
            def[i] -= m;
            V += m;
          }
        }
      }
      if (V <= 0) return;
      for (let pass = 0; pass < 2; pass++) {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const ox = x - gx, oy = y - gy, d = Math.hypot(ox, oy);
            if (d < gr || d >= gr2) continue;
            const front = d > 0 ? (ox * dx + oy * dy) / d : 0;
            const w = (1 - (d - gr) / (gr2 - gr)) * (0.35 + Math.max(0, front));
            if (pass === 0) ws += w;
            else def[y * NX + x] += (V * w) / ws;
          }
        }
        if (ws <= 0) return;
      }
    }

    // Çamurdan yükselen kabarcık: önce kabarır, sonra patlayıp küçük bir çukur ve halka bırakır
    function bubble(x, y, r, amt) {
      if (!tried) return;
      stamp(x, y, r, amt);
    }

    function pop(x, y, r) {
      if (!tried) return;
      stamp(x, y, r * 1.1, -0.6, def);   // patlayan kabarcığın bıraktığı küçük çukur
      stamp(x, y, r * 2.4, -0.25);       // ağır, yavaş halka dalgası
      addFoam(x, y, r * 1.5, 0.4);
    }

    // Yüzey eğimi (dh/dx, dh/dy): yüzen yosun ve yaprakları sürüklemek için
    function slope(x, y) {
      const gx = clamp(Math.round(x / CELL - 0.5), 1, NX - 2), gy = clamp(Math.round(y / CELL - 0.5), 1, NY - 2);
      const i = gy * NX + gx;
      const f = (j) => h[j] + def[j];
      return [(f(i + 1) - f(i - 1)) / (2 * CELL), (f(i + NX) - f(i - NX)) / (2 * CELL)];
    }

    function simStep() {
      const sp = P.speed, dp = P.damp;
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
        for (let x = 0; x < NX; x++) {
          const i = row + x;
          const l = x > 0 ? h[i - 1] : h[i];
          const r = x < NX - 1 ? h[i + 1] : h[i];
          const avg = (l + r + h[up + x] + h[dn + x]) * 0.25;
          avgBuf[i] = avg;
          v[i] = (v[i] + (avg - h[i]) * sp) * dp;
        }
      }
      const vi = P.visc, keep = 1 - P.settle, ch = P.churn;
      for (let i = 0; i < N; i++) {
        h[i] = (h[i] + v[i] + (avgBuf[i] - h[i]) * vi) * keep;
        foam[i] *= ch;
      }
      // Çamurun biçimi: çok yavaş akıp düzleşir (4 adımda bir, maliyet için)
      if (mode === 'mud' && ++defStep % 4 === 0) {
        const fl = DEF_FLOW, kd = 1 - DEF_SETTLE * 4;
        for (let y = 0; y < NY; y++) {
          const row = y * NX;
          const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
          for (let x = 0; x < NX; x++) {
            const i = row + x;
            const l = x > 0 ? def[i - 1] : def[i], r = x < NX - 1 ? def[i + 1] : def[i];
            avgBuf[i] = (l + r + def[up + x] + def[dn + x]) * 0.25;
          }
        }
        for (let i = 0; i < N; i++) def[i] = (def[i] + (avgBuf[i] - def[i]) * fl) * kd;
      }
    }

    // Yükseklik alanı → doku: R/G yüzey eğimi, B eğrilik (kostik), A köpük
    function encode() {
      let h = Water_h;
      if (mode === 'mud') {
        for (let i = 0; i < N; i++) sum[i] = Water_h[i] + def[i];
        h = sum;
      }
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
        for (let x = 0; x < NX; x++) {
          const i = row + x, j = i * 4;
          const c = h[i];
          const l = x > 0 ? h[i - 1] : c, r = x < NX - 1 ? h[i + 1] : c;
          const u = h[up + x], d = h[dn + x];
          pix[j] = 128 + (l - r) * 170;
          pix[j + 1] = 128 + (u - d) * 170;
          pix[j + 2] = 128 - (l + r + u + d - 4 * c) * 420;
          pix[j + 3] = foam[i] * 255;
        }
      }
      dirty = true;
    }

    // list: { id, x, y, r, depth } — o karedeki yüzen nesneler
    function update(dt, list, lite) {
      if (!tried) return;
      time += dt;
      acc = Math.min(acc + dt, STEP * 8);
      const n = Math.min(lite ? 2 : 4, Math.floor(acc / STEP));
      if (!n) return;
      acc -= n * STEP;

      // Kaybolan nesnelerin çukuru kapanır; yeni gelenler suya oturur
      const mud = mode === 'mud';
      for (const [id, b] of bodies) {
        if (!list.some((o) => o.id === id)) {
          if (!mud) stamp(b.x, b.y, b.r, b.depth);
          bodies.delete(id);
        }
      }
      for (const o of list) {
        let b = bodies.get(o.id);
        if (!b) {
          b = { x: o.x, y: o.y, r: o.r, depth: o.depth, sx: o.x, sy: o.y };
          bodies.set(o.id, b);
          if (mud) plow(o.x, o.y, o.r * 0.95, o.depth * 0.8, 0, 0);
          else stamp(o.x, o.y, o.r, -o.depth);
        }
        b.sx = b.x;
        b.sy = b.y;
      }

      for (let s = 1; s <= n; s++) {
        const f = s / n;
        for (const o of list) {
          const b = bodies.get(o.id);
          const nx = b.sx + (o.x - b.sx) * f, ny = b.sy + (o.y - b.sy) * f;
          const dist = Math.hypot(nx - b.x, ny - b.y);
          if (dist > 0.01) {
            const speed = dist / STEP;
            if (mode === 'mud') {
              // Çamur geri akmaz: yeni yerde oluk açılır, çamur önde yığılır
              // İzi sık adımlarla aç: seyrek diskler olukta basamaklı iz bırakır
              const ux = (nx - b.x) / dist, uy = (ny - b.y) / dist;
              const segs = Math.min(8, Math.ceil(dist / (o.r * 0.22)));
              for (let q = 1; q <= segs; q++) {
                const t = q / segs;
                plow(b.x + (nx - b.x) * t, b.y + (ny - b.y) * t, o.r * 0.95, o.depth * 0.8, ux, uy);
              }
              // Ağır, yavaş yayılan dalga (hacim korunur)
              stamp(b.x, b.y, o.r * 1.2, o.depth * 0.3);
              stamp(nx, ny, o.r * 1.2, -o.depth * 0.3);
              if (speed > 350) addFoam(nx, ny, o.r * 0.8, Math.min(0.12, (speed - 350) / 12000));
            } else {
              // Hacim korunur: eski yerde su geri dolar, yeni yerde çukur açılır
              stamp(b.x, b.y, o.r, o.depth);
              stamp(nx, ny, o.r, -o.depth);
              if (speed > 550) addFoam(nx, ny, o.r * 0.9, Math.min(0.25, (speed - 550) / 9000));
            }
            b.x = nx;
            b.y = ny;
          }
        }
        // Havuz sirkülasyonundan küçük rastgele damlalar (yüzey hiç tamamen durmaz)
        if (!mud && Math.random() < 0.35) stamp(Math.random() * W, Math.random() * H, 6 + Math.random() * 8, (Math.random() - 0.5) * 0.05);
        simStep();
      }
      encode();
    }

    function render() {
      if (!ok) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, simTex);
      if (dirty) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NX, NY, gl.RGBA, gl.UNSIGNED_BYTE, pixU8);
        dirty = false;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, floorTex);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uLite, quality.lite ? 1 : 0);
      gl.uniform4fv(U.uObj, objs);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function setObjects(list) {
      objs.fill(0);
      for (let k = 0; k < Math.min(4, list.length); k++) {
        const o = list[k];
        objs[k * 4] = o.x;
        objs[k * 4 + 1] = o.y;
        objs[k * 4 + 2] = o.r;
        objs[k * 4 + 3] = 1;
      }
    }

    function reset() {
      h.fill(0);
      v.fill(0);
      foam.fill(0);
      def.fill(0);
      bodies.clear();
      encode();
    }

    function stats() {
      let mx = 0, bad = 0, mv = 0;
      for (let i = 0; i < N; i++) {
        const a = Math.abs(h[i] + def[i]);
        if (!Number.isFinite(h[i])) bad++;
        else if (a > mx) mx = a;
        const b = Math.abs(v[i]);
        if (b > mv) mv = b;
      }
      return { maxH: +mx.toFixed(3), maxV: +mv.toFixed(3), bad, bodies: bodies.size };
    }

    return {
      init, resize, update, render, splash, setObjects, reset, stats, setMode, bubble, pop, slope,
      get ok() { return ok; },
      get floor() { return floorOf(mode); },
      get mode() { return mode; },
    };
  })();

  // ---------------------------------------------------------------------------
  // Buz Stadyumu: çatlayan dinamik buz
  // - Kalıcı iz katmanı: kayan disk ince çizikler, raket keçesi hafif sürtme izi bırakır.
  // - Sert şut / şiddetli duvar çarpması: çarpma noktasından dallanarak büyüyen çatlaklar
  //   (güçlü darbede halka çatlaklar); izler zamanla yavaşça "yeniden donar".
  // - Buzun altında süzülen ışık lekeleri ve yükselen silik kabarcıklar.
  // ---------------------------------------------------------------------------
  const Ice = (() => {
    const MK = 1.5; // iz katmanı çözünürlüğü (piksel / oyun birimi)
    let marks = null, mg = null, bubbleSprite = null, glowSprite = null;
    // Masa katmanı: izler ayrıca doğrudan buraya da çizilir (her karede tek kopya yeterli olur);
    // base = izsiz buz, yalnızca "yeniden donma" solmasında masa katmanını yeniden kurmak için.
    let tg = null, base = null;
    const targets = [];
    const cracks = [];
    const bubbles = [];
    const trails = new Map();
    let fadeT = 0, time = 0, scrapeLevel = 0;

    // Köşeleri yuvarlatılmış oyun alanının içinde mi
    function inField(x, y, pad = 3) {
      const R = 26;
      if (x < pad || y < pad || x > W - pad || y > H - pad) return false;
      const cx = clamp(x, R, W - R), cy = clamp(y, R, H - R);
      return Math.hypot(x - cx, y - cy) <= R - pad;
    }

    function newBubble(anyAge) {
      return {
        x: rand(24, W - 24), y: rand(24, H - 24), depth: rand(0.35, 1), r: rand(2.5, 7.5),
        vx: rand(-5, 5), vy: rand(-5, 5), ph: rand(0, TAU), age: anyAge ? rand(0, 9) : 0, life: rand(7, 15),
      };
    }

    function init() {
      if (marks) return;
      marks = document.createElement('canvas');
      marks.width = Math.round(W * MK);
      marks.height = Math.round(H * MK);
      mg = marks.getContext('2d');
      mg.setTransform(MK, 0, 0, MK, 0, 0);
      mg.lineCap = 'round';
      mg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg);

      bubbleSprite = document.createElement('canvas');
      bubbleSprite.width = bubbleSprite.height = 64;
      const b = bubbleSprite.getContext('2d');
      const gr = b.createRadialGradient(32, 32, 8, 32, 32, 30);
      gr.addColorStop(0, 'rgba(200, 240, 255, 0.04)');
      gr.addColorStop(0.72, 'rgba(210, 245, 255, 0.16)');
      gr.addColorStop(0.9, 'rgba(235, 252, 255, 0.55)');
      gr.addColorStop(1, 'rgba(235, 252, 255, 0)');
      b.fillStyle = gr;
      b.beginPath();
      b.arc(32, 32, 30, 0, TAU);
      b.fill();
      b.fillStyle = 'rgba(255, 255, 255, 0.75)';
      b.beginPath();
      b.ellipse(23, 22, 7, 3.5, -0.7, 0, TAU);
      b.fill();

      glowSprite = document.createElement('canvas');
      glowSprite.width = glowSprite.height = 128;
      const g2 = glowSprite.getContext('2d');
      const gg = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      gg.addColorStop(0, 'rgba(120, 235, 255, 0.6)');
      gg.addColorStop(1, 'rgba(120, 235, 255, 0)');
      g2.fillStyle = gg;
      g2.fillRect(0, 0, 128, 128);

      for (let i = 0; i < 26; i++) bubbles.push(newBubble(true));
    }

    // Masa katmanını bağla: izsiz halini sakla, mevcut izleri üzerine işle
    function attach(layer, g) {
      init();
      base = document.createElement('canvas');
      base.width = layer.width;
      base.height = layer.height;
      base.getContext('2d').drawImage(layer, 0, 0);
      tg = g;
      tg.setTransform(S, 0, 0, S, B * S, B * S);
      tg.lineCap = 'round';
      tg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg, tg);
      compose();
    }

    function compose() {
      if (!tg || !base) return;
      tg.save();
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'copy';
      tg.drawImage(base, 0, 0);
      tg.restore();
      tg.drawImage(marks, 0, 0, W, H);
    }

    function reset() {
      init();
      mg.save();
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, marks.width, marks.height);
      mg.restore();
      cracks.length = 0;
      trails.clear();
      compose();
    }

    // Dallanan kırık çizgileri üretir; t = çatlağın o noktaya ulaştığı mesafe (büyüme animasyonu)
    function genSegs(x, y, e, dir, spread) {
      const segs = [];
      const full = spread >= TAU - 0.01;
      // Buz gevrek kırılır: düz parçalar, arada keskin kırılma açıları, seyrek dallanma
      const n = Math.round(3 + e * 3 + Math.random());
      const baseLen = 35 + e * 160, baseW = 0.8 + e * 1.0;
      const grow = (sx, sy, a, len, w, dist, lvl) => {
        let x0 = sx, y0 = sy, rem = len;
        while (rem > 0 && segs.length < 700) {
          const sl = 7 + Math.random() * 11;
          a += (Math.random() - 0.5) * 0.28;
          if (Math.random() < 0.18) a += (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3);
          const x1 = x0 + Math.cos(a) * sl, y1 = y0 + Math.sin(a) * sl;
          if (!inField(x1, y1)) break;
          dist += sl;
          rem -= sl;
          segs.push({ x0, y0, x1, y1, w: w * (0.3 + 0.7 * Math.max(0, rem / len)), t: dist });
          x0 = x1;
          y0 = y1;
          if (lvl < 2 && rem > 20 && Math.random() < 0.08) {
            grow(x0, y0, a + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.55), rem * (0.3 + Math.random() * 0.3), w * 0.65, dist, lvl + 1);
          }
        }
      };
      for (let i = 0; i < n; i++) {
        const a = full ? (i / n) * TAU + (Math.random() - 0.5) * 0.6 : dir + (Math.random() - 0.5) * spread;
        grow(x, y, a, baseLen * (0.55 + Math.random() * 0.6), baseW, 0, 0);
      }
      // Güçlü darbede örümcek ağı gibi halka çatlaklar
      if (e > 0.55) {
        const rings = e > 0.9 ? 2 : 1;
        for (let k = 0; k < rings; k++) {
          const rr = (12 + e * 16) * (k + 1) * (0.85 + Math.random() * 0.3);
          const a0 = full ? 0 : dir - spread / 2, a1 = full ? TAU : dir + spread / 2;
          let a = a0 + Math.random() * 0.5;
          let px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          while (a < a1) {
            a += 0.18 + Math.random() * 0.22;
            const r2 = rr * (0.92 + Math.random() * 0.16);
            const nx = x + Math.cos(a) * r2, ny = y + Math.sin(a) * r2;
            if (Math.random() < 0.8 && inField(px, py) && inField(nx, ny)) {
              segs.push({ x0: px, y0: py, x1: nx, y1: ny, w: baseW * 0.55, t: rr + 30 + Math.random() * 20 });
            }
            px = nx;
            py = ny;
          }
        }
      }
      segs.sort((p, q) => p.t - q.t);
      return segs;
    }

    function line(g, x0, y0, x1, y1) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }

    // Çatlak: derinde koyu kırılma gölgesi + ışığı dağıtan buzlu hale + parlak beyaz çekirdek
    function drawSeg(g, s, alpha = 1) {
      g.strokeStyle = `rgba(0, 38, 66, ${0.3 * alpha})`;
      g.lineWidth = s.w + 1.2;
      line(g, s.x0 + 0.8, s.y0 + 1.2, s.x1 + 0.8, s.y1 + 1.2);
      g.strokeStyle = `rgba(215, 245, 255, ${0.14 * alpha})`;
      g.lineWidth = s.w * 4;
      line(g, s.x0, s.y0, s.x1, s.y1);
      g.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
      g.lineWidth = s.w;
      line(g, s.x0, s.y0, s.x1, s.y1);
    }

    // Darbe noktasında ezilip beyazlaşmış buz
    function bruise(x, y, r, a) {
      for (const g of targets) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        gr.addColorStop(0.5, `rgba(235, 250, 255, ${a * 0.45})`);
        gr.addColorStop(1, 'rgba(235, 250, 255, 0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    }

    function crack(x, y, e, dir = 0, spread = TAU) {
      init();
      e = clamp(e, 0.1, 1.2);
      x = clamp(x, 4, W - 4);
      y = clamp(y, 4, H - 4);
      const segs = genSegs(x, y, e, dir, spread);
      const maxT = segs.length ? segs[segs.length - 1].t : 1;
      cracks.push({ segs, i: 0, age: 0, dur: 0.16 + e * 0.22, maxT, e });
      bruise(x, y, 5 + e * 12, 0.35 + e * 0.35);
      if (cracks.length > 8) finish(cracks.shift());
    }

    function finish(c) {
      while (c.i < c.segs.length) {
        const sg = c.segs[c.i++];
        for (const g of targets) drawSeg(g, sg);
      }
    }

    // Kayma izleri: disk tabanının buzda açtığı ince paralel çizikler
    function scratch(id, x, y, r, speed, puck) {
      let tr = trails.get(id);
      if (!tr) {
        trails.set(id, { x, y, offs: [rand(-0.7, 0.7), rand(-0.7, 0.7), rand(-0.7, 0.7)] });
        return;
      }
      const dx = x - tr.x, dy = y - tr.y, d = Math.hypot(dx, dy);
      if (d > 160) { tr.x = x; tr.y = y; return; } // yeniden doğma / ışınlanma
      if (d < 0.6) return;
      const nx = -dy / d, ny = dx / d;
      if (Math.random() < 0.05) tr.offs[(Math.random() * 3) | 0] = rand(-0.7, 0.7);
      if (puck && speed > 170) {
        const col = `rgba(255, 255, 255, ${clamp(0.04 + speed / 7000, 0.04, 0.27).toFixed(3)})`;
        const lines = speed > 1100 && !quality.lite ? 3 : 2;
        for (const g of targets) {
          g.strokeStyle = col;
          g.lineWidth = 0.6;
          g.beginPath();
          for (let k = 0; k < lines; k++) {
            const o = tr.offs[k] * r;
            g.moveTo(tr.x + nx * o, tr.y + ny * o);
            g.lineTo(x + nx * o, y + ny * o);
          }
          g.stroke();
        }
      } else if (!puck && speed > 500) {
        const col = `rgba(235, 248, 255, ${Math.min(0.05, speed / 60000).toFixed(3)})`;
        for (const g of targets) {
          g.strokeStyle = col;
          g.lineWidth = r * 0.5;
          line(g, tr.x, tr.y, x, y);
        }
      }
      tr.x = x;
      tr.y = y;
    }

    function update(dt) {
      if (!marks) return;
      time += dt;

      // Çatlakların büyümesi (çatlak ucu hızla ilerler, uçlarda buz kristali pırıltısı)
      for (let k = cracks.length - 1; k >= 0; k--) {
        const c = cracks[k];
        c.age += dt;
        const upto = Math.min(1, c.age / c.dur) * c.maxT;
        let drawn = 0;
        while (c.i < c.segs.length && c.segs[c.i].t <= upto) {
          const s = c.segs[c.i++];
          for (const g of targets) drawSeg(g, s);
          if (++drawn % 14 === 0 && Math.random() < 0.6) spawn(s.x1, s.y1, '235,250,255', 1, 90, 0.35, 1.8);
        }
        if (c.i >= c.segs.length) cracks.splice(k, 1);
      }

      // Kayma izleri
      let sp = 0;
      for (let i = 0; i < pucks.length; i++) {
        const p = pucks[i];
        if (!p.active) { trails.delete('p' + i); continue; }
        const v = Math.hypot(p.vx, p.vy);
        sp += Math.min(v, 2000);
        scratch('p' + i, p.x, p.y, PUCK_R, v, true);
      }
      for (let i = 0; i < 2; i++) {
        const m = mallets[i];
        scratch('m' + i, m.x, m.y, MALLET_R, Math.hypot(m.vx, m.vy), false);
      }
      // Diskin buzda kayma sesi hıza göre
      const lvl = game.state === 'play' ? Math.min(0.07, (sp / 2000) * 0.05) : 0;
      if (Math.abs(lvl - scrapeLevel) > 0.003) {
        scrapeLevel = lvl;
        Sound.setScrape(lvl);
      }

      // Yeniden donma: izler yavaşça silinir
      fadeT += dt;
      if (fadeT > 1.5) {
        fadeT = 0;
        mg.save();
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.globalCompositeOperation = 'destination-out';
        mg.fillStyle = 'rgba(0, 0, 0, 0.035)';
        mg.fillRect(0, 0, marks.width, marks.height);
        mg.restore();
        compose();
      }

      // Buz altındaki kabarcıklar: yavaşça yükselir, akıntıyla süzülür
      const n = quality.lite ? 16 : bubbles.length;
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        b.age += dt;
        const k = 1.2 - b.depth;
        b.x += (b.vx + Math.sin(time * 0.7 + b.ph) * 3) * dt * k;
        b.y += (b.vy + Math.cos(time * 0.6 + b.ph) * 3) * dt * k;
        b.depth = Math.max(0.05, b.depth - dt * 0.03);
        if (b.age > b.life || !inField(b.x, b.y, 12)) bubbles[i] = newBubble(false);
      }
    }

    function drawUnder(c) {
      if (!marks) return;
      // Buzun altında süzülen ışık lekeleri (saha içinde kalacak boyutta: kırpma maskesi gerekmez)
      if (!quality.lite) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.1;
        const x = W / 2 + 70 * Math.sin(time * 0.05);
        const y = H * (0.5 + 0.28 * Math.cos(time * 0.04));
        c.drawImage(glowSprite, x - 150, y - 150, 300, 300);
        c.globalCompositeOperation = 'source-over';
      }
      const n = quality.lite ? 16 : bubbles.length;
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        const fade = Math.min(1, b.age / 1.5, (b.life - b.age) / 1.5);
        c.globalAlpha = Math.max(0, (0.1 + (1 - b.depth) * 0.3) * fade);
        const s = b.r * 2 * (1.6 - b.depth * 0.8);
        c.drawImage(bubbleSprite, b.x - s / 2, b.y - s / 2, s, s);
      }
      c.globalAlpha = 1;
    }

    // Masa katmanına, buzun içinde kalmış eski (iyileşmiş) silik çatlakları çizer
    function staticFractures(g) {
      for (let i = 0; i < 5; i++) {
        const segs = genSegs(rand(60, W - 60), rand(80, H - 80), rand(0.3, 0.8), 0, TAU);
        for (const s of segs) drawSeg(g, s, 0.12);
      }
    }

    return { init, reset, attach, crack, update, drawUnder, staticFractures, genSegs, bruise: (x, y, r, a) => { init(); bruise(x, y, r, a); } };
  })();

  // ---------------------------------------------------------------------------
  // Lav Stadyumu: kırılan bazalt kabuk ve altından akan lav
  // - Kalıcı katman (masa katmanı + izler): kabuk, is lekeleri, yeni kırıkların koyu kenarları.
  // - Parıltı katmanı: kabuğun çatlak ağından sızan lav, nabız gibi parlar ve titreşir.
  // - Isı katmanı: kayan diskin kızdırdığı iz ve yeni kırıklardan fışkıran lav; soğudukça
  //   turuncudan koyu kırmızıya döner ve kabuk yeniden bağlar.
  // ---------------------------------------------------------------------------
  const Lava = (() => {
    const MK = 1.5;   // kalıcı iz katmanı (piksel / birim)
    const GK = 0.5;   // parıltı ve ısı katmanları: düşük çözünürlük (büyütülünce doğal bulanıklık)
    let marks = null, mg = null, glow = null, heat = null, hg = null, tg = null, base = null;
    const targets = [];
    let crustImg = null, seamPts = null;
    const hot = [];      // soğumakta olan yeni kırıklar
    const growing = [];  // büyüyen kırıklar
    const embers = [];
    const trails = new Map();
    let time = 0, coolT = 0, fadeT = 0, bubbleT = 1, hotT = 0;
    // Isı katmanında son birkaç saniyede boyanan bölge (hafif modda yalnızca burası çizilir)
    const hb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, t: 0 };
    function touch(x0, y0, x1, y1, pad) {
      hb.x0 = Math.min(hb.x0, Math.min(x0, x1) - pad);
      hb.y0 = Math.min(hb.y0, Math.min(y0, y1) - pad);
      hb.x1 = Math.max(hb.x1, Math.max(x0, x1) + pad);
      hb.y1 = Math.max(hb.y1, Math.max(y0, y1) + pad);
      hb.t = 3.5;
    }

    function newEmber() {
      return { x: rand(10, W - 10), y: rand(10, H - 10), vx: rand(-14, 14), vy: rand(-22, -6), life: rand(2, 5), age: 0, s: rand(1, 2.4), ph: rand(0, TAU) };
    }

    function init() {
      if (marks) return;
      const mk = (k) => {
        const c = document.createElement('canvas');
        c.width = Math.round(W * k);
        c.height = Math.round(H * k);
        const g = c.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        return [c, g];
      };
      [marks, mg] = mk(MK);
      let gg;
      [glow, gg] = mk(GK);
      [heat, hg] = mk(GK);
      targets.length = 0;
      targets.push(mg);

      buildCrust(gg);
      for (let i = 0; i < 24; i++) embers.push(newEmber());
    }

    // Kabuk: düzensiz çokgen plakalar (bükülmüş Voronoi hücreleri); plakalar arasındaki
    // dikişlerden lav görünür. Piksel piksel bir kez hesaplanır.
    function buildCrust(gg) {
      const cols = 6, rows = 10, cw = W / cols, ch = H / rows;
      const seeds = [];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          seeds.push([(i + 0.15 + Math.random() * 0.7) * cw, (j + 0.15 + Math.random() * 0.7) * ch, Math.random()]);
        }
      }
      // (x, y) için en yakın iki plaka merkezine uzaklık farkı: dikişe olan mesafenin ölçüsü
      const cell = (x, y) => {
        // Kenarları düzensizleştiren bükme
        const wx = x + Math.sin(y * 0.045) * 7 + Math.sin(y * 0.13 + x * 0.05) * 3;
        const wy = y + Math.sin(x * 0.05) * 7 + Math.cos(x * 0.12 - y * 0.04) * 3;
        const ci = clamp(Math.floor(wx / cw), 0, cols - 1), cj = clamp(Math.floor(wy / ch), 0, rows - 1);
        let d1 = 1e9, d2 = 1e9, k1 = 0;
        for (let j = Math.max(0, cj - 1); j <= Math.min(rows - 1, cj + 1); j++) {
          for (let i = Math.max(0, ci - 1); i <= Math.min(cols - 1, ci + 1); i++) {
            const sd = seeds[j * cols + i];
            const d = Math.hypot(wx - sd[0], wy - sd[1]);
            if (d < d1) { d2 = d1; d1 = d; k1 = j * cols + i; } else if (d < d2) d2 = d;
          }
        }
        return [d2 - d1, seeds[k1][2]];
      };

      // Kabuk dokusu (1 piksel / birim)
      const cc = document.createElement('canvas');
      cc.width = W;
      cc.height = H;
      const cx = cc.getContext('2d');
      const img = cx.createImageData(W, H);
      const d = img.data;
      seamPts = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const [m, tone] = cell(x, y);
          const n = Math.random();
          let r, gC, b;
          if (m < 2.2) {
            // Dikişin kızgın özü
            const k = 1 - m / 2.2;
            r = 140 + 85 * k; gC = 36 + 50 * k * k; b = 10;
            if (m < 0.8 && Math.random() < 0.004) seamPts.push([x, y]);
          } else if (m < 6) {
            // Dikişin kararmış kenarı
            const k = (m - 2.2) / 3.8;
            r = 40 + 30 * k; gC = 14 + 14 * k; b = 8 + 8 * k;
          } else {
            // Plaka: kendi tonu, kenara doğru koyulaşan kabartma, pürüzlü yüzey
            const lift = Math.min(1, (m - 6) / 30);
            const base = 34 + tone * 18 + lift * 16;
            r = base + 8 + n * 10; gC = base * 0.72 + n * 7; b = base * 0.6 + n * 6;
          }
          const i = (y * W + x) * 4;
          d[i] = r; d[i + 1] = gC; d[i + 2] = b; d[i + 3] = 255;
        }
      }
      cx.putImageData(img, 0, 0);
      crustImg = cc;

      // Parıltı katmanı: dikişlerden sızan lav (düşük çözünürlük, doğal bulanık)
      const gw = glow.width, gh = glow.height;
      const gi = gg.createImageData(gw, gh);
      const gd = gi.data;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const [m] = cell(x / GK, y / GK);
          const a = Math.max(0, 1 - m / 9);
          const i = (y * gw + x) * 4;
          gd[i] = 255; gd[i + 1] = 90 + 110 * a * a; gd[i + 2] = 20 + 40 * a * a * a; gd[i + 3] = 255 * a * a;
        }
      }
      gg.putImageData(gi, 0, 0);
    }

    function segLine(g, s) {
      g.beginPath();
      g.moveTo(s.x0, s.y0);
      g.lineTo(s.x1, s.y1);
      g.stroke();
    }

    // Kabuk çatlağı: masa katmanında koyu kızıl yarık + ince turuncu öz
    function crustSeg(g, s, a = 1) {
      g.strokeStyle = `rgba(28, 6, 2, ${0.9 * a})`;
      g.lineWidth = s.w + 3;
      segLine(g, s);
      g.strokeStyle = `rgba(122, 28, 6, ${a})`;
      g.lineWidth = s.w + 1;
      segLine(g, s);
      g.strokeStyle = `rgba(170, 45, 10, ${0.45 * a})`;
      g.lineWidth = s.w * 0.5;
      segLine(g, s);
    }

    // Yeni kırıktan fışkıran sıcak lav (ısı katmanına)
    function lavaSeg(s, a) {
      touch(s.x0, s.y0, s.x1, s.y1, s.w * 3 + 6);
      hg.strokeStyle = `rgba(255, 110, 20, ${a})`;
      hg.lineWidth = s.w * 4 + 4;
      segLine(hg, s);
      hg.strokeStyle = `rgba(255, 235, 150, ${a})`;
      hg.lineWidth = s.w * 1.4 + 1;
      segLine(hg, s);
    }

    function pool(x, y, r, a) {
      touch(x, y, x, y, r + 2);
      const gr = hg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255, 245, 190, ${a})`);
      gr.addColorStop(0.35, `rgba(255, 150, 40, ${a * 0.8})`);
      gr.addColorStop(1, 'rgba(255, 60, 0, 0)');
      hg.fillStyle = gr;
      hg.beginPath();
      hg.arc(x, y, r, 0, TAU);
      hg.fill();
    }

    function attach(layer, g) {
      init();
      base = document.createElement('canvas');
      base.width = layer.width;
      base.height = layer.height;
      base.getContext('2d').drawImage(layer, 0, 0);
      tg = g;
      tg.setTransform(S, 0, 0, S, B * S, B * S);
      tg.lineCap = 'round';
      tg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg, tg);
      compose();
    }

    function compose() {
      if (!tg || !base) return;
      tg.save();
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'copy';
      tg.drawImage(base, 0, 0);
      tg.restore();
      tg.drawImage(marks, 0, 0, W, H);
    }

    function clear(g, c) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.restore();
    }

    function reset() {
      init();
      clear(mg, marks);
      clear(hg, heat);
      hot.length = 0;
      growing.length = 0;
      trails.clear();
      compose();
    }

    // Kabuk kırılır: çatlak büyür, altından lav fışkırır
    function breakCrust(x, y, e, dir = 0, spread = TAU) {
      init();
      e = clamp(e, 0.1, 1.2);
      x = clamp(x, 4, W - 4);
      y = clamp(y, 4, H - 4);
      const segs = Ice.genSegs(x, y, e * 0.7, dir, spread);
      const maxT = segs.length ? segs[segs.length - 1].t : 1;
      const c = { segs, i: 0, age: 0, dur: 0.14 + e * 0.2, maxT, heatAge: 0, life: 4 + e * 4 };
      growing.push(c);
      hot.push(c);
      if (hot.length > 8) hot.shift();
      pool(x, y, 12 + e * 26, 0.9);
      for (const g of targets) {
        g.fillStyle = `rgba(20, 6, 2, ${0.4 + e * 0.3})`;
        g.beginPath();
        g.arc(x, y, 5 + e * 9, 0, TAU);
        g.fill();
      }
    }

    // Kayan disk kabuğu kızdırır ve is bırakır
    function slide(id, x, y, r, speed, puck) {
      let tr = trails.get(id);
      if (!tr) {
        trails.set(id, { x, y });
        return;
      }
      const d = Math.hypot(x - tr.x, y - tr.y);
      if (d > 160) { tr.x = x; tr.y = y; return; }
      if (d < 0.6) return;
      if (puck && speed > 150) {
        touch(tr.x, tr.y, x, y, r + 2);
        const a = Math.min(0.55, speed / 3600);
        hg.strokeStyle = `rgba(255, 110, 25, ${a.toFixed(3)})`;
        hg.lineWidth = r * 1.15;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
        hg.strokeStyle = `rgba(255, 225, 130, ${(a * 0.7).toFixed(3)})`;
        hg.lineWidth = r * 0.4;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
        const soot = `rgba(8, 3, 2, ${Math.min(0.06, speed / 30000).toFixed(3)})`;
        for (const g of targets) {
          g.strokeStyle = soot;
          g.lineWidth = r * 1.2;
          g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(x, y); g.stroke();
        }
      } else if (!puck && speed > 400 && !quality.lite) {
        touch(tr.x, tr.y, x, y, r + 2);
        hg.strokeStyle = `rgba(255, 90, 20, ${Math.min(0.08, speed / 30000).toFixed(3)})`;
        hg.lineWidth = r * 0.9;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
      }
      tr.x = x;
      tr.y = y;
    }

    function update(dt) {
      if (!marks) return;
      time += dt;

      // Büyüyen kırıklar
      for (let k = growing.length - 1; k >= 0; k--) {
        const c = growing[k];
        c.age += dt;
        const upto = Math.min(1, c.age / c.dur) * c.maxT;
        let n = 0;
        while (c.i < c.segs.length && c.segs[c.i].t <= upto) {
          const s = c.segs[c.i++];
          for (const g of targets) crustSeg(g, s);
          lavaSeg(s, 0.9);
          if (++n % 10 === 0 && Math.random() < 0.7) spawn(s.x1, s.y1, '255,170,60', 1, 120, 0.5, 2, { keep: true });
        }
        if (c.i >= c.segs.length) growing.splice(k, 1);
      }

      // Yeni kırıklar birkaç saniye sıcak kalır, sonra kabuk bağlar
      hotT += dt;
      if (hotT > 0.25) {
        hotT = 0;
        for (let k = hot.length - 1; k >= 0; k--) {
          const c = hot[k];
          c.heatAge += 0.25;
          const a = 0.3 * (1 - c.heatAge / c.life);
          if (a <= 0) { hot.splice(k, 1); continue; }
          for (let i = 0; i < c.i; i++) lavaSeg(c.segs[i], a);
        }
      }

      // Kızgın izler
      for (let i = 0; i < pucks.length; i++) {
        const p = pucks[i];
        if (!p.active) { trails.delete('p' + i); continue; }
        slide('p' + i, p.x, p.y, PUCK_R, Math.hypot(p.vx, p.vy), true);
      }
      for (let i = 0; i < 2; i++) {
        const m = mallets[i];
        slide('m' + i, m.x, m.y, MALLET_R, Math.hypot(m.vx, m.vy), false);
      }

      // Soğuma: ısı katmanı hızla, kalıcı izler yavaşça söner
      hb.t -= dt;
      if (hb.t <= 0) { hb.x0 = hb.y0 = 1e9; hb.x1 = hb.y1 = -1e9; }
      coolT += dt;
      if (coolT > 0.08) {
        coolT = 0;
        hg.save();
        hg.setTransform(1, 0, 0, 1, 0, 0);
        hg.globalCompositeOperation = 'destination-out';
        hg.fillStyle = 'rgba(0, 0, 0, 0.08)';
        hg.fillRect(0, 0, heat.width, heat.height);
        // Dikişlerden sızan lavın nabzı ısı katmanına işlenir: her karede ayrı bir katman
        // çizmek gerekmez (denge düzeyi = eklenen / sönen oran)
        if (!quality.lite) {
          hg.globalCompositeOperation = 'source-over';
          hg.globalAlpha = 0.08 * (0.3 + 0.16 * Math.sin(time * 1.3) + 0.06 * Math.sin(time * 5.3));
          hg.drawImage(glow, 0, 0);
        }
        hg.restore();
      }
      fadeT += dt;
      if (fadeT > 1.5) {
        fadeT = 0;
        mg.save();
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.globalCompositeOperation = 'destination-out';
        mg.fillStyle = 'rgba(0, 0, 0, 0.03)';
        mg.fillRect(0, 0, marks.width, marks.height);
        mg.restore();
        compose();
      }

      // Çatlaklarda arada bir patlayan lav kabarcığı
      bubbleT -= dt;
      if (bubbleT <= 0 && seamPts.length) {
        bubbleT = rand(0.6, 1.8);
        const [bx, by] = seamPts[(Math.random() * seamPts.length) | 0];
        pool(bx, by, rand(6, 12), 0.7);
        spawn(bx, by, '255,160,50', 3, 60, 0.6, 1.8, { keep: true });
        if (game.state === 'play') Sound.bloop(bx);
      }

      // Kıvılcımlar: sıcak havada yükselip sönen közler
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.age += dt;
        e.x += (e.vx + Math.sin(time * 1.3 + e.ph) * 10) * dt;
        e.y += e.vy * dt;
        if (e.age > e.life || e.x < 4 || e.x > W - 4 || e.y < 4) embers[i] = newEmber();
      }
    }

    function drawOver(c) {
      if (!marks) return;
      c.globalCompositeOperation = 'lighter';
      // Isı katmanı: kızgın izler, yeni kırıklar ve dikişlerin nabzı tek çizimde.
      // Hafif modda nabız yok: yalnızca son ısınan bölge çizilir.
      if (!quality.lite) {
        c.drawImage(heat, 0, 0, W, H);
      } else if (hb.x1 > hb.x0) {
        const x0 = clamp(Math.floor(hb.x0), 0, W), y0 = clamp(Math.floor(hb.y0), 0, H);
        const x1 = clamp(Math.ceil(hb.x1), 0, W), y1 = clamp(Math.ceil(hb.y1), 0, H);
        if (x1 - x0 > 2 && y1 - y0 > 2) {
          c.drawImage(heat, x0 * GK, y0 * GK, (x1 - x0) * GK, (y1 - y0) * GK, x0, y0, x1 - x0, y1 - y0);
        }
      }
      // Közler
      const n = quality.lite ? 10 : embers.length;
      c.fillStyle = 'rgb(255, 170, 70)';
      for (let i = 0; i < n; i++) {
        const e = embers[i];
        const f = Math.min(1, e.age / 0.5, (e.life - e.age) / 0.8);
        c.globalAlpha = Math.max(0, f * (0.55 + 0.45 * Math.sin(time * 9 + e.ph)));
        c.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    return {
      init, reset, attach, update, drawOver, breakCrust,
      get crust() { init(); return crustImg; },
      get glow() { init(); return glow; },
      pool: (x, y, r, a) => { init(); pool(x, y, r, a); },
    };
  })();

  // ---------------------------------------------------------------------------
  // Kum Stadyumu: itilen, yığılan ve çığ gibi kayan kum
  // Fizik: kum yükseklik alanı. Raket ve disk altındaki kumu kazır, aynı hacmi önüne ve
  // yanlarına yığar (hacim korunur). Yığın, yığılma açısını aşınca komşusuna kayar (çığ);
  // rüzgâr oluklar zamanla doldurur, dalgacıkları geri getirir.
  // Görüntü: alçak açılı güneşle her hücrenin eğimine göre ışık/gölge; kazılan yerler nemli
  // (koyu) kum gösterir; rüzgârla sürüklenen kum taneleri.
  // ---------------------------------------------------------------------------
  const Sand = (() => {
    const CELL = 4, NX = Math.round(W / CELL), NY = Math.round(H / CELL), N = NX * NY;
    const h = new Float32Array(N), h0 = new Float32Array(N);
    const REPOSE = 2.4;      // komşu hücreler arası en büyük yükseklik farkı (~31° yığılma açısı)
    const CREEP = 0.0016;    // rüzgârın oluğu doldurma hızı (kare başına)
    // Güneş: sol üstten, alçak açı
    const LL = Math.hypot(-0.62, 0.42, -0.66);
    const LX = -0.62 / LL, LY = 0.42 / LL, LZ = -0.66 / LL;
    let shade = null, sg = null, img = null;
    const bodies = new Map();
    const streaks = [];
    let time = 0, flip = 0, scrapeLevel = 0;

    function newStreak() {
      return { x: rand(-40, W), y: rand(0, H), v: rand(45, 90), l: rand(5, 12), life: rand(1.5, 4), age: 0 };
    }

    function init() {
      if (shade) return;
      // Başlangıç zemini: büyük hafif tepeler + rüzgâra dik, asimetrik dalgacıklar
      for (let y = 0; y < NY; y++) {
        for (let x = 0; x < NX; x++) {
          const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
          const u = px * 0.8 + py * 0.6;
          const wob = Math.sin(py * 0.021 + px * 0.013) * 6 + Math.sin(px * 0.047 - py * 0.031) * 3;
          let rip = Math.sin(((u + wob) * TAU) / 17);
          rip = rip > 0 ? rip : rip * 0.55; // rüzgâr tarafı yumuşak, rüzgâraltı dik
          const dunes = Math.sin(px * 0.009 + 1) * Math.cos(py * 0.006) * 2.2 + Math.sin((px + py) * 0.004) * 1.5;
          h0[y * NX + x] = dunes + rip * 0.55 + (Math.random() - 0.5) * 0.12;
        }
      }
      h.set(h0);
      shade = document.createElement('canvas');
      shade.width = NX;
      shade.height = NY;
      sg = shade.getContext('2d');
      img = sg.createImageData(NX, NY);
      for (let i = 0; i < 18; i++) streaks.push(newStreak());
    }

    function reset() {
      init();
      h.set(h0);
      bodies.clear();
      computeShade();
    }

    // Pulluk: dairenin içindeki kum kazınır, hacim önde/yanlarda halkaya yığılır
    function plow(x, y, r, depth, dx, dy) {
      const gx = x / CELL - 0.5, gy = y / CELL - 0.5, gr = r / CELL, gr2 = gr * 1.55;
      const x0 = Math.max(0, Math.floor(gx - gr2)), x1 = Math.min(NX - 1, Math.ceil(gx + gr2));
      const y0 = Math.max(0, Math.floor(gy - gr2)), y1 = Math.min(NY - 1, Math.ceil(gy + gr2));
      let V = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const d = Math.hypot(xx - gx, yy - gy);
          if (d >= gr) continue;
          const i = yy * NX + xx, t = d / gr;
          const target = h0[i] - depth * (1 - t * t);
          if (h[i] > target) {
            const m = (h[i] - target) * 0.6;
            h[i] -= m;
            V += m;
          }
        }
      }
      if (V <= 0) return;
      let ws = 0;
      const ring = [];
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const ox = xx - gx, oy = yy - gy, d = Math.hypot(ox, oy);
          if (d < gr || d >= gr2) continue;
          const front = (ox * dx + oy * dy) / d; // hareket yönünde daha çok yığılır
          const w = (1 - (d - gr) / (gr2 - gr)) * (0.3 + Math.max(0, front));
          ring.push(yy * NX + xx, w);
          ws += w;
        }
      }
      if (ws <= 0) return;
      for (let k = 0; k < ring.length; k += 2) h[ring[k]] += (V * ring[k + 1]) / ws;
    }

    // Patlama: krater açılır, kum çevreye rastgele savrulur
    function blast(x, y, e) {
      init();
      e = clamp(e, 0.1, 1.4);
      const r = 12 + e * 22, depth = 3 + e * 7;
      const gx = x / CELL - 0.5, gy = y / CELL - 0.5, gr = r / CELL, gr2 = gr * 2;
      const x0 = Math.max(0, Math.floor(gx - gr2)), x1 = Math.min(NX - 1, Math.ceil(gx + gr2));
      const y0 = Math.max(0, Math.floor(gy - gr2)), y1 = Math.min(NY - 1, Math.ceil(gy + gr2));
      let V = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const d = Math.hypot(xx - gx, yy - gy);
          if (d >= gr) continue;
          const i = yy * NX + xx, t = d / gr;
          const target = h0[i] - depth * (1 - t * t);
          if (h[i] > target) { V += h[i] - target; h[i] = target; }
        }
      }
      let ws = 0;
      const ring = [];
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const d = Math.hypot(xx - gx, yy - gy);
          if (d < gr || d >= gr2) continue;
          // Çoğu kum kraterin dudağına, bir kısmı öbek öbek daha uzağa düşer
          const t = (d - gr) / (gr2 - gr);
          const w = Math.pow(1 - t, 2.2) * 1.6 + (Math.random() < 0.18 ? Math.random() : 0);
          ring.push(yy * NX + xx, w);
          ws += w;
        }
      }
      if (ws > 0) for (let k = 0; k < ring.length; k += 2) h[ring[k]] += (V * ring[k + 1]) / ws;
    }

    // Çığ: eğim yığılma açısını aşınca fazlalık komşuya kayar
    function relax() {
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        for (let x = 0; x < NX; x++) {
          const i = row + x;
          if (x < NX - 1) {
            const d = h[i] - h[i + 1];
            if (d > REPOSE) { const m = (d - REPOSE) * 0.25; h[i] -= m; h[i + 1] += m; }
            else if (d < -REPOSE) { const m = (-d - REPOSE) * 0.25; h[i + 1] -= m; h[i] += m; }
          }
          if (y < NY - 1) {
            const j = i + NX;
            const d = h[i] - h[j];
            if (d > REPOSE) { const m = (d - REPOSE) * 0.25; h[i] -= m; h[j] += m; }
            else if (d < -REPOSE) { const m = (-d - REPOSE) * 0.25; h[j] -= m; h[i] += m; }
          }
        }
      }
    }

    // Güneş ışığı: eğime göre aydınlık/gölge + kazılmış (nemli) kum
    function computeShade() {
      const d = img.data;
      const flat = LY;
      const inv = 1 / (2 * CELL);
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
        for (let x = 0; x < NX; x++) {
          const i = row + x;
          const gx = ((x < NX - 1 ? h[i + 1] : h[i]) - (x > 0 ? h[i - 1] : h[i])) * inv;
          const gz = (h[dn + x] - h[up + x]) * inv;
          const len = Math.sqrt(gx * gx + 1 + gz * gz);
          const s = (-gx * LX + LY - gz * LZ) / len - flat;
          // Kazılan (alttaki nemli) kum biraz koyu; eğim ışığı üstüne eklenir
          const dig = h0[i] - h[i];
          const L = (s < 0 ? s * 560 : s * 360) - (dig > 0.3 ? Math.min(dig, 7) * 11 : 0);
          const j = i * 4;
          if (L < 0) {
            d[j] = 96; d[j + 1] = 58; d[j + 2] = 26;
            d[j + 3] = Math.min(210, -L);
          } else {
            d[j] = 255; d[j + 1] = 246; d[j + 2] = 224;
            d[j + 3] = Math.min(150, L);
          }
        }
      }
      sg.putImageData(img, 0, 0);
    }

    function update(dt) {
      if (!shade) return;
      time += dt;
      let noise = 0;
      const move = (id, x, y, r, depth) => {
        const b = bodies.get(id);
        if (!b) { bodies.set(id, { x, y }); return 0; }
        const dx = x - b.x, dy = y - b.y, dist = Math.hypot(dx, dy);
        if (dist < 0.4) return 0;
        if (dist > 160) { b.x = x; b.y = y; return 0; }
        const steps = Math.min(14, Math.ceil(dist / (r * 0.35)));
        const ux = dx / dist, uy = dy / dist;
        for (let s = 1; s <= steps; s++) plow(b.x + (dx * s) / steps, b.y + (dy * s) / steps, r, depth, ux, uy);
        b.x = x;
        b.y = y;
        return dist / dt;
      };
      for (let i = 0; i < 2; i++) noise += Math.min(1500, move('m' + i, mallets[i].x, mallets[i].y, MALLET_R * 0.9, 2.6)) * 0.4;
      for (let i = 0; i < pucks.length; i++) {
        const p = pucks[i];
        if (!p.active) { bodies.delete('p' + i); continue; }
        noise += Math.min(2000, move('p' + i, p.x, p.y, PUCK_R, 1.4));
      }
      relax();
      if (!quality.lite) relax();
      for (let i = 0; i < N; i++) h[i] += (h0[i] - h[i]) * CREEP;
      // Hafif modda gölgelendirme iki karede bir
      flip ^= 1;
      if (!quality.lite || flip) computeShade();

      // Kum hışırtısı: hareket eden raket ve disklerin hızına göre
      const lvl = game.state === 'play' ? Math.min(0.08, (noise / 2500) * 0.06) : 0;
      if (Math.abs(lvl - scrapeLevel) > 0.003) {
        scrapeLevel = lvl;
        Sound.setScrape(lvl);
      }
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i];
        s.age += dt;
        s.x += s.v * 0.8 * dt;
        s.y += s.v * 0.6 * dt;
        if (s.age > s.life || s.x > W + 10 || s.y > H + 10) streaks[i] = newStreak();
      }
    }

    function drawOver(c) {
      if (!shade) return;
      c.drawImage(shade, 0, 0, W, H);
      // Rüzgârla sürüklenen kum taneleri
      const n = quality.lite ? 8 : streaks.length;
      c.strokeStyle = 'rgb(248, 230, 190)';
      c.lineWidth = 0.9;
      for (let i = 0; i < n; i++) {
        const s = streaks[i];
        c.globalAlpha = 0.3 * Math.min(1, s.age / 0.4, (s.life - s.age) / 0.6);
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.lineTo(s.x - s.l * 0.8, s.y - s.l * 0.6);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    return { init, reset, update, drawOver, blast };
  })();

  // ---------------------------------------------------------------------------
  // Uzay Stadyumu (Kutup Işığı / Yerçekimi Ağı): zeminde ışıktan bir ağ. Ağın düğümleri yaylarla
  // dinlenme konumlarına ve komşularına bağlıdır (iki boyutlu dalga denklemi): raketler ve paklar
  // kütleleriyle ağı kendilerine doğru büker; hızlı hareket, vuruş ve çarpışmalar ağda yayılan
  // dalgalar üretir, dalgalar bantlardan yansır. Ağın ardında dalgalanan kutup ışığı perdeleri ve
  // ağın bükülmesiyle kayan (merceklenen) yıldızlar vardır. Gol bir süpernova patlamasıdır.
  // ---------------------------------------------------------------------------
  const Space = (() => {
    const GS = 30, GX = W / GS + 1, GY = H / GS + 1, GN = GX * GY;
    const ux = new Float32Array(GN), uy = new Float32Array(GN);
    const vx = new Float32Array(GN), vy = new Float32Array(GN);
    const fx = new Float32Array(GN), fy = new Float32Array(GN);
    const lvl = new Uint8Array(GN);
    const K_NB = 900;      // komşu yayları (dalga hızı ≈ √K_NB · GS ≈ 600 birim/sn)
    const K_REST = 150;    // dinlenme konumuna çeken yay (bükülme yerel kalsın)
    const DAMP = 4;
    const MAXU = 20;
    const LEVELS = [
      // renk, çizgi kalınlığı
      ['rgba(95, 120, 255, 0.3)', 1],
      ['rgba(120, 165, 255, 0.6)', 1.15],
      ['rgba(110, 195, 255, 0.58)', 1.35],
      ['rgba(150, 230, 255, 0.78)', 1.6],
      ['rgba(225, 250, 255, 0.95)', 1.9],
    ];
    const stars = [];
    const novas = [];
    let aurora = null, time = 0, humLevel = 0;
    // Kutup ışığı düşük çözünürlüklü ayrı bir katmanda birkaç karede bir çizilir. Ağın parıltısı,
    // düğüm başına bir pikselli minik bir görüntüden büyütülerek (yumuşak hale) elde edilir:
    // geniş parıltı çizgileri çizmekten çok daha ucuz.
    const FXS = 3;
    let auroraC = null, auroraG = null, hazeC = null, hazeG = null, hazeImg = null, fxC = null, fxG = null, frame = 0;
    const paths = [];
    const energy = new Float32Array(GN);
    const segs = new Float32Array(GN * 2 * 5); // x0, y0, x1, y1, düzey
    let segN = 0;

    // Perde: dikey renk geçişi (256 adımlık tablo, önçarpımlı) × yatayda ince ışık sütunları
    function makeCurtain(stops, seed) {
      const c = document.createElement('canvas');
      c.width = 1;
      c.height = 256;
      const gg = c.getContext('2d');
      const gr = gg.createLinearGradient(0, 0, 0, 256);
      for (const [o, col] of stops) gr.addColorStop(o, col);
      gg.fillStyle = gr;
      gg.fillRect(0, 0, 1, 256);
      const d = gg.getImageData(0, 0, 1, 256).data;
      const lut = new Float32Array(256 * 3);
      for (let y = 0; y < 256; y++) {
        const a = d[y * 4 + 3] / 255;
        lut[y * 3] = d[y * 4] * a;
        lut[y * 3 + 1] = d[y * 4 + 1] * a;
        lut[y * 3 + 2] = d[y * 4 + 2] * a;
      }
      const cols = Math.ceil(W / FXS);
      const ray = new Float32Array(cols);
      const ph = [seed, seed * 1.7, seed * 2.3, seed * 3.1];
      for (let x = 0; x < cols; x++) {
        const u = (x / cols) * TAU;
        const r = 0.5 + 0.22 * Math.sin(u * 3 + ph[0]) + 0.16 * Math.sin(u * 7 + ph[1]) + 0.12 * Math.sin(u * 13 + ph[2]) + 0.1 * Math.sin(u * 23 + ph[3]);
        ray[x] = clamp(r, 0.08, 1);
      }
      return { lut, ray };
    }

    function init() {
      if (aurora) return;
      // Perdenin alt kenarı keskin ve parlak, yukarı doğru soluyor (gerçek kutup ışığı gibi)
      const green = makeCurtain([[0, 'rgba(90, 60, 200, 0)'], [0.3, 'rgba(90, 80, 220, 0.1)'], [0.62, 'rgba(40, 200, 170, 0.3)'],
        [0.86, 'rgba(90, 255, 170, 0.7)'], [0.93, 'rgba(190, 255, 220, 0.9)'], [1, 'rgba(120, 255, 190, 0)']], 1.3);
      const violet = makeCurtain([[0, 'rgba(255, 60, 160, 0)'], [0.4, 'rgba(200, 60, 200, 0.12)'], [0.85, 'rgba(170, 90, 255, 0.5)'],
        [0.92, 'rgba(240, 170, 255, 0.75)'], [1, 'rgba(200, 120, 255, 0)']], 4.1);
      auroraC = document.createElement('canvas');
      auroraC.width = Math.ceil(W / FXS);
      auroraC.height = Math.ceil(H / FXS);
      auroraG = auroraC.getContext('2d');
      hazeC = document.createElement('canvas');
      hazeC.width = GX;
      hazeC.height = GY;
      hazeG = hazeC.getContext('2d');
      hazeImg = hazeG.createImageData(GX, GY);
      // Kutup ışığı + parıltı: tahtaya tek seferde eklenen birleşik katman
      fxC = document.createElement('canvas');
      fxC.width = auroraC.width;
      fxC.height = auroraC.height;
      fxG = fxC.getContext('2d');
      aurora = [
        { tex: green, base: H * 0.42, amp: 46, k1: 0.011, k2: 0.027, w1: 0.35, w2: 0.52, ph: 0, a: 0.8, h: 330 },
        { tex: violet, base: H * 0.2, amp: 34, k1: 0.014, k2: 0.023, w1: -0.28, w2: 0.41, ph: 2, a: 0.55, h: 240 },
        { tex: green, base: H * 0.78, amp: 40, k1: 0.009, k2: 0.031, w1: 0.22, w2: -0.47, ph: 4, a: 0.45, h: 260 },
      ];
      for (let i = 0; i < 60; i++) {
        const big = Math.random() < 0.18;
        stars.push({
          x: rand(4, W - 4), y: rand(4, H - 4),
          s: big ? rand(1.8, 2.6) : rand(0.9, 1.6),
          big, ph: rand(0, TAU), sp: rand(1.2, 3.5),
          col: ['255,255,255', '200,225,255', '255,236,210', '210,200,255'][(Math.random() * 4) | 0],
        });
      }
    }

    function reset() {
      init();
      ux.fill(0); uy.fill(0); vx.fill(0); vy.fill(0);
      novas.length = 0;
    }

    // Kütle: dinlenme konumuna göre cisme doğru çekim (merkezde ve uzakta sıfır, s mesafesinde en güçlü)
    function well(x, y, s, A) {
      const R = s * 3.2;
      const i0 = Math.max(1, Math.floor((x - R) / GS)), i1 = Math.min(GX - 2, Math.ceil((x + R) / GS));
      const j0 = Math.max(1, Math.floor((y - R) / GS)), j1 = Math.min(GY - 2, Math.ceil((y + R) / GS));
      const k = K_REST * A, is2 = 1 / (s * s);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = x - i * GS, dy = y - j * GS, d2 = dx * dx + dy * dy;
          const f = k / (1 + d2 * is2);
          const n = j * GX + i;
          fx[n] += dx * f;
          fy[n] += dy * f;
        }
      }
    }

    // Darbe: çevredeki düğümlere dışa doğru hız (dalga halkası)
    function pulse(x, y, e, radius = 90) {
      init();
      const i0 = Math.max(1, Math.floor((x - radius) / GS)), i1 = Math.min(GX - 2, Math.ceil((x + radius) / GS));
      const j0 = Math.max(1, Math.floor((y - radius) / GS)), j1 = Math.min(GY - 2, Math.ceil((y + radius) / GS));
      const str = 420 * e;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = i * GS - x, dy = j * GS - y, d = Math.hypot(dx, dy);
          if (d >= radius || d < 0.01) continue;
          const t = 1 - d / radius, f = (str * t * t) / d;
          const n = j * GX + i;
          vx[n] += dx * f;
          vy[n] += dy * f;
        }
      }
    }

    function nova(x, y, e = 1) {
      pulse(x, y, 2.4 * e, 260);
      novas.push({ x, y, t: 0, dur: 1.5, e });
    }

    function step(dt) {
      for (let j = 1; j < GY - 1; j++) {
        for (let i = 1; i < GX - 1; i++) {
          const n = j * GX + i;
          const lx = ux[n - 1] + ux[n + 1] + ux[n - GX] + ux[n + GX] - 4 * ux[n];
          const ly = uy[n - 1] + uy[n + 1] + uy[n - GX] + uy[n + GX] - 4 * uy[n];
          vx[n] += (K_NB * lx - K_REST * ux[n] - DAMP * vx[n] + fx[n]) * dt;
          vy[n] += (K_NB * ly - K_REST * uy[n] - DAMP * vy[n] + fy[n]) * dt;
        }
      }
      for (let n = 0; n < GN; n++) {
        let x = ux[n] + vx[n] * dt, y = uy[n] + vy[n] * dt;
        const m = x * x + y * y;
        if (m > MAXU * MAXU) { const k = MAXU / Math.sqrt(m); x *= k; y *= k; }
        ux[n] = x;
        uy[n] = y;
      }
    }

    function update(dt) {
      if (!aurora) return;
      time += dt;
      fx.fill(0);
      fy.fill(0);
      for (const m of mallets) well(m.x, m.y, 44, 1.7);
      for (const w of Arena.wells) well(w.x, w.y, 64, 2.6); // çekim kuyuları ızgarayı derince büker
      let sp = 0;
      for (const p of pucks) {
        if (!p.active) continue;
        well(p.x, p.y, 30, 1.3);
        sp = Math.max(sp, Math.hypot(p.vx, p.vy));
      }
      const n = Math.min(4, Math.ceil(dt * 90));
      for (let i = 0; i < n; i++) step(dt / n);
      for (let i = novas.length - 1; i >= 0; i--) {
        novas[i].t += dt;
        if (novas[i].t >= novas[i].dur) novas.splice(i, 1);
      }
      // Diskin hızına göre yükselen "çekim uğultusu"
      const lv = game.state === 'play' ? Math.min(0.09, (sp / MAX_PUCK) * 0.1) : 0;
      if (Math.abs(lv - humLevel) > 0.004) {
        humLevel = lv;
        Sound.setScrape(lv);
      }
    }

    // Kutup ışığını düşük çözünürlüklü katmana piksel piksel (toplamalı) hesapla
    let auroraImg = null, auroraAcc = null;
    function renderAurora() {
      const cw = auroraC.width, ch = auroraC.height;
      if (!auroraImg) {
        auroraImg = auroraG.createImageData(cw, ch);
        auroraAcc = new Float32Array(cw * ch * 3);
      }
      const acc = auroraAcc;
      acc.fill(0);
      for (const r of aurora) {
        const { lut, ray } = r.tex;
        const breathe = 0.75 + 0.25 * Math.sin(time * 0.3 + r.ph);
        const hh = r.h / FXS;
        for (let cx = 0; cx < cw; cx++) {
          const xc = (cx + 0.5) * FXS;
          const y = r.base + r.amp * Math.sin(xc * r.k1 + time * r.w1 + r.ph) + r.amp * 0.45 * Math.sin(xc * r.k2 - time * r.w2);
          // Perde boyunca yavaşça gezinen parlaklık dalgaları
          const glow = 0.6 + 0.4 * Math.sin(xc * 0.017 - time * 0.7 + r.ph) * Math.sin(xc * 0.006 + time * 0.23);
          const edge = Math.min(1, xc / 90, (W - xc) / 90);
          const a = r.a * breathe * glow * edge;
          if (a <= 0.01) continue;
          const bot = y / FXS, top = bot - hh, rr = ray[cx];
          const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(ch - 1, Math.floor(bot));
          for (let cy = y0; cy <= y1; cy++) {
            const k = (cy - top) / hh;
            // Işık sütunları yukarı doğru belirginleşir; alt kenarda daha eşit
            const m = a * (rr + (1 - rr) * k * k * k * k * k * 0.6);
            const li = ((k * 255) | 0) * 3, o = (cy * cw + cx) * 3;
            acc[o] += lut[li] * m;
            acc[o + 1] += lut[li + 1] * m;
            acc[o + 2] += lut[li + 2] * m;
          }
        }
      }
      // Önçarpımlı toplamı ImageData'ya (önçarpımsız) çevir
      const d = auroraImg.data;
      for (let i = 0, j = 0; i < acc.length; i += 3, j += 4) {
        const R = acc[i], G = acc[i + 1], Bc = acc[i + 2];
        const A = Math.min(255, Math.max(R, G, Bc));
        if (A < 0.5) { d[j + 3] = 0; continue; }
        const k = 255 / A;
        d[j] = R * k; d[j + 1] = G * k; d[j + 2] = Bc * k; d[j + 3] = A;
      }
      auroraG.putImageData(auroraImg, 0, 0);
    }

    // Düğüm yer değiştirmesini çift doğrusal ara değerle örnekle (yıldızların merceklenmesi için)
    function sample(arr, x, y) {
      const gx = clamp(x / GS, 0, GX - 1.001), gy = clamp(y / GS, 0, GY - 1.001);
      const i = gx | 0, j = gy | 0, tx = gx - i, ty = gy - j, n = j * GX + i;
      const a = arr[n] + (arr[n + 1] - arr[n]) * tx;
      const b = arr[n + GX] + (arr[n + GX + 1] - arr[n + GX]) * tx;
      return a + (b - a) * ty;
    }

    function drawStars(c) {
      c.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const x = s.x + sample(ux, s.x, s.y) * 1.6, y = s.y + sample(uy, s.x, s.y) * 1.6;
        const tw = 0.55 + 0.45 * Math.sin(time * s.sp + s.ph);
        c.globalAlpha = tw * (s.big ? 0.95 : 0.7);
        c.fillStyle = `rgb(${s.col})`;
        c.fillRect(x - s.s / 2, y - s.s / 2, s.s, s.s);
        if (s.big) {
          c.globalAlpha = tw * 0.35;
          c.fillRect(x - s.s * 2.2, y - 0.4, s.s * 4.4, 0.8);
          c.fillRect(x - 0.4, y - s.s * 2.2, 0.8, s.s * 4.4);
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    // Ağ çizgilerini parlaklık düzeyine göre gruplayıp her düzey için tek bir yol oluştur
    function buildPaths() {
      for (let n = 0; n < GN; n++) {
        const e = Math.sqrt(ux[n] * ux[n] + uy[n] * uy[n]) / 12 + Math.sqrt(vx[n] * vx[n] + vy[n] * vy[n]) / 380;
        energy[n] = e;
        lvl[n] = e >= 1 ? 3 : (e * 3.99) | 0;
      }
      segN = 0;
      const seg = (L, x0, y0, x1, y1) => {
        const o = segN++ * 5;
        segs[o] = x0; segs[o + 1] = y0; segs[o + 2] = x1; segs[o + 3] = y1; segs[o + 4] = L;
      };
      for (let j = 0; j < GY; j++) {
        const major = j % 5 === 0 ? 1 : 0;
        for (let i = 0; i < GX - 1; i++) {
          const a = j * GX + i, b = a + 1;
          seg(Math.max(lvl[a], lvl[b]) + major, i * GS + ux[a], j * GS + uy[a], (i + 1) * GS + ux[b], j * GS + uy[b]);
        }
      }
      for (let i = 0; i < GX; i++) {
        const major = i % 5 === 2 ? 1 : 0;
        for (let j = 0; j < GY - 1; j++) {
          const a = j * GX + i, b = a + GX;
          seg(Math.max(lvl[a], lvl[b]) + major, i * GS + ux[a], j * GS + uy[a], i * GS + ux[b], (j + 1) * GS + uy[b]);
        }
      }
    }

    // Ağın parıltısı: enerjili düğümlerin çevresinde camgöbeğinden beyaza yumuşak hale
    function drawHaze(c) {
      const d = hazeImg.data;
      for (let n = 0; n < GN; n++) {
        const e = Math.min(1.4, energy[n]);
        const j = n * 4;
        d[j] = 60 + e * 70;
        d[j + 1] = 150 + e * 60;
        d[j + 2] = 255;
        d[j + 3] = e > 0.3 ? Math.min(160, (e - 0.3) * 95) : 0;
      }
      hazeG.putImageData(hazeImg, 0, 0);
      c.drawImage(hazeC, -GS / 2 / FXS, -GS / 2 / FXS, (GX * GS) / FXS, (GY * GS) / FXS);
    }

    function drawGrid(c) {
      // Parçaları düzeylerine göre tek yolda topla, her düzeyi tek seferde çiz
      c.lineCap = 'butt';
      for (let L = 0; L < LEVELS.length; L++) {
        let any = false;
        const p = new Path2D();
        for (let k = 0; k < segN; k++) {
          const o = k * 5;
          if (segs[o + 4] !== L) continue;
          p.moveTo(segs[o], segs[o + 1]);
          p.lineTo(segs[o + 2], segs[o + 3]);
          any = true;
        }
        if (!any) continue;
        c.strokeStyle = LEVELS[L][0];
        // Tüm çizgiler tam 1 cihaz pikseli: kalın çizgiye göre çok daha hızlı "saç teli" çizimi.
        // Parlak düzeyler bir piksel kaydırılıp ikinci kez çizilerek kalınlaşır.
        c.lineWidth = 1 / S;
        c.stroke(p);
        if (L >= 2) {
          c.translate(0.7 / S, 0.7 / S);
          c.stroke(p);
          if (L >= 4) {
            c.translate(-1.4 / S, 0);
            c.stroke(p);
            c.translate(0.7 / S, 0);
          }
          c.translate(-0.7 / S, -0.7 / S);
        }
      }
    }


    function drawNovas(c) {
      if (!novas.length) return;
      c.globalCompositeOperation = 'lighter';
      for (const v of novas) {
        const t = v.t / v.dur, e = 1 - Math.pow(1 - t, 3);
        // Parlak çekirdek
        const r = (26 + 190 * e) * v.e;
        const g = c.createRadialGradient(v.x, v.y, 0, v.x, v.y, r);
        const a = (1 - t) * (1 - t);
        g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        g.addColorStop(0.25, `rgba(170, 230, 255, ${a * 0.7})`);
        g.addColorStop(0.6, `rgba(170, 90, 255, ${a * 0.3})`);
        g.addColorStop(1, 'rgba(120, 60, 255, 0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(v.x, v.y, r, 0, TAU);
        c.fill();
        // Şok dalgası halkaları
        c.lineWidth = 3 + 9 * (1 - t);
        c.globalAlpha = (1 - t) * 0.8;
        c.strokeStyle = 'rgb(160, 225, 255)';
        c.beginPath();
        c.arc(v.x, v.y, (30 + 470 * e) * v.e, 0, TAU);
        c.stroke();
        c.globalAlpha = (1 - t) * 0.5;
        c.strokeStyle = 'rgb(220, 140, 255)';
        c.lineWidth = 2 + 4 * (1 - t);
        c.beginPath();
        c.arc(v.x, v.y, (18 + 300 * e) * v.e, 0, TAU);
        c.stroke();
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'source-over';
    }

    function drawOver(c) {
      if (!aurora) return;
      buildPaths();
      // Kutup ışığı yavaş değişir: 3 karede bir (hafif modda 6)
      if (frame++ % (quality.lite ? 6 : 3) === 0) renderAurora();
      fxG.clearRect(0, 0, fxC.width, fxC.height);
      fxG.drawImage(auroraC, 0, 0);
      fxG.globalCompositeOperation = 'lighter';
      drawHaze(fxG);
      fxG.globalCompositeOperation = 'source-over';
      c.globalCompositeOperation = 'lighter';
      c.drawImage(fxC, 0, 0, fxC.width * FXS, fxC.height * FXS);
      c.globalCompositeOperation = 'source-over';
      drawStars(c);
      drawGrid(c);
      drawNovas(c);
    }

    return { init, reset, update, drawOver, pulse, nova };
  })();

  // ---------------------------------------------------------------------------
  // Kristal Mağarası: zemin, karanlık bir mağarada renk bölgelerine ayrılmış fasetli kristallerden
  // oluşur. Vuruşlar genişleyen ışık dalgaları yayar; dalga cephesi ilerledikçe prizmadaki gibi
  // gökkuşağı bantlarına ayrışır (uzaklaştıkça bantlar açılır). Işığın geçtiği kristaller o rengi
  // alır ve bir süre parlamaya devam eder. Her kristal renginin pentatonik gamda bir notası vardır.
  // Parıltı, düşük çözünürlüklü bir katmanda piksel piksel (kristal kimliği × faset parlaklığı)
  // hesaplanır ve tahtaya tek seferde eklenir.
  // ---------------------------------------------------------------------------
  const Crystal = (() => {
    // Renk aileleri: ad, taban rengi, pentatonik nota (C majör pentatonik, yarım ton)
    const FAMILIES = [
      { name: 'ametist', rgb: [168, 92, 255], semi: 0 },
      { name: 'safir', rgb: [70, 120, 255], semi: 2 },
      { name: 'akuamarin', rgb: [60, 225, 235], semi: 4 },
      { name: 'zümrüt', rgb: [50, 235, 140], semi: 7 },
      { name: 'topaz', rgb: [255, 190, 70], semi: 9 },
      { name: 'yakut', rgb: [255, 70, 130], semi: 12 },
    ];
    const FXS = 2, CW = Math.ceil(W / FXS), CH = Math.ceil(H / FXS);
    const CELL = 40;
    let cells = null;          // { x, y, fam, poly: [[x,y]...], apex, facets: [brightness...], ph }
    let idMap = null, facetMap = null;
    let gr, gg, gb;            // hücre başına ışık birikimi (renk)
    let outR, outG, outB;
    let layer = null, lg = null, img = null;
    const waves = [];
    const RAINBOW = [];
    let time = 0, dripT = 3, humLevel = 0;
    // Mağara ışığı: sol üstten
    const LX = -0.45, LY = -0.55, LZ = 0.7;

    for (let i = 0; i < 32; i++) {
      // Önde kırmızı, arkada mor (kırılma ile ayrışma)
      const h = (i / 31) * 280;
      const f = (n) => { const k = (n + h / 30) % 12; return Math.max(0, Math.min(1, Math.min(k - 3, 9 - k))) ; };
      RAINBOW.push([f(0), f(8), f(4)]);
    }

    function clip(poly, nx, ny, c) {
      // nx*x + ny*y <= c tarafını tut
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      return out;
    }

    function init() {
      if (cells) return;
      let seed = 1234;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // Renk bölgeleri: iri Voronoi tohumları
      const zones = [];
      for (let i = 0; i < 11; i++) zones.push([rnd() * W, rnd() * H, i % FAMILIES.length]);
      const nx = Math.ceil(W / CELL), ny = Math.ceil(H / CELL);
      const grid = [];
      cells = [];
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = (i + 0.15 + rnd() * 0.7) * (W / nx), y = (j + 0.15 + rnd() * 0.7) * (H / ny);
          let best = 0, bd = 1e18;
          for (const z of zones) {
            const d = (z[0] - x) ** 2 + ((z[1] - y) * 0.8) ** 2;
            if (d < bd) { bd = d; best = z[2]; }
          }
          grid.push(cells.length);
          cells.push({ x, y, fam: best, gi: i, gj: j, ph: rnd() * TAU });
        }
      }
      // Hücre çokgenleri: kutudan başlayıp komşu açıortaylarıyla kırp
      for (const c of cells) {
        let poly = [[0, 0], [W, 0], [W, H], [0, H]];
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const i = c.gi + di, j = c.gj + dj;
            if ((!di && !dj) || i < 0 || j < 0 || i >= nx || j >= ny) continue;
            const o = cells[grid[j * nx + i]];
            const vx = o.x - c.x, vy = o.y - c.y;
            poly = clip(poly, vx, vy, (o.x * o.x + o.y * o.y - c.x * c.x - c.y * c.y) / 2);
          }
        }
        c.poly = poly;
        // Tepe noktası: merkezden biraz kayık; yüzey üçgenleri eğimli prizma yüzleri gibi
        c.apex = [c.x + (rnd() - 0.5) * 12, c.y + (rnd() - 0.5) * 12];
        const h = 14 + rnd() * 14;
        c.facets = poly.map((a, k) => {
          const b = poly[(k + 1) % poly.length];
          const ax = a[0] - c.apex[0], ay = a[1] - c.apex[1], bx = b[0] - c.apex[0], by = b[1] - c.apex[1];
          // Normal = (a - tepe) × (b - tepe), tepe h kadar yüksekte
          let nx3 = ay * -h - -h * by, ny3 = -h * bx - ax * -h, nz3 = ax * by - ay * bx;
          if (nz3 < 0) { nx3 = -nx3; ny3 = -ny3; nz3 = -nz3; }
          const l = Math.hypot(nx3, ny3, nz3) || 1;
          const dl = (nx3 * LX + ny3 * LY + nz3 * LZ) / l;
          return clamp(0.35 + dl * 0.75, 0.25, 1.15);
        });
        c.angles = poly.map((a) => Math.atan2(a[1] - c.apex[1], a[0] - c.apex[0]));
      }
      // Düşük çözünürlüklü kimlik ve faset haritaları
      const N = cells.length;
      gr = new Float32Array(N); gg = new Float32Array(N); gb = new Float32Array(N);
      outR = new Float32Array(N); outG = new Float32Array(N); outB = new Float32Array(N);
      idMap = new Uint16Array(CW * CH);
      facetMap = new Float32Array(CW * CH);
      for (let py = 0; py < CH; py++) {
        for (let px = 0; px < CW; px++) {
          const x = (px + 0.5) * FXS, y = (py + 0.5) * FXS;
          const gi = Math.min(nx - 1, Math.floor(x / (W / nx))), gj = Math.min(ny - 1, Math.floor(y / (H / ny)));
          let best = 0, bd = 1e18;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const i = gi + di, j = gj + dj;
              if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
              const k = grid[j * nx + i], c = cells[k];
              const d = (c.x - x) ** 2 + (c.y - y) ** 2;
              if (d < bd) { bd = d; best = k; }
            }
          }
          const c = cells[best];
          const a = Math.atan2(y - c.apex[1], x - c.apex[0]);
          // Pikselin düştüğü üçgen yüz: açısı iki köşe açısı arasında olan
          let f = c.facets[0];
          for (let k = 0; k < c.angles.length; k++) {
            const a0 = c.angles[k], a1 = c.angles[(k + 1) % c.angles.length];
            let span = a1 - a0; if (span < 0) span += TAU;
            let rel = a - a0; if (rel < 0) rel += TAU;
            if (rel <= span) { f = c.facets[k]; break; }
          }
          idMap[py * CW + px] = best;
          facetMap[py * CW + px] = f;
        }
      }
      // Kristal kenarları daha parlak (ışık kenarlarda toplanır)
      for (let py = 1; py < CH - 1; py++) {
        for (let px = 1; px < CW - 1; px++) {
          const p = py * CW + px, id = idMap[p];
          if (idMap[p + 1] !== id || idMap[p + CW] !== id || idMap[p - 1] !== id || idMap[p - CW] !== id) facetMap[p] *= 0.55;
        }
      }
      layer = document.createElement('canvas');
      layer.width = CW;
      layer.height = CH;
      lg = layer.getContext('2d');
      img = lg.createImageData(CW, CH);
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    }

    function reset() {
      init();
      gr.fill(0); gg.fill(0); gb.fill(0);
      waves.length = 0;
    }

    function cellAt(x, y) {
      init();
      const px = clamp((x / FXS) | 0, 0, CW - 1), py = clamp((y / FXS) | 0, 0, CH - 1);
      return cells[idMap[py * CW + px]];
    }

    // Vuruş noktasındaki kristalin notası (Hz). oct: oktav kaydırma
    function noteAt(x, y, oct = 0) {
      const f = FAMILIES[cellAt(x, y).fam];
      return 523.25 * Math.pow(2, f.semi / 12 + oct);
    }

    function famRgb(x, y) {
      return FAMILIES[cellAt(x, y).fam].rgb.join(',');
    }

    // Işık dalgası: s gücü; cephe prizmadaki gibi gökkuşağına ayrışır
    function wave(x, y, s) {
      init();
      if (waves.length > 10) waves.shift();
      waves.push({ x, y, s: clamp(s, 0.1, 2.5), r: 0, max: 150 + s * 240, ph: Math.random() });
      // Çıkış noktasındaki kristal hemen parlar
      const c = cellAt(x, y), i = cells.indexOf(c), rgb = FAMILIES[c.fam].rgb;
      gr[i] += (rgb[0] / 255) * s; gg[i] += (rgb[1] / 255) * s; gb[i] += (rgb[2] / 255) * s;
    }

    function light(x, y, rgb, amt, R) {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i], dx = c.x - x, dy = c.y - y;
        if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const k = amt * (1 - d2 / (R * R));
        gr[i] += rgb[0] * k; gg[i] += rgb[1] * k; gb[i] += rgb[2] * k;
      }
    }

    function update(dt) {
      if (!cells) return;
      time += dt;
      const N = cells.length;
      // Işığın geçtiği kristaller yavaşça söner
      const dec = Math.exp(-dt / 1.2);
      for (let i = 0; i < N; i++) { gr[i] *= dec; gg[i] *= dec; gb[i] *= dec; }
      // Dalga cepheleri
      const SPEED = 430;
      for (let w = waves.length - 1; w >= 0; w--) {
        const wv = waves[w];
        const r0 = wv.r;
        wv.r += SPEED * dt;
        if (r0 > wv.max) { waves.splice(w, 1); continue; }
        // Cephenin bu karede geçtiği kristaller, uzaklığa göre gökkuşağının bir rengini alır:
        // halka halka renk bantları, uzaklaştıkça açılır (prizmada ayrışma gibi)
        for (let i = 0; i < N; i++) {
          const c = cells[i];
          const dx = c.x - wv.x, dy = c.y - wv.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < r0 || d >= wv.r || d > wv.max) continue;
          const fade = 1 - d / wv.max;
          const hue = (Math.sqrt(d) * 0.085 + wv.ph) % 1;
          const rb = RAINBOW[(hue * 31) | 0];
          const amt = wv.s * fade * Math.sqrt(fade) * 0.95;
          gr[i] += rb[0] * amt; gg[i] += rb[1] * amt; gb[i] += rb[2] * amt;
        }
      }
      // Raketler ve diskler altlarındaki kristalleri hafifçe aydınlatır
      for (const m of mallets) light(m.x, m.y, m.i ? [1, 0.4, 0.7] : [0.3, 0.8, 1], dt * 0.45, 60);
      let sp = 0;
      for (const p of pucks) {
        if (!p.active) continue;
        light(p.x, p.y, [0.85, 0.9, 1], dt * 0.6, 44);
        sp = Math.max(sp, Math.hypot(p.vx, p.vy));
      }
      // Hücre renkleri: gelen ışık + kristalin kendi rengi + hafif nefes alan iç ışık
      for (let i = 0; i < N; i++) {
        const c = cells[i], base = FAMILIES[c.fam].rgb;
        let r = gr[i], g = gg[i], b = gb[i];
        const lum = Math.min(1.6, (r + g + b) / 3);
        const amb = 0.035 + 0.03 * Math.sin(time * 0.8 + c.ph);
        const tint = lum * 0.25 + amb;
        outR[i] = Math.min(1.4, r * 0.85 + (base[0] / 255) * tint);
        outG[i] = Math.min(1.4, g * 0.85 + (base[1] / 255) * tint);
        outB[i] = Math.min(1.4, b * 0.85 + (base[2] / 255) * tint);
        if (r > 1.8) gr[i] = 1.8;
        if (g > 1.8) gg[i] = 1.8;
        if (b > 1.8) gb[i] = 1.8;
      }
      // Diskin kristaller üzerindeki cam hışırtısı
      const lv = game.state === 'play' ? Math.min(0.05, (sp / MAX_PUCK) * 0.06) : 0;
      if (Math.abs(lv - humLevel) > 0.003) {
        humLevel = lv;
        Sound.setScrape(lv);
      }
      // Mağarada ara sıra damlayan su
      dripT -= dt;
      if (dripT <= 0) {
        dripT = rand(2.5, 7);
        if (game.state !== 'demo') Sound.drip(rand(0, W));
      }
    }

    function drawOver(c) {
      if (!cells) return;
      const d = img.data;
      for (let p = 0, j = 0; p < idMap.length; p++, j += 4) {
        const id = idMap[p], f = facetMap[p] * 175;
        d[j] = outR[id] * f;
        d[j + 1] = outG[id] * f;
        d[j + 2] = outB[id] * f;
      }
      lg.putImageData(img, 0, 0);
      c.globalCompositeOperation = 'lighter';
      c.drawImage(layer, 0, 0, CW * FXS, CH * FXS);
      if (!waves.length) {
        c.globalCompositeOperation = 'source-over';
        return;
      }
      // Dalga cepheleri: kırmızıdan mora ayrışan ince yaylar (saha içinde)
      c.save();
      c.beginPath();
      c.rect(0, 0, W, H);
      c.clip();
      c.lineWidth = 1 / S;
      for (const wv of waves) {
        const band = 14 + wv.r * 0.16, fade = 1 - wv.r / wv.max;
        for (let k = 0; k < 4; k++) {
          const rb = RAINBOW[Math.round((k / 3) * 31)];
          const r = wv.r - (k / 3) * band;
          if (r <= 1) continue;
          c.globalAlpha = Math.min(1, fade * wv.s * 0.55);
          c.strokeStyle = `rgb(${(rb[0] * 255) | 0},${(rb[1] * 255) | 0},${(rb[2] * 255) | 0})`;
          c.beginPath();
          c.arc(wv.x, wv.y, r, 0, TAU);
          c.stroke();
        }
      }
      c.restore();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    return {
      init, reset, update, drawOver, wave, noteAt, famRgb,
      get cells() { init(); return cells; },
      FAMILIES,
    };
  })();

  // ---------------------------------------------------------------------------
  // Bataklık Stadyumu: çamur yüzeyi su motoruyla (çamur ayarlarıyla) simüle edilir. Bu modül
  // üstteki 2B ayrıntıları yönetir: yüzen yosun kümeleri ve yapraklar (yüzey eğimiyle sürüklenir,
  // raket ve disk onları iter) ve zeminden yükselip patlayan kabarcıklar.
  // ---------------------------------------------------------------------------
  const Swamp = (() => {
    const floaters = [];
    const bubbles = [];
    let sprites = null, bubbleSprite = null;
    let bubbleT = 1, critterT = 2, time = 0;

    function makeSprites() {
      const mk = (w, h, draw) => {
        const c = document.createElement('canvas');
        c.width = w * 2;
        c.height = h * 2;
        const g = c.getContext('2d');
        g.scale(2, 2);
        g.translate(w / 2, h / 2);
        draw(g);
        return c;
      };
      let seed = 77;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const leaf = (fill, vein) => mk(40, 24, (g) => {
        g.fillStyle = 'rgba(0, 0, 0, 0.35)';
        g.beginPath();
        g.ellipse(1.5, 2, 16, 8, 0, 0, TAU);
        g.fill();
        g.fillStyle = fill;
        g.beginPath();
        g.moveTo(-17, 0);
        g.quadraticCurveTo(-4, -11, 16, 0);
        g.quadraticCurveTo(-4, 11, -17, 0);
        g.fill();
        g.strokeStyle = vein;
        g.lineWidth = 0.9;
        g.beginPath();
        g.moveTo(-17, 0); g.lineTo(16, 0);
        for (let k = -2; k <= 2; k++) {
          g.moveTo(k * 5, 0); g.lineTo(k * 5 + 4, -5 + Math.abs(k));
          g.moveTo(k * 5, 0); g.lineTo(k * 5 + 4, 5 - Math.abs(k));
        }
        g.stroke();
        g.fillStyle = 'rgba(255, 255, 255, 0.18)';
        g.beginPath();
        g.ellipse(-3, -3, 7, 2, -0.15, 0, TAU);
        g.fill();
      });
      const moss = () => mk(44, 44, (g) => {
        for (let i = 0; i < 70; i++) {
          const a = rnd() * TAU, d = Math.pow(rnd(), 0.7) * 17, r = 1.3 + rnd() * 2.2;
          const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8;
          g.fillStyle = 'rgba(0, 0, 0, 0.3)';
          g.beginPath(); g.arc(x + 0.8, y + 1, r, 0, TAU); g.fill();
          const l = 28 + rnd() * 22;
          g.fillStyle = `hsl(${78 + rnd() * 28}, ${45 + rnd() * 20}%, ${l}%)`;
          g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255, 255, 220, 0.25)';
          g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); g.fill();
        }
      });
      const lily = () => mk(40, 40, (g) => {
        g.fillStyle = 'rgba(0, 0, 0, 0.35)';
        g.beginPath(); g.arc(1.5, 2, 15, 0.35, TAU - 0.05); g.lineTo(1.5, 2); g.fill();
        const gr = g.createRadialGradient(-4, -4, 2, 0, 0, 15);
        gr.addColorStop(0, '#6f9a3c');
        gr.addColorStop(1, '#3f6421');
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, 15, 0.3, TAU - 0.1); g.lineTo(0, 0); g.fill();
        g.strokeStyle = 'rgba(30, 50, 15, 0.6)';
        g.lineWidth = 0.8;
        g.beginPath();
        for (let k = 0; k < 7; k++) { const a = 0.6 + k * 0.8; g.moveTo(0, 0); g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); }
        g.stroke();
      });
      sprites = {
        leaves: [leaf('#8a5a26', 'rgba(60, 35, 12, 0.7)'), leaf('#b88a2e', 'rgba(90, 60, 18, 0.7)'), leaf('#5e7a2a', 'rgba(35, 50, 15, 0.7)')],
        moss: [moss(), moss(), moss()],
        lily: [lily()],
      };
      bubbleSprite = document.createElement('canvas');
      bubbleSprite.width = bubbleSprite.height = 64;
      const b = bubbleSprite.getContext('2d');
      const gr = b.createRadialGradient(24, 22, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255, 245, 225, 0.9)');
      gr.addColorStop(0.18, 'rgba(160, 120, 80, 0.55)');
      gr.addColorStop(0.7, 'rgba(70, 48, 28, 0.55)');
      gr.addColorStop(0.95, 'rgba(40, 26, 14, 0.7)');
      gr.addColorStop(1, 'rgba(40, 26, 14, 0)');
      b.fillStyle = gr;
      b.beginPath(); b.arc(32, 32, 30, 0, TAU); b.fill();
    }

    function init() {
      if (sprites) return;
      makeSprites();
    }

    function reset() {
      init();
      floaters.length = 0;
      bubbles.length = 0;
      const add = (kind, n, size) => {
        for (let i = 0; i < n; i++) {
          const list = sprites[kind];
          floaters.push({
            kind, img: list[i % list.length], x: rand(30, W - 30), y: rand(40, H - 40), vx: 0, vy: 0,
            a: rand(0, TAU), va: 0, r: size * rand(0.8, 1.2),
          });
        }
      };
      add('moss', 7, 20);
      add('leaves', 9, 14);
      add('lily', 4, 15);
    }

    function update(dt) {
      if (!sprites) return;
      time += dt;
      const bodies = [];
      for (const m of mallets) bodies.push([m.x, m.y, MALLET_R, m.vx, m.vy]);
      for (const p of pucks) if (p.active) bodies.push([p.x, p.y, PUCK_R, p.vx, p.vy]);
      const drag = Math.exp(-2.2 * dt);
      for (const f of floaters) {
        // Yüzey eğimi yönünde aşağı kayar (dalga geçince sallanır), çamur yapışkan: sürtünme yüksek
        const [sx, sy] = Water.slope(f.x, f.y);
        f.vx = (f.vx - sx * 2600 * dt) * drag;
        f.vy = (f.vy - sy * 2600 * dt) * drag;
        for (const [bx, by, br, bvx, bvy] of bodies) {
          const dx = f.x - bx, dy = f.y - by, d = Math.hypot(dx, dy), min = br + f.r * 0.7;
          if (d < min && d > 0.01) {
            const nx = dx / d, ny = dy / d;
            f.x = bx + nx * min;
            f.y = by + ny * min;
            const push = Math.max(0, bvx * nx + bvy * ny);
            f.vx += nx * (push * 0.55 + 30);
            f.vy += ny * (push * 0.55 + 30);
            f.va += (bvx * ny - bvy * nx) * 0.004;
          }
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.a += f.va * dt;
        f.va *= Math.exp(-1.5 * dt);
        const pad = f.r * 0.8;
        if (f.x < pad) { f.x = pad; f.vx = Math.abs(f.vx) * 0.3; }
        if (f.x > W - pad) { f.x = W - pad; f.vx = -Math.abs(f.vx) * 0.3; }
        if (f.y < pad) { f.y = pad; f.vy = Math.abs(f.vy) * 0.3; }
        if (f.y > H - pad) { f.y = H - pad; f.vy = -Math.abs(f.vy) * 0.3; }
      }
      // Kabarcıklar: zeminden yükselir, kabarır ve "blop" diye patlar
      bubbleT -= dt;
      if (bubbleT <= 0 && bubbles.length < 5) {
        bubbleT = rand(0.5, 1.8) * (quality.lite ? 1.6 : 1);
        const x = rand(30, W - 30), y = rand(30, H - 30);
        if (!bodies.some(([bx, by, br]) => Math.hypot(x - bx, y - by) < br + 30)) {
          bubbles.push({ x, y, r: rand(4, 10), t: 0, dur: rand(0.5, 1.3) });
        }
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.t += dt;
        Water.bubble(b.x, b.y, b.r * 1.3, 0.9 * dt / b.dur);
        if (b.t >= b.dur) {
          Water.pop(b.x, b.y, b.r);
          spawn(b.x, b.y, '70,48,28', 3 + Math.round(b.r * 0.4), 60 + b.r * 9, 0.4, 1.6, { keep: true });
          Sound.blop(b.r, b.x);
          bubbles.splice(i, 1);
        }
      }
      // Arkada kurbağalar ve cırcır böcekleri
      critterT -= dt;
      if (critterT <= 0) {
        critterT = rand(0.8, 2.6);
        if (Math.random() < 0.55) Sound.cricket(rand(0, W));
        else Sound.frog(rand(0, W));
      }
    }

    function drawOver(c) {
      if (!sprites) return;
      for (const b of bubbles) {
        const k = b.t / b.dur;
        const r = b.r * (0.4 + 0.75 * Math.sqrt(k));
        c.globalAlpha = 0.5 + 0.5 * k;
        c.drawImage(bubbleSprite, b.x - r, b.y - r, r * 2, r * 2);
      }
      c.globalAlpha = 1;
      const m = c.getTransform();
      for (const f of floaters) {
        const img = f.img, w = img.width / 2, h = img.height / 2;
        const cs = Math.cos(f.a), sn = Math.sin(f.a), k = f.r / (w * 0.42);
        c.setTransform(
          (m.a * cs + m.c * sn) * k, (m.b * cs + m.d * sn) * k,
          (-m.a * sn + m.c * cs) * k, (-m.b * sn + m.d * cs) * k,
          m.a * f.x + m.c * f.y + m.e, m.b * f.x + m.d * f.y + m.f);
        c.drawImage(img, -w / 2, -h / 2, w, h);
      }
      c.setTransform(m);
    }

    return { init, reset, update, drawOver };
  })();

  // ---------------------------------------------------------------------------
  // Oyun durumu
  // ---------------------------------------------------------------------------
  const game = {
    state: 'demo',          // demo | countdown | play | goal | paused | over
    resumeState: 'play',
    score: [0, 0],
    pulse: [0, 0],
    timer: 0,
    count: 0,
    time: 0,
    clock: MATCH_TIME,      // kalan süre (sn); yalnızca oyun akarken azalır
    frenzy: false,          // ikinci top oyunda mı
    shake: 0,
    flash: 0,
    flashRgb: '255,255,255',
    banner: null,
  };

  function makePuck() {
    return {
      x: W / 2, y: H / 2, vx: 0, vy: 0,
      active: false,        // fizikte yer alıyor mu
      visible: true,        // çiziliyor mu (pasifken yanıp söner)
      blink: 0,             // > 0: yanıp sönerek oyuna girmeyi bekliyor
      respawn: 0,           // > 0: gol sonrası gizli bekleme
      respawnSide: -1,
      launch: null,         // oyuna girerken verilecek hız
      trail: [],
      stuck: 0,
    };
  }

  const pucks = [makePuck()];

  // Kaleler: 0 = alt (Mavi'nin kalesi, y = H), 1 = üst (Pembe'nin kalesi, y = 0).
  // grow / shrink: etkinin kalan süresi; w: ekranda ve fizikte kullanılan (yumuşakça değişen) genişlik.
  const goals = [{ w: GOAL_W, grow: 0, shrink: 0 }, { w: GOAL_W, grow: 0, shrink: 0 }];

  function goalTarget(g) {
    return GOAL_W + (g.grow > 0 ? SKILLS.grow.delta : 0) + (g.shrink > 0 ? SKILLS.shrink.delta : 0);
  }

  function makeMallet(i) {
    return {
      i, bottom: i === 0,
      x: W / 2, y: homeY(i), vx: 0, vy: 0,
      tx: W / 2, ty: homeY(i),
      ai: true, level: AI_LEVELS.medium,
      aiTx: W / 2, aiTy: homeY(i), avx: 0, avy: 0,
      aiTimer: 0, aiMode: '', aimX: W / 2, charge: false, tap: false, digSide: 1, clearUntil: 0,
      glow: 0, hitCool: 0,
    };
  }

  function homeY(i) {
    return i === 0 ? H - 110 : 110;
  }

  const mallets = [makeMallet(0), makeMallet(1)];

  function clampPos(m, x, y) {
    x = clamp(x, MALLET_R, W - MALLET_R);
    y = m.bottom ? clamp(y, H / 2 + CENTER_GAP, H - MALLET_R) : clamp(y, MALLET_R, H / 2 - CENTER_GAP);
    return Arena.pushOut(x, y, MALLET_R);
  }

  function resetMallet(m) {
    m.x = m.tx = m.aiTx = W / 2;
    m.y = m.ty = m.aiTy = homeY(m.i);
    m.vx = m.vy = m.avx = m.avy = 0;
    m.aiMode = '';
    m.charge = false;
    m.clearUntil = 0;
    m.tap = false;
  }

  function placePuck(p, side) {
    // side: 0 = alt yarı, 1 = üst yarı, -1 = orta
    p.x = W / 2;
    p.y = side === 0 ? H * 0.7 : side === 1 ? H * 0.3 : H / 2;
    // Aynı noktada başka bir pak varsa yana kaydır
    for (const o of pucks) {
      if (o !== p && o.visible && Math.hypot(o.x - p.x, o.y - p.y) < PUCK_R * 2 + 16) {
        p.x += o.x < W / 2 ? 90 : -90;
      }
    }
    p.vx = p.vy = 0;
    p.trail.length = 0;
    p.stuck = 0;
    p.blink = 0;
    p.respawn = 0;
    p.launch = null;
  }

  // ---------------------------------------------------------------------------
  // Efektler
  // ---------------------------------------------------------------------------
  const particles = [];
  const ripples = [];

  function spawn(x, y, rgb, count, speed, life, size, opts = {}) {
    if (quality.lite) count = Math.ceil(count * 0.5);
    const max = quality.lite ? 180 : 360;
    if (isWater() && !opts.keep) rgb = '215,240,255'; // suda kıvılcım yerine su damlası
    else if (isIce() && !opts.keep) rgb = '232,248,255'; // buzda kıvılcım yerine buz kristali
    else if (isLava() && !opts.keep) rgb = '255,150,50'; // lavda kor parçaları
    else if (isSand() && !opts.keep) rgb = '225,195,145'; // kumda savrulan kum
    else if (isCrystal() && !opts.keep) rgb = '225,235,255'; // kristal kıymıkları
    else if (isMud() && !opts.keep) rgb = '84,58,32'; // çamur damlaları
    const col = `rgb(${rgb})`;
    for (let i = 0; i < count; i++) {
      if (particles.length >= max) break;
      const a = opts.dir !== undefined ? opts.dir + rand(-opts.spread, opts.spread) : rand(0, TAU);
      const sp = speed * rand(0.25, 1);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1), max: life,
        size: size * rand(0.5, 1),
        col, spark: !!opts.spark, g: opts.gravity || 0,
      });
    }
  }

  function ripple(x, y, rgb, r0, r1, dur, w) {
    ripples.push({ x, y, col: `rgb(${rgb})`, r0, r1, dur, w, t: 0 });
  }

  function banner(text, rgb, dur, size) {
    game.banner = { text, rgb, dur, size, t: 0 };
  }

  function updateEffects(dt) {
    const k = Math.exp(-2.6 * dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Sırayı korumaya gerek yok: sondakiyle yer değiştirip çıkar (splice'tan çok daha ucuz)
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t >= ripples[i].dur) ripples.splice(i, 1);
    }
    if (game.banner) {
      game.banner.t += dt;
      if (game.banner.t >= game.banner.dur) game.banner = null;
    }
    game.shake *= Math.exp(-9 * dt);
    game.flash *= Math.exp(-4 * dt);
    for (let i = 0; i < 2; i++) {
      game.pulse[i] = Math.max(0, game.pulse[i] - dt * 0.9);
      mallets[i].glow = Math.max(0, mallets[i].glow - dt * 3.5);
      mallets[i].hitCool -= dt;
    }

    // İz
    for (const p of pucks) {
      if (p.active) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > 36) p.trail.splice(0, 2);
        // Desenli pak görünümleri hızla ve yatay hareketin yönüne göre döner
        p.spin = ((p.spin || 0) + (p.vx * 0.6 + Math.abs(p.vy) * 0.25 * Math.sign(p.vx || 1)) * dt / PUCK_R) % TAU;
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 1300 && !quality.lite && Math.random() < 0.7) {
          spawn(p.x, p.y, sp > 1800 ? '255,140,70' : puckRgb(), 1, 120, 0.35, 2.6);
        }
      } else if (p.trail.length) {
        p.trail.splice(0, 2);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fizik
  // ---------------------------------------------------------------------------
  function collideMallet(p, m) {
    const dx = p.x - m.x, dy = p.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= MIN_D * MIN_D) return 0;
    let d = Math.sqrt(d2), nx, ny;
    if (d < 1e-6) { nx = 0; ny = m.bottom ? -1 : 1; d = 0; } else { nx = dx / d; ny = dy / d; }
    p.x = m.x + nx * MIN_D;
    p.y = m.y + ny * MIN_D;
    const vn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
    if (vn < 0) {
      p.vx -= (1 + MALLET_E) * vn * nx;
      p.vy -= (1 + MALLET_E) * vn * ny;
      m.hx = m.x + nx * MALLET_R;
      m.hy = m.y + ny * MALLET_R;
      return -vn;
    }
    return 0;
  }

  function collideWalls(p) {
    const WALL_E = phys().wallE; // stadyuma göre (buz sert sektirir, kum ve çamur emer)
    let imp = 0;
    if (p.x < PUCK_R) {
      p.x = PUCK_R;
      if (p.vx < 0) { imp = -p.vx; p.vx = -p.vx * WALL_E; }
    } else if (p.x > W - PUCK_R) {
      p.x = W - PUCK_R;
      if (p.vx > 0) { imp = p.vx; p.vx = -p.vx * WALL_E; }
    }
    const tHalf = goals[1].w / 2, bHalf = goals[0].w / 2;
    if (p.y < PUCK_R && Math.abs(p.x - W / 2) >= tHalf) {
      p.y = PUCK_R;
      if (p.vy < 0) { imp = Math.max(imp, -p.vy); p.vy = -p.vy * WALL_E; }
    } else if (p.y > H - PUCK_R && Math.abs(p.x - W / 2) >= bHalf) {
      p.y = H - PUCK_R;
      if (p.vy > 0) { imp = Math.max(imp, p.vy); p.vy = -p.vy * WALL_E; }
    }
    imp = Math.max(imp,
      collidePost(p, W / 2 - tHalf, 0), collidePost(p, W / 2 + tHalf, 0),
      collidePost(p, W / 2 - bHalf, H), collidePost(p, W / 2 + bHalf, H));
    return imp;
  }

  // Kale direği: nokta çarpışması
  function collidePost(p, qx, qy) {
    const WALL_E = phys().wallE;
    const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
    if (d2 >= PUCK_R * PUCK_R || d2 < 1e-6) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    p.x = qx + nx * PUCK_R;
    p.y = qy + ny * PUCK_R;
    const vn = p.vx * nx + p.vy * ny;
    if (vn >= 0) return 0;
    p.vx -= (1 + WALL_E) * vn * nx;
    p.vy -= (1 + WALL_E) * vn * ny;
    return -vn;
  }

  // İki pak arasında eşit kütleli esnek çarpışma.
  function collidePucks(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, md = PUCK_R * 2;
    if (d2 >= md * md || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (md - d) / 2;
    a.x -= nx * ov;
    a.y -= ny * ov;
    b.x += nx * ov;
    b.y += ny * ov;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const j = (-(1 + PUCK_E) * vn) / 2;
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
      return -vn;
    }
    return 0;
  }

  // Pak duvara sıkıştıysa raketi geri it (içinden geçmesin).
  function resolvePin(p, m) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
    if (d < MIN_D - 0.5 && d > 1e-6) {
      const push = MIN_D - d;
      m.x -= (dx / d) * push;
      m.y -= (dy / d) * push;
    }
  }

  // `remaining`: bu karede bundan sonra kalan fizik adımı sayısı (insan raketi hedefe eşit adımlarla gider).
  const phys = () => PHYS[settings.theme] || PHYS.neon;

  // ---------------------------------------------------------------------------
  // Stadyum mekanikleri: lavda patlayan bacalar, uzayda çekim kuyuları, kristalde sütunlar.
  // Her iki oyuncuyu eşit etkiler; tanıtım maçında da görünür.
  // ---------------------------------------------------------------------------
  const Arena = (() => {
    const wells = [];   // { x, y, bx, ph } — yavaşça yatay gezinir
    const vents = [];   // { x, y, t, warn, blown }
    const pillars = []; // { x, y, r }
    let ventT = 3, time = 0;
    const WELL_K = 5.2e6, WELL_R = 230, VENT_R = 78, VENT_WARN = 1.1, VENT_LIFE = 1.7, PILLAR_R = 22;

    function reset() {
      wells.length = 0;
      vents.length = 0;
      pillars.length = 0;
      ventT = 3;
      const P = phys();
      if (P.wells) wells.push({ bx: W / 2, y: H * 0.3, ph: 0, x: W / 2 }, { bx: W / 2, y: H * 0.7, ph: Math.PI, x: W / 2 });
      if (P.pillars) pillars.push({ x: W * 0.22, y: H / 2, r: PILLAR_R }, { x: W * 0.78, y: H / 2, r: PILLAR_R });
    }

    function update(dt) {
      time += dt;
      for (const w of wells) w.x = w.bx + Math.sin(time * 0.35 + w.ph) * 140;
      if (!phys().vents) return;
      // Lav bacaları: önce kızaran halka (uyarı), sonra patlama
      if (game.state === 'play') {
        ventT -= dt;
        if (ventT <= 0) {
          ventT = rand(3.2, 5.5);
          let x, y, tries = 0;
          do {
            x = rand(80, W - 80);
            y = rand(170, H - 170);
          } while (++tries < 8 && Math.abs(y - H / 2) < 50);
          vents.push({ x, y, t: 0, blown: false });
        }
      }
      for (let i = vents.length - 1; i >= 0; i--) {
        const v = vents[i];
        v.t += dt;
        if (!v.blown && v.t >= VENT_WARN) {
          v.blown = true;
          for (const p of pucks) {
            if (!p.active) continue;
            const dx = p.x - v.x, dy = p.y - v.y, d = Math.hypot(dx, dy);
            if (d < VENT_R) {
              const k = 1500 * (1 - d / VENT_R) + 500, a = d > 1 ? Math.atan2(dy, dx) : rand(0, TAU);
              p.vx += Math.cos(a) * k;
              p.vy += Math.sin(a) * k;
            }
          }
          if (isLava()) {
            Lava.breakCrust(v.x, v.y, 0.75);
            Lava.pool(v.x, v.y, 46, 1);
          }
          spawn(v.x, v.y, '255,140,40', 26, 600, 0.8, 3.2, { spark: true });
          ripple(v.x, v.y, '255,120,30', 14, VENT_R + 30, 0.5, 5);
          Sound.eruption(0.7, v.x);
          game.shake = Math.max(game.shake, 5);
        }
        if (v.t >= VENT_LIFE) vents.splice(i, 1);
      }
    }

    // Çekim kuyularının paka etkisi (fizik alt adımında)
    function forces(p, h) {
      for (const w of wells) {
        const dx = w.x - p.x, dy = w.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 > WELL_R * WELL_R) continue;
        const d = Math.sqrt(d2) || 1;
        const fall = 1 - d / WELL_R; // kenarda yumuşakça sıfıra iner
        const a = Math.min(2000, WELL_K / (d2 + 2500)) * fall;
        p.vx += (dx / d) * a * h;
        p.vy += (dy / d) * a * h;
      }
    }

    // Pakın kristal sütunlardan sekmesi; çarpma şiddetini döndürür
    function collide(p) {
      let imp = 0;
      const e = phys().wallE;
      for (const c of pillars) {
        const dx = p.x - c.x, dy = p.y - c.y, md = c.r + PUCK_R, d2 = dx * dx + dy * dy;
        if (d2 >= md * md || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        p.x = c.x + nx * md;
        p.y = c.y + ny * md;
        const vn = p.vx * nx + p.vy * ny;
        if (vn >= 0) continue;
        p.vx -= (1 + e) * vn * nx;
        p.vy -= (1 + e) * vn * ny;
        imp = Math.max(imp, -vn);
        if (-vn > 120 && isCrystal()) {
          Crystal.wave(c.x, c.y, clamp(-vn / 900, 0.3, 1.6));
          Sound.bell(Crystal.noteAt(c.x, c.y, 1), clamp(-vn / 1600, 0.2, 1), c.x, false, 'pillar');
        }
      }
      return imp;
    }

    // Raketler sütunların içinden geçemez
    function pushOut(x, y, r) {
      for (const c of pillars) {
        const dx = x - c.x, dy = y - c.y, md = c.r + r, d = Math.hypot(dx, dy);
        if (d < md) {
          const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
          x = c.x + nx * md;
          y = c.y + ny * md;
        }
      }
      return [x, y];
    }

    function draw(g) {
      // Lav bacası uyarısı: daralan, hızlanan kızıl halka
      for (const v of vents) {
        if (v.blown) {
          const k = (v.t - VENT_WARN) / (VENT_LIFE - VENT_WARN);
          g.globalAlpha = Math.max(0, 0.5 * (1 - k));
          g.fillStyle = 'rgba(255,170,60,1)';
          g.beginPath();
          g.arc(v.x, v.y, VENT_R * (0.6 + k * 0.5), 0, TAU);
          g.fill();
          continue;
        }
        const k = v.t / VENT_WARN, pulse = 0.5 + 0.5 * Math.sin(v.t * (10 + k * 22));
        g.globalAlpha = 0.25 + 0.55 * k * pulse;
        g.strokeStyle = 'rgb(255,80,20)';
        g.lineWidth = 3 + k * 3;
        g.beginPath();
        g.arc(v.x, v.y, VENT_R * (1 - k * 0.35), 0, TAU);
        g.stroke();
        g.fillStyle = 'rgba(255,120,30,0.35)';
        g.beginPath();
        g.arc(v.x, v.y, 10 + k * 18, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      // Çekim kuyusunun parlayan çekirdeği (ızgara bükülmesini Space çizer)
      for (const w of wells) {
        const gr = g.createRadialGradient(w.x, w.y, 0, w.x, w.y, 34);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)');
        gr.addColorStop(0.25, 'rgba(160,120,255,0.55)');
        gr.addColorStop(1, 'rgba(90,60,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(w.x, w.y, 34, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(190,170,255,0.35)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(w.x, w.y, 46 + 6 * Math.sin(time * 2.4 + w.ph), 0, TAU);
        g.stroke();
      }
      // Kristal sütunlar: altıgen, ışıldayan prizmalar
      for (const c of pillars) {
        g.save();
        g.translate(c.x, c.y);
        g.shadowColor = 'rgba(160,120,255,0.9)';
        g.shadowBlur = 16 * S;
        const gr = g.createLinearGradient(-c.r, -c.r, c.r, c.r);
        gr.addColorStop(0, '#f2e8ff');
        gr.addColorStop(0.45, '#9b6bff');
        gr.addColorStop(1, '#3a1d8a');
        g.fillStyle = gr;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + time * 0.25;
          g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * (c.r + 2), Math.sin(a) * (c.r + 2));
        }
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,0.75)';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.55)';
        g.beginPath();
        g.moveTo(-c.r * 0.5, -c.r * 0.55);
        g.lineTo(c.r * 0.1, -c.r * 0.75);
        g.lineTo(-c.r * 0.1, -c.r * 0.1);
        g.closePath();
        g.fill();
        g.restore();
      }
    }

    return { reset, update, forces, collide, pushOut, draw, wells, vents, pillars };
  })();

  function stepPhysics(dt, remaining = 0) {
    const plan = mallets.map((m) => {
      let ex, ey;
      if (m.ai) {
        m.aiTimer -= dt;
        if (m.aiTimer <= 0) {
          aiThink(m);
          m.aiTimer = m.level.think * rand(0.7, 1.3);
        }
        [ex, ey] = aiMove(m, dt);
      } else {
        applyKeyboard(m, dt);
        ex = m.x + (m.tx - m.x) / (remaining + 1);
        ey = m.y + (m.ty - m.y) / (remaining + 1);
      }
      [ex, ey] = clampPos(m, ex, ey);
      let vx = (ex - m.x) / dt, vy = (ey - m.y) / dt;
      const v = Math.hypot(vx, vy), vmax = phys().mallet || MAX_MALLET_V; // çamurda raketler ağır
      if (v > vmax) { vx *= vmax / v; vy *= vmax / v; }
      m.vx = vx;
      m.vy = vy;
      if (m.ai) { m.avx = vx; m.avy = vy; }
      return { sx: m.x, sy: m.y, ex, ey };
    });

    const h = dt / SUBSTEPS;
    const hits = [0, 0];
    let wallImp = 0, wx = 0, wy = 0;
    let puckImp = 0, cx = 0, cy = 0;
    const goals = [];

    for (let s = 1; s <= SUBSTEPS; s++) {
      const f = s / SUBSTEPS;
      for (let k = 0; k < 2; k++) {
        const m = mallets[k], pl = plan[k];
        m.x = lerp(pl.sx, pl.ex, f);
        m.y = lerp(pl.sy, pl.ey, f);
      }

      for (const p of pucks) {
        if (!p.active) continue;
        Arena.forces(p, h);
        p.x += p.vx * h;
        p.y += p.vy * h;
        for (let k = 0; k < 2; k++) {
          const imp = collideMallet(p, mallets[k]);
          if (imp > hits[k]) hits[k] = imp;
        }
      }

      for (let i = 0; i < pucks.length; i++) {
        for (let j = i + 1; j < pucks.length; j++) {
          if (!pucks[i].active || !pucks[j].active) continue;
          const imp = collidePucks(pucks[i], pucks[j]);
          if (imp > puckImp) {
            puckImp = imp;
            cx = (pucks[i].x + pucks[j].x) / 2;
            cy = (pucks[i].y + pucks[j].y) / 2;
          }
        }
      }

      for (const p of pucks) {
        if (!p.active) continue;
        const w = Math.max(collideWalls(p), Arena.collide(p));
        if (w > wallImp) { wallImp = w; wx = p.x; wy = p.y; }
        resolvePin(p, mallets[0]);
        resolvePin(p, mallets[1]);

        const sp = Math.hypot(p.vx, p.vy);
        if (sp > MAX_PUCK) { p.vx *= MAX_PUCK / sp; p.vy *= MAX_PUCK / sp; }

        if (p.y < 0 || p.y > H) {
          p.active = false;
          goals.push([p.y < 0 ? 0 : 1, p]);
        }
      }
    }

    const P = phys();
    for (const p of pucks) {
      if (!p.active) continue;
      // Stadyuma göre sürtünme; çamurda yavaşlayan pak çamura yapışır
      const sp = Math.hypot(p.vx, p.vy);
      const k = Math.exp(-(P.damp + (P.stick && sp < 170 ? P.stick : 0)) * dt);
      p.vx *= k;
      p.vy *= k;
      if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) placePuck(p, -1);
    }

    for (let i = 0; i < 2; i++) if (hits[i] > 50) onMalletHit(mallets[i], hits[i]);
    if (wallImp > 90) onWallHit(wx, wy, wallImp);
    if (puckImp > 90) onPuckHit(cx, cy, puckImp);
    for (const [scorer, p] of goals) onGoal(scorer, p);
  }

  function onMalletHit(m, imp) {
    achShot(m);
    if (m.ai && m.tap) {
      let near = null, nd = Infinity;
      for (const p of pucks) if (p.active && Math.hypot(p.x - m.x, p.y - m.y) < nd) { nd = Math.hypot(p.x - m.x, p.y - m.y); near = p; }
      if (near) startClear(m, near);
    }
    const k = clamp(imp / 1800, 0, 1);
    m.glow = Math.max(m.glow, 0.35 + k * 0.65);
    if (m.hitCool > 0) return;
    m.hitCool = 0.06;
    const col = malletCol(m.i);
    const dir = Math.atan2(m.hy - m.y, m.hx - m.x);
    spawn(m.hx, m.hy, col.rgb, 6 + Math.round(k * 18), 260 + k * 700, 0.45, 3, { dir, spread: 1.1, spark: true });
    spawn(m.hx, m.hy, '255,255,255', 3 + Math.round(k * 6), 200 + k * 300, 0.3, 2.2, { dir, spread: 0.8, spark: true });
    if (k > 0.35) ripple(m.hx, m.hy, col.rgb, 10, 50 + k * 50, 0.35, 3);
    game.shake = Math.max(game.shake, k * 5);
    if (isSand()) Sound.sandHit(k, m.hx);
    else if (isSpace()) Sound.spaceHit(k, m.hx);
    else if (isCrystal()) Sound.bell(Crystal.noteAt(m.hx, m.hy), k, m.hx, true);
    else if (isMud()) Sound.mudHit(k, m.hx);
    else Sound.hit(k, m.hx);
    if (isWater()) {
      Water.splash(m.hx, m.hy, k * 0.9);
      Sound.splash(k * 0.8, m.hx);
    } else if (isMud()) {
      Water.splash(m.hx, m.hy, 0.2 + k * 0.9);
      // Sert şutta çamur sıçrar
      if (k > 0.45) {
        const e = (k - 0.4) / 0.6;
        spawn(m.hx, m.hy, '70,46,24', 10 + Math.round(e * 22), 260 + e * 560, 0.7, 3.4, { dir, spread: 1.4, keep: true });
        spawn(m.hx, m.hy, '105,74,42', 6 + Math.round(e * 12), 160 + e * 380, 0.8, 2.4, { dir, spread: 1.8, keep: true });
        Sound.mudSplash(e, m.hx);
      }
    } else if (isIce()) {
      spawn(m.hx, m.hy, '', 3 + Math.round(k * 6), 120 + k * 200, 0.4, 2);
      if (k > 0.5) {
        const e = (k - 0.45) / 0.55;
        Ice.crack(m.hx, m.hy, e);
        spawn(m.hx, m.hy, '', 10 + Math.round(e * 22), 280 + e * 520, 0.6, 2.6);
        Sound.crackle(e, m.hx);
        game.shake = Math.max(game.shake, 3 + e * 6);
      }
    } else if (isLava()) {
      Sound.sizzle(k * 0.6, m.hx);
      if (k > 0.5) {
        const e = (k - 0.45) / 0.55;
        Lava.breakCrust(m.hx, m.hy, e);
        spawn(m.hx, m.hy, '255,190,80', 12 + Math.round(e * 26), 300 + e * 600, 0.8, 3, { keep: true });
        spawn(m.hx, m.hy, '255,110,30', 8 + Math.round(e * 12), 200 + e * 400, 1.1, 2.4, { keep: true, spark: true });
        Sound.eruption(e, m.hx);
        game.shake = Math.max(game.shake, 4 + e * 7);
      }
    } else if (isSand()) {
      spawn(m.hx, m.hy, '', 4 + Math.round(k * 8), 100 + k * 220, 0.5, 2);
      if (k > 0.5) {
        const e = (k - 0.45) / 0.55;
        Sand.blast(m.hx, m.hy, e * 0.8);
        spawn(m.hx, m.hy, '205,170,115', 14 + Math.round(e * 24), 220 + e * 480, 0.7, 2.4, { dir, spread: 1.3, keep: true });
        Sound.sandBlast(e, m.hx);
      }
    } else if (isSpace()) {
      Space.pulse(m.hx, m.hy, 0.35 + k * 0.9, 70 + k * 60);
    } else if (isCrystal()) {
      Crystal.wave(m.hx, m.hy, 0.15 + k * 1.15);
      // Prizmadan saçılan gökkuşağı kıvılcımları
      if (k > 0.3) {
        ['255,90,110', '255,210,90', '90,255,150', '90,160,255', '190,110,255'].forEach((c) => {
          spawn(m.hx, m.hy, c, 1 + Math.round(k * 4), 200 + k * 500, 0.55, 2.2, { dir, spread: 1.2, spark: true, keep: true });
        });
      }
    }
    if (!m.ai) vibrate(Math.round(6 + k * 18));
  }

  function onWallHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, puckRgb(), 6, 30 + k * 40, 0.4, 2.5);
    if (k > 0.2) spawn(x, y, puckRgb(), Math.round(3 + k * 8), 150 + k * 350, 0.35, 2.4, { spark: true });
    Sound.wall(k, x);
    if (isWater()) {
      Water.splash(x, y, k * 0.7);
      Sound.splash(k * 0.55, x);
    } else if (isMud()) {
      Water.splash(x, y, k * 0.6);
      if (k > 0.3) Sound.mudSplash(k * 0.5, x);
    } else if (isIce()) {
      // Çarpılan duvar ve sahaya doğru yön
      let wx = x, wy = y, dir;
      if (x <= PUCK_R + 1) { wx = 2; dir = 0; }
      else if (x >= W - PUCK_R - 1) { wx = W - 2; dir = Math.PI; }
      else if (y <= PUCK_R + 1) { wy = 2; dir = Math.PI / 2; }
      else { wy = H - 2; dir = -Math.PI / 2; }
      Ice.bruise(wx, wy, 6 + k * 8, 0.18 + k * 0.25); // bantta kar tozu
      if (k > 0.45) {
        const e = (k - 0.4) / 0.6;
        Ice.crack(wx, wy, e, dir, Math.PI * 0.95);
        spawn(wx, wy, '', 8 + Math.round(e * 16), 250 + e * 450, 0.55, 2.4, { dir, spread: 1.2 });
        Sound.crackle(e * 0.9, x);
      }
    } else if (isLava()) {
      let wx = x, wy = y, dir;
      if (x <= PUCK_R + 1) { wx = 2; dir = 0; }
      else if (x >= W - PUCK_R - 1) { wx = W - 2; dir = Math.PI; }
      else if (y <= PUCK_R + 1) { wy = 2; dir = Math.PI / 2; }
      else { wy = H - 2; dir = -Math.PI / 2; }
      Lava.pool(wx, wy, 6 + k * 10, 0.3 + k * 0.4);
      Sound.sizzle(k * 0.5, x);
      if (k > 0.45) {
        const e = (k - 0.4) / 0.6;
        Lava.breakCrust(wx, wy, e, dir, Math.PI * 0.95);
        spawn(wx, wy, '255,180,70', 10 + Math.round(e * 18), 260 + e * 480, 0.8, 2.6, { dir, spread: 1.2, keep: true });
        Sound.eruption(e * 0.8, x);
      }
    } else if (isSand()) {
      let wx = x, wy = y, dir;
      if (x <= PUCK_R + 1) { wx = PUCK_R; dir = 0; }
      else if (x >= W - PUCK_R - 1) { wx = W - PUCK_R; dir = Math.PI; }
      else if (y <= PUCK_R + 1) { wy = PUCK_R; dir = Math.PI / 2; }
      else { wy = H - PUCK_R; dir = -Math.PI / 2; }
      if (k > 0.35) {
        const e = (k - 0.3) / 0.7;
        Sand.blast(wx, wy, e * 0.7);
        spawn(wx, wy, '215,182,130', 6 + Math.round(e * 14), 180 + e * 380, 0.6, 2.2, { dir, spread: 1.1, keep: true });
        Sound.sandBlast(e * 0.7, x);
      }
    } else if (isSpace()) {
      Space.pulse(x, y, 0.3 + k * 0.8, 60 + k * 50);
      if (k > 0.35) Sound.spaceRing(k * 0.6, x);
    } else if (isCrystal()) {
      if (k > 0.15) Crystal.wave(x, y, 0.1 + k * 0.7);
      // Bantta bir oktav pes, daha yumuşak nota
      if (k > 0.25) Sound.bell(Crystal.noteAt(x, y, -1), k * 0.6, x);
    }
  }

  function onPuckHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, '255,255,255', 8, 40 + k * 40, 0.35, 3);
    spawn(x, y, '255,255,255', Math.round(4 + k * 10), 200 + k * 400, 0.35, 2.4, { spark: true });
    spawn(x, y, puckRgb(), Math.round(3 + k * 8), 150 + k * 300, 0.4, 2.4, { spark: true });
    Sound.clack(k, x);
    if (isWater()) Water.splash(x, y, k * 0.6);
    else if (isMud()) {
      Water.splash(x, y, 0.3 + k * 0.7);
      Sound.mudHit(k * 0.8, x);
    } else if (isIce() && k > 0.6) {
      Ice.crack(x, y, (k - 0.55) * 1.2);
      Sound.crackle((k - 0.55) * 1.4, x);
    } else if (isLava() && k > 0.6) {
      Lava.breakCrust(x, y, (k - 0.55) * 1.2);
      Sound.eruption((k - 0.55) * 1.2, x);
    } else if (isSand() && k > 0.5) {
      Sand.blast(x, y, (k - 0.45) * 1.1);
      Sound.sandBlast((k - 0.45) * 1.2, x);
    } else if (isSpace()) {
      // İki kütlenin çarpışması ağda halka halka yayılır
      Space.pulse(x, y, 0.8 + k * 1.4, 140 + k * 100);
      Sound.warp(k, x);
    } else if (isCrystal()) {
      // İki kristal: nota ve beşlisi birlikte çalar
      Crystal.wave(x, y, 0.6 + k * 1.2);
      const f = Crystal.noteAt(x, y);
      Sound.bell(f, k, x, false, 'bellA');
      Sound.bell(f * 1.5, k * 0.7, x, false, 'bellB');
    }
  }

  function onGoal(scorer, p) {
    const col = COLORS[scorer];
    const gi = scorer === 0 ? 1 : 0; // golün girdiği kale
    const half = goals[gi].w / 2;
    const gx = clamp(p.x, W / 2 - half + 10, W / 2 + half - 10);
    const gy = scorer === 0 ? 0 : H;
    goals[gi].grow = 0; // Dev Kale golle tükenir
    p.active = false;
    p.visible = false;

    const dir = scorer === 0 ? Math.PI / 2 : -Math.PI / 2;
    spawn(gx, gy, col.rgb, 70, 1100, 1.1, 4, { dir, spread: 1.25, spark: true, keep: true });
    Water.splash(gx, scorer === 0 ? 14 : H - 14, 1.8);
    if (isWater()) Sound.splash(1, gx);
    if (isMud()) {
      // Kale ağzında büyük çamur sıçraması
      const my = scorer === 0 ? 12 : H - 12;
      spawn(gx, my, '66,44,22', 60, 950, 1.2, 4, { dir, spread: 1.4, keep: true });
      spawn(gx, my, '110,78,44', 30, 600, 1.4, 2.8, { dir, spread: 1.7, keep: true });
      Sound.mudSplash(1.3, gx);
    }
    if (isIce()) {
      Ice.crack(gx, scorer === 0 ? 3 : H - 3, 1.1, scorer === 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.9);
      Sound.crackle(1, gx);
    } else if (isLava()) {
      // Lav patlaması
      const ly = scorer === 0 ? 6 : H - 6;
      Lava.breakCrust(gx, ly, 1.15, scorer === 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.95);
      Lava.pool(gx, ly, 70, 1);
      spawn(gx, ly, '255,200,90', 50, 900, 1.3, 3.5, { dir, spread: 1.4, keep: true });
      spawn(gx, ly, '255,90,20', 30, 600, 1.6, 2.6, { dir, spread: 1.5, keep: true, spark: true });
      Sound.eruption(1.2, gx);
    } else if (isSand()) {
      // Kale ağzında kum fırtınası
      const sy = scorer === 0 ? 10 : H - 10;
      Sand.blast(gx, sy, 1.3);
      spawn(gx, sy, '215,180,125', 60, 850, 1.2, 3, { dir, spread: 1.4, keep: true });
      spawn(gx, sy, '240,220,180', 30, 500, 1.6, 2, { dir, spread: 1.6, keep: true });
      Sound.sandBlast(1.2, gx);
    } else if (isSpace()) {
      // Süpernova
      const sy = scorer === 0 ? 14 : H - 14;
      Space.nova(gx, sy, 1);
      spawn(gx, sy, '255,255,255', 40, 1000, 1.2, 3, { dir, spread: 1.5, spark: true, keep: true });
      spawn(gx, sy, '150,210,255', 40, 750, 1.5, 3.2, { dir, spread: 1.6, keep: true });
      spawn(gx, sy, '200,130,255', 30, 520, 1.8, 2.6, { dir, spread: 1.6, keep: true });
      Sound.supernova(gx);
    } else if (isCrystal()) {
      // Kristal patlaması: kale ağzından güçlü bir ışık dalgası ve yükselen çan arpeji
      const cy = scorer === 0 ? 10 : H - 10;
      Crystal.wave(gx, cy, 2.3);
      setTimeout(() => Crystal.wave(gx, cy, 1.4), 180);
      ['255,90,110', '255,170,80', '255,235,90', '90,255,150', '90,200,255', '120,120,255', '200,110,255'].forEach((c) => {
        spawn(gx, cy, c, 10, 900, 1.3, 2.8, { dir, spread: 1.5, spark: true, keep: true });
      });
      Sound.chime(Crystal.noteAt(gx, cy), gx);
    }
    spawn(gx, gy, puckRgb(), 30, 700, 0.9, 3.5, { dir, spread: 1.4 });
    spawn(gx, gy, '255,255,255', 20, 500, 0.6, 2.5, { dir, spread: 1.5, spark: true });
    ripple(gx, gy, col.rgb, 20, 300, 0.8, 8);
    ripple(gx, gy, '255,255,255', 10, 180, 0.5, 3);
    game.flash = 1;
    game.flashRgb = col.rgb;
    game.shake = 16;

    if (game.state === 'demo') {
      game.timer = 1.1;
      return;
    }

    game.score[scorer]++;
    game.pulse[scorer] = 1;
    updateScoreHud(scorer);
    achGoal(scorer);
    game.lastScorer = scorer;
    Sound.goal(settings.mode === 'pvp' || scorer === 0, gx);
    vibrate([40, 40, 80]);

    if (game.frenzy) {
      // İki toplu bölümde oyun durmaz: yenen pak kısa süre sonra geri gelir.
      banner(tl('b.goal'), col.rgb, 1.1, 150);
      p.respawn = 0.8;
      p.respawnSide = 1 - scorer;
      return;
    }

    banner(tl('b.goal'), col.rgb, 1.5, 150);
    game.state = 'goal';
    game.timer = 1.6;
  }

  // ---------------------------------------------------------------------------
  // Skiller
  // ---------------------------------------------------------------------------
  const SKILL_KEYS = ['grow', 'shrink'];
  const FREE_PER_MATCH = 1; // her maçta her skillden ücretsiz hak

  // Maç içi ücretsiz haklar (oyuncu başına)
  const skills = [
    { grow: FREE_PER_MATCH, shrink: FREE_PER_MATCH, aiTimer: 1 },
    { grow: FREE_PER_MATCH, shrink: FREE_PER_MATCH, aiTimer: 1 },
  ];

  // Satın alınmış haklar: cihazda saklanır; iki oyunculu modda iki oyuncu da buradan kullanır.
  const inventory = loadInventory();
  if (isShowcase) inventory.grow = inventory.shrink = 99; // tanıtım: bol yetenek hakkı

  function loadInventory() {
    const v = store.get('inventory', null) || {};
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    return { grow: n(v.grow), shrink: n(v.shrink) };
  }

  function saveInventory() {
    store.set('inventory', { grow: inventory.grow, shrink: inventory.shrink });
  }

  const floaters = [];

  function resetSkills() {
    for (const sk of skills) {
      sk.grow = sk.shrink = FREE_PER_MATCH;
      sk.aiTimer = 1;
    }
    for (const g of goals) {
      g.grow = g.shrink = 0;
      g.w = GOAL_W;
    }
    floaters.length = 0;
  }

  // grow rakibin kalesini, shrink oyuncunun kendi kalesini etkiler
  function skillGoal(p, key) {
    return key === 'grow' ? 1 - p : p;
  }

  // Önce maçın ücretsiz hakkı, sonra satın alınmış envanter harcanır; ikisi de yoksa mağaza açılır.
  function useSkill(p, key) {
    const st = game.state, human = !mallets[p].ai;
    // Maç başındaki geri sayımda da kullanılabilir; etki süresi top oyuna girince işlemeye başlar.
    if (!(st === 'play' || st === 'demo' || (st === 'countdown' && human))) return false;
    const gi = skillGoal(p, key);
    if (goals[gi][key] > 0) {
      // Aynı etki zaten sürüyor: hak boşa harcanmasın
      if (human) Sound.denied();
      return false;
    }
    if (skills[p][key] > 0) {
      skills[p][key]--;
    } else if (human && inventory[key] > 0) {
      inventory[key]--;
      saveInventory();
    } else {
      if (human) openStore({ focus: key, fromGame: true });
      return false;
    }
    const sk = SKILLS[key];
    goals[gi][key] = sk.dur;
    const gy = gi === 1 ? 0 : H;
    ripple(W / 2, gy, sk.rgb, 20, 240, 0.7, 6);
    spawn(W / 2, gy, sk.rgb, 34, 650, 0.8, 3, { dir: gi === 1 ? Math.PI / 2 : -Math.PI / 2, spread: 1.3, spark: true });
    floaters.push({ text: sk.name + '!', gi, rgb: sk.rgb, t: 0, dur: 1.3 });
    if (isLiquid()) Water.splash(W / 2, gi === 1 ? 16 : H - 16, 1.2);
    if (isIce()) {
      Ice.crack(W / 2, gi === 1 ? 3 : H - 3, 0.6, gi === 1 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.8);
      Sound.crackle(0.5, W / 2);
    } else if (isLava()) {
      Lava.breakCrust(W / 2, gi === 1 ? 4 : H - 4, 0.6, gi === 1 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.8);
      Sound.eruption(0.5, W / 2);
    } else if (isSand()) {
      Sand.blast(W / 2, gi === 1 ? 12 : H - 12, 0.7);
      Sound.sandBlast(0.5, W / 2);
    } else if (isSpace()) {
      Space.pulse(W / 2, gi === 1 ? 10 : H - 10, 1.6, 200);
    } else if (isCrystal()) {
      Crystal.wave(W / 2, gi === 1 ? 10 : H - 10, 1.3);
    }
    Sound.skill(key);
    if (human) vibrate(25);
    if (human && st !== 'demo') achSkill();
    skillUI.dirty = true;
    return true;
  }

  function updateSkills(dt) {
    for (let p = 0; p < 2; p++) {
      if (!mallets[p].ai) continue;
      skills[p].aiTimer -= dt;
      if (skills[p].aiTimer <= 0) {
        skills[p].aiTimer = 0.4;
        aiSkills(p);
      }
    }
    for (const g of goals) {
      g.grow = Math.max(0, g.grow - dt);
      g.shrink = Math.max(0, g.shrink - dt);
    }
  }

  // Yapay zekâ yalnızca ücretsiz haklarını kullanır: kalesine hızlı top geliyorsa kilitler,
  // rakip kaleye şut gidiyorsa büyütür.
  function aiSkills(p) {
    const L = mallets[p].level, sk = skills[p];
    if (sk.grow <= 0 && sk.shrink <= 0) return;
    const flip = mallets[p].bottom;
    let threat = false, attack = false;
    for (const q of pucks) {
      if (!q.active) continue;
      const ly = flip ? H - q.y : q.y;
      const lvy = flip ? -q.vy : q.vy;
      if (lvy < -650 && ly < H * 0.6) {
        const hx = foldX(q.x + q.vx * (ly / -lvy));
        if (Math.abs(hx - W / 2) < goals[p].w / 2 + 40) threat = true;
      }
      if (lvy > 650 && ly > H * 0.35) {
        const hx = foldX(q.x + q.vx * ((H - ly) / lvy));
        if (Math.abs(hx - W / 2) < goals[1 - p].w / 2 + 110) attack = true;
      }
    }
    if (threat && sk.shrink > 0 && Math.random() < L.skillSmart) useSkill(p, 'shrink');
    else if (attack && sk.grow > 0 && Math.random() < L.skillSmart) useSkill(p, 'grow');
    else if (L.skillRandom && Math.random() < L.skillRandom) useSkill(p, sk.grow > 0 ? 'grow' : 'shrink');
  }

  function updateGoals(dt) {
    const k = 1 - Math.exp(-9 * dt);
    for (const g of goals) g.w += (goalTarget(g) - g.w) * k;
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].t += dt;
      if (floaters[i].t >= floaters[i].dur) floaters.splice(i, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Yapay zekâ
  // ---------------------------------------------------------------------------
  function foldX(x) {
    const lo = PUCK_R, span = W - PUCK_R * 2;
    let t = (x - lo) % (2 * span);
    if (t < 0) t += 2 * span;
    return t <= span ? lo + t : lo + 2 * span - t;
  }

  // İki top varken kalemize en çok tehdit oluşturan paka odaklan.
  function aiTarget(m) {
    let best = null, bestScore = Infinity;
    for (const p of pucks) {
      if (!p.active) continue;
      const ly = m.bottom ? H - p.y : p.y;
      const lvy = m.bottom ? -p.vy : p.vy;
      const score = ly + (lvy < 0 ? lvy * 0.3 : 0);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // Duvara dokundurulan pak raketin bulunduğu yere doğru geri seker (köşede tam geldiği yoldan).
  // Raket, pakla arasındaki doğruya dik olarak merkeze doğru hızla yana çekilir.
  function startClear(m, p) {
    const flip = m.bottom;
    const ly = flip ? H - m.y : m.y, py = flip ? H - p.y : p.y; // raketin yarısı üstteymiş gibi
    let dx = m.x - p.x, dy = ly - py;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    let sx = -dy, sy = dx; // dönüş yoluna dik
    if (sx * (W / 2 - m.x) < 0) { sx = -sx; sy = -sy; } // merkeze doğru olan taraf
    const cx = clamp(m.x + sx * (MIN_D + 30) + dx * 20, MALLET_R, W - MALLET_R);
    const cy = clamp(ly + sy * (MIN_D + 30) + dy * 20, MALLET_R, H / 2 - CENTER_GAP);
    m.clearUntil = game.time + 0.3;
    m.clearX = cx;
    m.clearY = cy;
    m.aiTx = cx;
    m.aiTy = flip ? H - cy : cy;
    m.aiMode = 'clear';
    m.charge = false;
    m.tap = false;
    m.aiTimer = Math.max(m.aiTimer, 0.08);
  }

  // Hesaplar raketin kendi yarısı üstteymiş gibi yapılır; alttaki AI için y aynalanır.
  function aiThink(m) {
    const L = m.level;
    const flip = m.bottom;
    const Y = (v) => (flip ? H - v : v);
    const P = aiTarget(m);
    const px = P ? P.x : W / 2, py = P ? Y(P.y) : H / 2;
    const pvx = P ? P.vx : 0, pvy = P ? (flip ? -P.vy : P.vy) : 0;
    const mx = m.x, my = Y(m.y);
    const guardY = 92;
    const limitY = H / 2 - CENTER_GAP;
    let tx, ty, mode, charge = false, tap = false;

    const noise = rand(-1, 1) * L.noise;
    const inOurHalf = py < H / 2 + PUCK_R * 0.5;

    if (!P) {
      mode = 'idle';
      tx = W / 2;
      ty = guardY;
    } else if (!inOurHalf || (pvy > 260 && py > my)) {
      // Savunma: pak rakip yarıda ya da bizden uzaklaşıyor
      mode = 'defend';
      if (pvy < -40) {
        const t = (py - guardY) / -pvy;
        const hitX = foldX(px + pvx * t) + noise;
        const ownW = goals[m.bottom ? 0 : 1].w;
        tx = W / 2 + clamp(hitX - W / 2, -ownW * 0.75, ownW * 0.75);
        ty = guardY;
      } else {
        tx = W / 2 + (px - W / 2) * 0.4;
        ty = guardY + 30;
      }
    } else {
      const lead = Math.min(L.predict, Math.hypot(px - mx, py - my) / L.speed);
      const qx = foldX(px + pvx * lead);
      const qy = clamp(py + pvy * lead, PUCK_R, H / 2 + PUCK_R);

      if (game.time < m.clearUntil) {
        // Duvara dokundurulan pak geri dönüyor: yolundan yana çekil (yoksa rakete çarpıp köşede kalır)
        mode = 'clear';
        tx = m.clearX;
        ty = m.clearY;
      } else if (py < MIN_D + 6 && Math.hypot(pvx, pvy) < 220) {
        // Pak arka duvara / köşeye yapışmış: arkasına geçilemez, üzerine bastırılırsa köşede sıkışır.
        // Biraz yandan, ölçülü bir hızla duvara doğru dokundur; değer değmez yana çekil (startClear),
        // duvardan seken pak sahaya döner.
        mode = 'dig';
        if (m.aiMode !== 'dig') m.digSide = px < W / 2 ? 1 : -1; // merkez tarafı
        const a = 0.36; // dokunuş açısı (~20°)
        const nx = m.digSide * Math.sin(a), ny = Math.cos(a);
        const ax = clamp(px + nx * (MIN_D + 22), MALLET_R, W - MALLET_R);
        const ay = clamp(py + ny * (MIN_D + 22), MALLET_R, limitY);
        const dist = Math.hypot(mx - px, my - py);
        if (m.tap && dist < MIN_D + 2) {
          startClear(m, P);
          return;
        }
        if (Math.hypot(mx - ax, my - ay) < 14 || (m.aiMode === 'dig' && m.tap)) {
          tx = px - nx * 14;
          ty = py - ny * 14;
          tap = true;
        } else {
          tx = ax;
          ty = dist < MIN_D + 12 ? Math.max(ay, my + 20) : ay; // yerleşirken pakı itme
        }
      } else if (P.stuck > 1.4) {
        // Pak uzun süredir yavaş: doğrudan üzerine git
        mode = 'poke';
        tx = qx;
        ty = qy - 6;
        charge = true;
      } else if (pvy < -380 && py > my - 6) {
        // Hızla kalemize geliyor: yolunu kes, yakınsa karşı vuruş yap
        mode = 'block';
        const t = (py - guardY) / -pvy;
        tx = foldX(px + pvx * t) + noise;
        ty = guardY;
        if (L.counter && Math.hypot(px - mx, py - my) < MIN_D * 2.2) {
          tx = px;
          ty = py;
          charge = true;
        }
      } else if (qy < my - 6) {
        // Pak arkamızda: yanından dolan
        mode = 'around';
        let side = mx < qx ? -1 : 1;
        let sx = qx + side * (MIN_D + 10);
        if (sx < MALLET_R || sx > W - MALLET_R) { side = -side; sx = qx + side * (MIN_D + 10); }
        tx = sx;
        ty = Math.abs(mx - sx) > 20 ? Math.max(my, qy) : qy - MIN_D * 0.7;
      } else {
        // Hücum: pakın arkasına geç, sonra kaleye doğru vur
        mode = 'attack';
        if (m.aiMode !== 'attack') {
          const spread = goals[m.bottom ? 1 : 0].w * 0.3 + L.aimErr * 150;
          m.aimX = W / 2 + rand(-spread, spread);
          if (Math.random() < L.bank) m.aimX = Math.random() < 0.5 ? -W / 2 : W * 1.5; // bant vuruşu
        }
        let ux = m.aimX - qx, uy = H + 60 - qy;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul;
        uy /= ul;
        const setX = clamp(qx - ux * (MIN_D + 10), MALLET_R, W - MALLET_R);
        const setY = clamp(qy - uy * (MIN_D + 10), MALLET_R, limitY);
        const rx = mx - qx, ry = my - qy;
        const along = rx * ux + ry * uy;
        const perp = Math.abs(-rx * uy + ry * ux);
        const atSetup = Math.hypot(mx - setX, my - setY) < 12;
        if ((along < -MIN_D * 0.6 && perp < MIN_D * 0.45) || atSetup) {
          tx = qx + ux * MIN_D * 1.2;
          ty = qy + uy * MIN_D * 1.2;
          charge = true;
        } else {
          tx = setX;
          ty = setY;
        }
      }
    }

    m.aiMode = mode;
    m.charge = charge;
    m.tap = tap;
    m.aiTx = clamp(tx, MALLET_R, W - MALLET_R);
    m.aiTy = Y(clamp(ty, MALLET_R, limitY));
  }

  function aiMove(m, dt) {
    const L = m.level;
    const dx = m.aiTx - m.x, dy = m.aiTy - m.y;
    const d = Math.hypot(dx, dy);
    const clearing = game.time < m.clearUntil;
    // Duvara dokunuş ölçülü hızda; dokunuştan sonra yana çekilme her seviyede çevik
    const maxV = m.tap ? Math.min(L.speed, 430) : clearing ? Math.max(L.speed, 900) : L.speed * (m.charge ? L.strike : 1);
    let dvx = 0, dvy = 0;
    if (d > 0.5) {
      const sp = Math.min(maxV, d * 9);
      dvx = (dx / d) * sp;
      dvy = (dy / d) * sp;
    }
    let ax = dvx - m.avx, ay = dvy - m.avy;
    const al = Math.hypot(ax, ay), maxA = Math.max(L.accel, clearing ? 9000 : 0) * dt;
    if (al > maxA) { ax *= maxA / al; ay *= maxA / al; }
    m.avx += ax;
    m.avy += ay;
    return [m.x + m.avx * dt, m.y + m.avy * dt];
  }

  // ---------------------------------------------------------------------------
  // Girdi
  // ---------------------------------------------------------------------------
  const keys = new Set();
  const pointerOwner = new Map();
  let lastInputTouch = false;

  function toField(e) {
    const r = canvas.getBoundingClientRect(); // döndürülmüş tuvalin ekrandaki kutusu
    if (landscape) {
      // Saat yönünde 90°: ekranın solu masanın altı (y = H), üstü masanın solu (x = 0)
      return {
        x: ((e.clientY - r.top) / r.height) * LW - B,
        y: (1 - (e.clientX - r.left) / r.width) * LH - B,
      };
    }
    return {
      x: ((e.clientX - r.left) / r.width) * LW - B,
      y: ((e.clientY - r.top) / r.height) * LH - B,
    };
  }

  function inputActive() {
    return game.state === 'play' || game.state === 'countdown' || game.state === 'goal';
  }

  function setTarget(idx, p) {
    const m = mallets[idx];
    if (m.ai) return;
    [m.tx, m.ty] = clampPos(m, p.x, p.y);
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!inputActive()) return;
    e.preventDefault();
    lastInputTouch = e.pointerType !== 'mouse';
    Sound.init();
    const p = toField(e);
    const idx = settings.mode === 'pvp' && e.pointerType !== 'mouse' && p.y < H / 2 ? 1 : 0;
    pointerOwner.set(e.pointerId, idx);
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    setTarget(idx, p);
  });

  window.addEventListener('pointermove', (e) => {
    if (!inputActive()) return;
    let idx = pointerOwner.get(e.pointerId);
    if (idx === undefined) {
      if (e.pointerType !== 'mouse') return;
      idx = 0;
    }
    if (e.pointerType === 'mouse') lastInputTouch = false;
    setTarget(idx, toField(e));
  });

  const release = (e) => pointerOwner.delete(e.pointerId);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // iOS: kaydırma / yakınlaştırma hareketlerini engelle
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest || !e.target.closest('.overlay, .vol-pop')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  const KEY_MOVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

  // Hareket ve yetenek tuşları fiziksel konumla (e.code) okunur: AZERTY'de WASD yerindeki Z Q S D
  // tuşları kendiliğinden çalışır. Ekranda o tuşların oyuncunun klavyesindeki adı gösterilir.
  const KEYCAP = { w: 'W', a: 'A', s: 'S', d: 'D', q: 'Q', e: 'E' };
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      navigator.keyboard.getLayoutMap().then((map) => {
        for (const k of Object.keys(KEYCAP)) {
          const v = map.get('Key' + k.toUpperCase());
          if (v) KEYCAP[k] = v.toLocaleUpperCase();
        }
        syncMenu();
      }).catch(() => {});
    }
  } catch (e) { /* çerçevede izin yoksa varsayılan adlar kalır */ }

  // Anlamlı kısayollar (P duraklat, M ses, N müzik) harfle okunur, klavye düzeni ne olursa olsun
  // üzerinde o harf yazan tuş çalışır; Latin olmayan düzenlerde fiziksel konuma düşer.
  function isLetter(e, ch) {
    const k = (e.key || '').toLowerCase();
    if (/^[a-z]$/.test(k)) return k === ch;
    // Kiril, Yunan vb. harf: Latin karşılığı yok, fiziksel konuma bak. Noktalama vb. hiçbir kısayol değil.
    return k.length === 1 && /\p{L}/u.test(k) && e.code === 'Key' + ch.toUpperCase();
  }

  window.addEventListener('keydown', (e) => {
    if (Ads.playing) return; // reklam oynarken girişler engellenir
    if (e.code === 'Escape' && !volPop.classList.contains('hidden')) {
      closeVolume();
      return;
    }
    if (e.code === 'Escape' && adEl.classList.contains('show')) {
      endAd();
      return;
    }
    if (e.code === 'Escape' && unlockEl.classList.contains('show')) {
      endPreview(false);
      return;
    }
    if (e.code === 'Escape' && achEl.classList.contains('show')) {
      showOverlay(achBack || menuEl);
      return;
    }
    if (e.code === 'Escape' && storeEl.classList.contains('show')) {
      if (storeState.pending) cancelPurchase();
      else closeStore();
      return;
    }
    // Escape tarayıcıda tam ekrandan çıkar: duraklatmaya bağlanmaz (P ya da ekrandaki düğme)
    if (isLetter(e, 'p')) {
      togglePause();
      return;
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      if (e.target && (e.target.id === 'volRange' || e.target.id === 'musRange')) return; // kaydırıcı kendi tuşlarını işler
      const up = e.code === 'Equal' || e.code === 'NumpadAdd';
      const base = settings.sound ? settings.volume : 0;
      setVolume(Math.round((base + (up ? 0.1 : -0.1)) * 10) / 10, true);
      toast(Sound.platformMute ? tl('v.platformMuted')
        : settings.sound && settings.volume > 0 ? tl('v.toast', { n: Math.round(settings.volume * 100) }) : tl('v.toastOff'));
      return;
    }
    if (isLetter(e, 'n')) {
      toggleMusic();
      toast(settings.music ? tl('v.toastMusicOn', { n: Math.round(settings.musicVol * 100) }) : tl('v.toastMusicOff'));
      return;
    }
    if (isLetter(e, 'm')) {
      if (Sound.platformMute) {
        toggleSound(); // uyarıyı gösterir
        return;
      }
      toggleSound();
      toast(settings.sound ? tl('v.toastOn', { n: Math.round(settings.volume * 100) }) : tl('v.toastOff'));
      return;
    }
    if ((e.code === 'Enter' || e.code === 'Space') && (menuEl.classList.contains('show') || introEl.classList.contains('show'))) {
      e.preventDefault();
      startMatch();
      return;
    }
    const sk = skillKey(e.code);
    if (sk) {
      if (!e.repeat && inputActive() && !mallets[sk[0]].ai) {
        e.preventDefault();
        lastInputTouch = false;
        useSkill(sk[0], sk[1]);
      }
      return;
    }
    if (KEY_MOVE.includes(e.code)) {
      e.preventDefault();
      keys.add(e.code);
      lastInputTouch = false;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    if (inputActive()) togglePause(); // pencere odağı kaçtı (sayfanın başka yerine tıklandı)
  });

  function applyKeyboard(m, dt) {
    let dx = 0, dy = 0;
    const arrows = m.i === 0;
    const wasd = m.i === 1 || settings.mode === 'ai';
    if (arrows) {
      if (keys.has('ArrowLeft')) dx--;
      if (keys.has('ArrowRight')) dx++;
      if (keys.has('ArrowUp')) dy--;
      if (keys.has('ArrowDown')) dy++;
    }
    if (wasd) {
      if (keys.has('KeyA')) dx--;
      if (keys.has('KeyD')) dx++;
      if (keys.has('KeyW')) dy--;
      if (keys.has('KeyS')) dy++;
    }
    if (!dx && !dy) return;
    if (landscape) [dx, dy] = [dy, -dx]; // tuşlar ekrandaki yöne göre: → rakibe doğru
    const l = Math.hypot(dx, dy), sp = 1050;
    [m.tx, m.ty] = clampPos(m, m.tx + (dx / l) * sp * dt, m.ty + (dy / l) * sp * dt);
  }

  // ---------------------------------------------------------------------------
  // Akış
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const menuEl = $('menu'), pauseEl = $('pauseMenu'), overEl = $('overMenu');
  const unlockEl = $('unlockMenu'), adEl = $('adMenu'), introEl = $('introMenu'), achEl = $('achMenu');
  const pauseBtn = $('pauseBtn'), soundBtn = $('soundBtn'), fsBtn = $('fsBtn');

  const clockEl = $('clock'), clockTime = $('clockTime'), clockTag = $('clockTag');
  let clockShown = '';

  function showOverlay(el) {
    [menuEl, pauseEl, overEl, cardEl, storeEl, unlockEl, adEl, introEl, achEl].forEach((o) => o.classList.toggle('show', o === el));
    const inGame = !el;
    pauseBtn.classList.toggle('hidden', !inGame);
    document.body.classList.toggle('playing', inGame);
  }

  function launchPuck(p, speed) {
    const a = rand(0.35, Math.PI - 0.35) * (Math.random() < 0.5 ? 1 : -1);
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
  }

  function startDemo() {
    game.state = 'demo';
    hideCoach(0);
    hideCoach(1);
    mallets.forEach((m) => {
      m.ai = true;
      m.level = AI_LEVELS.medium;
      resetMallet(m);
    });
    pucks.length = 1;
    resetSkills();
    const p = pucks[0];
    placePuck(p, -1);
    p.active = true;
    p.visible = true;
    launchPuck(p, 600);
    game.score = [0, 0];
    game.banner = null;
    clockEl.classList.add('hidden');
    showSkillBars(false);
    // İlk açılışta menü yerine "oynamak için dokun" ekranı: tek dokunuşla ilk maça girilir
    showOverlay(store.get('played', false) || isShowcase ? menuEl : introEl);
    checkDaily();
    checkAchievements(); // eski ilerlemeden (seviye, açılan temalar) hak edilmiş olanlar
    renderMissions();
  }

  // İlk açılış ekranı: ekranın herhangi bir yerine dokunmak maçı başlatır
  function syncIntro() {
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    $('introTap').textContent = tl(touch ? 'in.tap' : 'in.click');
    $('introHow').textContent = tl(touch ? 'in.howTouch' : 'in.howMouse');
  }
  introEl.addEventListener('click', () => {
    if (introEl.classList.contains('show')) startMatch();
  });

  // --- Kariyer yardımcıları ---
  function leagueOpen(li) {
    if (isShowcase || li === 0) return true;
    return career.won[LEAGUES[li - 1]] >= 5 || isUnlocked(LEAGUES[li]);
  }
  const matchOpen = (li, mi) => leagueOpen(li) && (isShowcase || mi <= career.won[LEAGUES[li]]);
  const leaguesWon = () => LEAGUES.filter((l) => career.won[l] >= 5).length;
  const rival = (li, mi) => RIVALS[LEAGUES[li]][mi];
  const leagueStars = (li) => [0, 1, 2, 3, 4].reduce((a, mi) => a + (career.stars[LEAGUES[li] + '-' + mi] || 0), 0);

  function saveCareer() {
    store.set('career', career);
  }

  // Lig seçmek stadyumu da seçer (tek oyunculu modda stadyum ligden gelir)
  function selectLeague(li, mi) {
    career.li = clamp(li, 0, 7);
    career.mi = mi === undefined ? Math.min(career.won[LEAGUES[career.li]], 4) : clamp(mi, 0, 4);
    saveCareer();
    const th = LEAGUES[career.li];
    if (settings.mode === 'ai' && settings.theme !== th && isUnlocked(th)) {
      settings.theme = th;
      store.set('theme', th);
      applyTheme();
    }
    syncMenu();
  }

  function startMatch() {
    Sound.init();
    game.score = [0, 0];
    game.pulse = [0, 0];
    game.clock = MATCH_TIME;
    game.frenzy = false;
    pucks.length = 1;
    resetSkills();
    if (isIce()) Ice.reset();
    if (isLava()) Lava.reset();
    if (isSand()) Sand.reset();
    if (isSpace()) Space.reset();
    if (isCrystal()) Crystal.reset();
    if (isMud()) {
      Water.reset();
      Swamp.reset();
    }
    mallets.forEach(resetMallet);
    mallets[0].ai = false;
    mallets[1].ai = settings.mode === 'ai';
    // Tek oyunculu: kariyerdeki seçili rakip, ligin stadyumunda
    game.rival = null;
    if (settings.mode === 'ai') {
      const li = career.li, mi = career.mi, th = LEAGUES[li];
      if (settings.theme !== th && isUnlocked(th)) {
        settings.theme = th;
        store.set('theme', th);
        applyTheme();
      }
      const [icon, name] = rival(li, mi);
      game.rival = { li, mi, icon, name };
    }
    game.level = game.rival ? rivalDiff(game.rival.li, game.rival.mi) : 1;
    achMatchStart();
    mallets[1].level = game.rival ? rivalAI(game.rival.li, game.rival.mi) : aiForLevel(1);
    pointerOwner.clear();
    particles.length = 0;
    ripples.length = 0;
    clockEl.classList.remove('hidden');
    updateClock();
    updateScoreHud();
    showSkillBars(true);
    showOverlay(null);
    store.set('played', true);
    startCoach();
    Arena.reset();
    // Stadyumun kuralı: her stadyumda ilk iki maçta kısa bir ipucu
    const tips = store.get('tips', null) || {};
    let tipShown = false;
    if (!isShowcase && PHYS[settings.theme] !== PHYS.neon && settings.theme !== 'water' && (tips[settings.theme] || 0) < 2) {
      tips[settings.theme] = (tips[settings.theme] || 0) + 1;
      store.set('tips', tips);
      setTimeout(() => toast(tl('ph.' + settings.theme), 4200), 400);
      tipShown = true;
    }
    // Yetenek ipucu ilk maçta değil (önce temel kontrol), sonraki maçta bir kez gösterilir
    if (!store.get('skillsSeen', false) && !coach.on[0] && !tipShown) {
      store.set('skillsSeen', true);
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      setTimeout(() => toast(touch ? tl(landscape ? 'sk.introTouchL' : 'sk.introTouch') : tl('sk.introKeys')), 1800);
    }
    serve(Math.random() < 0.5 ? 0 : 1);
  }

  // İlk maç rehberi: her mod için ilk maçta oyuncunun raketinin yanında hareket ettirme hareketi
  // (dokunmatikte sürükleyen el, masaüstünde fare + ok tuşları). Raket ~45 birim hareket edince ya
  // da oyun 8 saniye akınca kaybolur; oyunu hiç engellemez.
  const coach = { on: [false, false], t: 0, from: [[0, 0], [0, 0]], key: '' };

  function startCoach() {
    const pvp = settings.mode === 'pvp';
    coach.key = pvp ? 'coachPvp' : 'coachAi';
    const show = !isShowcase && !store.get(coach.key, false);
    coach.on = [show, show && pvp];
    coach.t = 0;
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    for (let i = 0; i < 2; i++) {
      coach.from[i] = [mallets[i].x, mallets[i].y];
      const el = $('coach' + i);
      el.classList.toggle('hidden', !coach.on[i]);
      el.classList.toggle('touch', touch);
    }
    document.querySelectorAll('[data-kc]').forEach((b) => { b.textContent = KEYCAP[b.dataset.kc]; });
  }

  function hideCoach(i) {
    if (!coach.on[i]) return;
    coach.on[i] = false;
    $('coach' + i).classList.add('hidden');
    if (!coach.on[0] && !coach.on[1]) store.set(coach.key, true);
  }

  function updateCoach(dt) {
    if (!coach.on[0] && !coach.on[1]) return;
    if (game.state === 'play') coach.t += dt;
    for (let i = 0; i < 2; i++) {
      if (!coach.on[i]) continue;
      const m = mallets[i], [x0, y0] = coach.from[i];
      if (Math.hypot(m.x - x0, m.y - y0) > 45 || coach.t > 8) hideCoach(i);
    }
  }

  function serve(side) {
    const p = pucks[0];
    placePuck(p, side);
    p.active = false;
    p.visible = true;
    game.state = 'countdown';
    game.count = 3;
    game.timer = 0.55;
    banner('3', '155,107,255', 0.55, 160);
    Sound.beep(false);
  }

  // 45. saniye: ikinci top ortadan oyuna girer.
  function startFrenzy() {
    game.frenzy = true;
    const p = makePuck();
    pucks.push(p);
    placePuck(p, -1);
    p.visible = true;
    p.blink = 1.0;
    p.launch = 450;
    banner(tl('b.second'), PUCK_RGB, 1.6, 120);
    ripple(p.x, p.y, PUCK_RGB, 20, 260, 0.9, 7);
    ripple(p.x, p.y, '255,255,255', 10, 160, 0.6, 3);
    spawn(p.x, p.y, PUCK_RGB, 40, 800, 0.9, 3.5, { spark: true });
    game.flash = 0.7;
    game.flashRgb = PUCK_RGB;
    game.shake = 8;
    Sound.frenzy();
    vibrate([30, 30, 30, 30, 60]);
  }

  // Skor sayacın iki yanında gösterilir (zeminde değil). `bump`: gol atan taraf kısa süre büyür.
  function updateScoreHud(bump = -1) {
    const pvp = settings.mode === 'pvp';
    const labels = pvp ? [COLORS[0].name, COLORS[1].name] : [tl('you'), game.rival ? game.rival.name : 'CPU'];
    for (let i = 0; i < 2; i++) {
      $('hs' + i).textContent = game.score[i];
      $('hsLab' + i).textContent = labels[i];
      const box = $('hsBox' + i);
      if (i === bump) {
        box.classList.remove('bump');
        void box.offsetWidth;
        box.classList.add('bump');
      }
    }
  }

  function updateClock() {
    const left = Math.max(0, Math.ceil(game.clock));
    const elapsed = MATCH_TIME - game.clock;
    const soon = !game.frenzy && elapsed >= SECOND_PUCK_AT - 5;
    const key = left + (game.frenzy ? 'f' : soon ? 's' : '');
    if (key === clockShown) return;
    clockShown = key;
    clockTime.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    clockEl.classList.toggle('frenzy', game.frenzy);
    clockEl.classList.toggle('soon', soon);
    clockEl.classList.toggle('final', left <= 10);
    clockTag.textContent = game.frenzy ? tl('clock.two') : soon ? tl('clock.soon') : '';
  }

  function updatePucks(dt) {
    for (const p of pucks) {
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          placePuck(p, p.respawnSide);
          p.visible = true;
          p.blink = 0.9;
        }
      } else if (p.blink > 0) {
        p.blink -= dt;
        if (p.blink <= 0) {
          p.active = true;
          if (p.launch) launchPuck(p, p.launch);
          p.launch = null;
          Sound.beep(true);
        }
      }
      // Takılı pak algılama (AI için)
      if (p.active && Math.hypot(p.vx, p.vy) < 40) p.stuck += dt;
      else p.stuck = 0;
    }
  }

  function update(dt) {
    game.time += dt;
    updateEffects(dt);
    updateGoals(dt);
    const st = game.state;
    if (st === 'paused' || st === 'over') return;
    updateCoach(dt);
    Arena.update(dt);

    if (st === 'countdown') {
      game.timer -= dt;
      if (game.timer <= 0) {
        game.count--;
        if (game.count > 0) {
          game.timer = 0.55;
          banner(String(game.count), '155,107,255', 0.55, 160);
          Sound.beep(false);
        } else {
          game.state = 'play';
          pucks[0].active = true;
          banner(tl('b.go'), PUCK_RGB, 0.7, 96);
          Sound.beep(true);
        }
      }
    } else if (st === 'goal') {
      game.timer -= dt;
      if (game.timer <= 0) serve(1 - game.lastScorer);
    } else if (st === 'play') {
      // Süre yalnızca oyun akarken işler
      const before = Math.ceil(game.clock);
      game.clock -= dt;
      const now = Math.ceil(game.clock);
      if (!game.frenzy && MATCH_TIME - game.clock >= SECOND_PUCK_AT) startFrenzy();
      if (now !== before && now <= 10 && now > 0) Sound.tick(now <= 3);
      if (game.clock <= 0) {
        game.clock = 0;
        updateClock();
        endMatch();
        return;
      }
      updatePucks(dt);
      updateSkills(dt);
    } else if (st === 'demo') {
      const p = pucks[0];
      if (!p.active) {
        game.timer -= dt;
        if (game.timer <= 0) {
          placePuck(p, -1);
          p.active = true;
          p.visible = true;
          launchPuck(p, 500);
        }
      }
      updatePucks(dt);
      updateSkills(dt);
    }

    if (st !== 'demo') updateClock();
    // Kare hızı düşse de oyun gerçek zamanlı aksın: fiziği en fazla 1/60 sn'lik adımlarla çalıştır.
    const n = Math.max(1, Math.ceil(dt * 60 - 1e-6));
    for (let i = 0; i < n; i++) stepPhysics(dt / n, n - 1 - i);
    if (isLiquid()) {
      updateWater(dt);
      if (isMud()) Swamp.update(dt);
    }
    else if (isIce()) Ice.update(dt);
    else if (isLava()) Lava.update(dt);
    else if (isSand()) Sand.update(dt);
    else if (isSpace()) Space.update(dt);
    else if (isCrystal()) Crystal.update(dt);
  }

  // Suda yüzen nesneler: raketler daha derin oturur (daha çok su iter), paklar daha sığ
  const floatBodies = [
    { id: 'm0', x: 0, y: 0, r: MALLET_R, depth: 0.62 },
    { id: 'm1', x: 0, y: 0, r: MALLET_R, depth: 0.62 },
    { id: 'p0', x: 0, y: 0, r: PUCK_R, depth: 0.45 },
    { id: 'p1', x: 0, y: 0, r: PUCK_R, depth: 0.45 },
  ];
  const floatList = [];

  function updateWater(dt) {
    floatList.length = 0;
    for (let i = 0; i < 2; i++) {
      const b = floatBodies[i];
      b.x = mallets[i].x;
      b.y = mallets[i].y;
      floatList.push(b);
    }
    for (let i = 0; i < pucks.length && i < 2; i++) {
      const p = pucks[i];
      if (!p.visible) continue;
      const b = floatBodies[2 + i];
      b.x = p.x;
      b.y = p.y;
      floatList.push(b);
    }
    Water.update(dt, floatList, quality.lite);
    Water.setObjects(floatList);
  }

  function endMatch() {
    game.state = 'over';
    hideCoach(0);
    hideCoach(1);
    pucks.forEach((p) => { p.active = false; });
    const [a, b] = game.score;
    const draw = a === b;
    const w = a > b ? 0 : 1;
    const pvp = settings.mode === 'pvp';
    const win = !draw && (pvp || w === 0);
    const title = $('resultTitle');
    if (draw) {
      title.className = 'title';
      title.textContent = tl('r.draw');
      $('resultIcon').textContent = '🤝';
    } else {
      title.className = 'title ' + (pvp ? (w === 0 ? 'win' : 'pink') : win ? 'win' : 'lose');
      title.textContent = pvp ? tl('r.wins', { name: COLORS[w].name }) : win ? tl('r.win') : tl('r.lose');
      $('resultIcon').textContent = win ? '🏆' : '💔';
    }
    $('finalP1').textContent = a;
    $('finalP2').textContent = b;
    const level = game.level || 1, R = game.rival;
    let champ = null, sub;
    if (pvp || !R) {
      sub = draw ? tl('r.subDraw') : tl('r.subPvp');
      game.again = ['r.again'];
    } else if (win) {
      // Yıldız: galibiyet 1, 2+ fark 2, gol yemeden 3
      const st = b === 0 ? 3 : a - b >= 2 ? 2 : 1, key = LEAGUES[R.li] + '-' + R.mi;
      career.stars[key] = Math.max(career.stars[key] || 0, st);
      const lg = LEAGUES[R.li];
      if (R.mi === career.won[lg]) {
        career.won[lg]++;
        if (career.won[lg] === 5) champ = R.li; // ligi ilk kez kazandı
      }
      if (champ !== null && R.li < 7 && !isUnlocked(LEAGUES[R.li + 1])) {
        wallet.unlocked.push(LEAGUES[R.li + 1]); // sonraki stadyum bedava açılır
        saveWallet();
        renderThemeLocks();
      }
      // Sıradaki: aynı ligde sonraki rakip; patrondan sonra sonraki lig
      if (R.mi < 4) { career.li = R.li; career.mi = R.mi + 1; }
      else if (R.li < 7) { career.li = R.li + 1; career.mi = Math.min(career.won[LEAGUES[R.li + 1]], 4); }
      saveCareer();
      const stars = '★'.repeat(st) + '☆'.repeat(3 - st);
      sub = champ !== null
        ? (R.li < 7 ? tl('c.champ', { l: tl('lg.' + lg), t: THEME_INFO[LEAGUES[R.li + 1]].name }) : tl('c.champAll'))
        : tl('c.win', { n: R.name, s: stars });
      game.again = R.mi < 4 ? ['c.next', { n: rival(career.li, career.mi)[1] }] : R.li < 7 ? ['c.nextLeague'] : ['r.again'];
      syncMenu();
    } else {
      sub = tl('c.lost', { n: R.name });
      game.again = ['r.retry'];
    }
    $('resultSub').textContent = sub;
    $('againBtn').textContent = tl(...game.again);

    const rname = R ? R.name : 'CPU';
    prepareShare({ a, b, draw, w, win, pvp, level, rname });
    grantMatchReward({ a, b, draw, win, pvp, level, rname, champ });
    achMatchEnd(win);
    banner(tl('b.time'), '255,255,255', 1.3, 84);
    Sound.buzzer();
    // Konfeti
    const rgb = draw ? '155,107,255' : COLORS[w].rgb;
    for (let i = 0; i < 6; i++) {
      spawn(rand(40, W - 40), rand(H * 0.2, H * 0.8), i % 2 ? rgb : PUCK_RGB, 22, 700, 1.8, 4, { gravity: 500 });
    }
    game.flash = 0.8;
    game.flashRgb = rgb;
    setTimeout(() => Sound.finale(win || draw), 500);
    vibrate(win ? [60, 50, 60, 50, 140] : 200);
    setTimeout(() => showOverlay(overEl), 1300);
  }

  // ---------------------------------------------------------------------------
  // Paylaşım
  // ---------------------------------------------------------------------------
  const cardEl = $('cardMenu'), toastEl = $('toast');
  const share = { blob: null, url: '', result: null };
  let toastTimer = 0;
  let downloadsApi = null; // claude.ai'de yayınlandığında izinli dosya kaydetme

  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => {
      downloadsApi = d;
      updateSaveUI();
    }).catch(() => {});
  }

  function canSave() {
    return !!downloadsApi || !isFramed();
  }

  function updateSaveUI() {
    $('cardSave').classList.toggle('hidden', !share.blob || !canSave());
    $('cardHint').textContent = canSave() ? tl('sh.hintSave') : tl('sh.hintHold');
  }

  function isFramed() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  // Paylaşılacak oyun adresi: kendi sitesinde sayfanın adresi, gömülü görünümde (varsa) çerçeveyi açan sayfa.
  function shareLink() {
    if (isFramed()) {
      return /^https:\/\/claude\.ai\/(code\/)?artifact\//.test(document.referrer) ? document.referrer : '';
    }
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return '';
    return location.origin + location.pathname;
  }

  function shareText() {
    const r = share.result;
    const s = `${r.a}-${r.b}`;
    let line;
    if (r.pvp) {
      const hi = Math.max(r.a, r.b), lo = Math.min(r.a, r.b);
      line = r.draw
        ? tl('sh.pvpDraw', { s })
        : tl('sh.pvpWin', { w: COLORS[r.w].label, l: COLORS[1 - r.w].label, hi, lo });
    } else {
      const d = r.rname || 'CPU';
      line = r.draw ? tl('sh.aiDraw', { d, s }) : r.win ? tl('sh.aiWin', { d, s }) : tl('sh.aiLose', { d, s });
    }
    return `🏒 ${line} ${tl('sh.tail')} #AquaHockey`;
  }

  function fullText() {
    return share.url ? `${shareText()} ${share.url}` : shareText();
  }

  function prepareShare(result) {
    share.result = result;
    share.url = shareLink();
    if (!$('shareX')) { // CrazyGames sürümü: sosyal paylaşım düğmeleri yok (yalnızca skor kartı)
      share.url = '';
    } else {
      const t = encodeURIComponent(shareText());
      const u = encodeURIComponent(share.url);
      const all = encodeURIComponent(fullText());
      $('shareX').href = `https://twitter.com/intent/tweet?text=${t}${share.url ? `&url=${u}` : ''}`;
      $('shareWa').href = `https://wa.me/?text=${all}`;
      $('shareTg').href = share.url
        ? `https://t.me/share/url?url=${u}&text=${t}`
        : `https://t.me/share/url?url=${all}`;
      // Facebook yalnızca bir bağlantı paylaşabilir
      $('shareFb').classList.toggle('hidden', !share.url);
      if (share.url) $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
    }
    // Gömülü görünümde tarayıcı paylaşım menüsü engellidir; orada düğmeyi gösterme.
    const canNative = !!navigator.share && !isFramed() && BUILD !== 'crazygames';
    if ($('shareNative')) $('shareNative').classList.toggle('hidden', !canNative);

    share.blob = null;
    updateSaveUI();
    const img = $('cardImg'), thumb = $('cardThumb');
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => {
      const c = drawCard(result);
      c.toBlob((blob) => {
        if (!blob) return;
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        share.blob = blob;
        const url = URL.createObjectURL(blob);
        img.src = url;
        thumb.src = url;
        const canFile = canNative && !!(navigator.canShare && navigator.canShare({ files: [cardFile()] }));
        if ($('cardShare')) $('cardShare').classList.toggle('hidden', !canFile);
        updateSaveUI();
      }, 'image/jpeg', 0.9);
    });
  }

  function cardFile() {
    return new File([share.blob || new Blob()], 'aqua-hockey-skor.jpg', { type: 'image/jpeg' });
  }

  function toast(msg, ms = 2600) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // Tıklama anında çağrılmalı (pano izni kullanıcı etkileşimi ister).
  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : tl('sh.copyFail') + text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } else {
      fallback();
    }
  }

  function nativeShare(withImage) {
    const data = { title: 'Aqua Hockey', text: shareText() };
    if (share.url) data.url = share.url;
    if (withImage && share.blob) {
      const file = cardFile();
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Bazı uygulamalar dosyayla birlikte url alanını yok sayar; bağlantıyı metne ekle.
        data.files = [file];
        data.text = fullText();
        delete data.url;
      }
    }
    if (!navigator.share) {
      copyText(fullText(), tl('sh.copied'));
      return;
    }
    navigator.share(data).catch((e) => {
      if (e && e.name === 'AbortError') return;
      copyText(fullText(), tl('sh.menuFail'));
    });
  }

  function saveCard() {
    if (!share.blob) return;
    if (downloadsApi) {
      downloadsApi.save({ filename: 'aqua-hockey-skor.jpg', data: share.blob })
        .then(() => toast(tl('sh.saved')))
        .catch((e) => {
          const code = e && e.code;
          if (code === 'declined') return;
          if (code === 'rate_limited') toast(tl('sh.busy'));
          else toast(tl('sh.saveFail'));
        });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(share.blob);
    a.download = 'aqua-hockey-skor.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(tl('sh.downloaded'));
  }

  $('shareNative').addEventListener('click', () => nativeShare(true));
  $('shareCopy').addEventListener('click', () => copyText(fullText(), tl('sh.copied')));
  $('cardBtn').addEventListener('click', () => showOverlay(cardEl));
  $('cardClose').addEventListener('click', () => showOverlay(overEl));
  $('cardShare').addEventListener('click', () => nativeShare(true));
  $('cardSave').addEventListener('click', saveCard);

  // 1080×1350 skor kartı (Instagram, X ve WhatsApp için uygun oran)
  function drawCard(r) {
    const CW = 1080, CH = 1350;
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const g = c.getContext('2d');
    const spacing = (v) => { if ('letterSpacing' in g) g.letterSpacing = v; };

    // Zemin: derin su
    const sea = g.createLinearGradient(0, 0, 0, CH);
    sea.addColorStop(0, '#06345a');
    sea.addColorStop(0.55, '#031c36');
    sea.addColorStop(1, '#020c1c');
    g.fillStyle = sea;
    g.fillRect(0, 0, CW, CH);
    [[180, 160, `rgba(${COLORS[1].rgb},0.28)`], [900, 1200, `rgba(${COLORS[0].rgb},0.32)`], [540, 60, 'rgba(120,230,255,0.3)']].forEach(([x, y, col]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, 700);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, CW, CH);
    });

    // Perspektif ızgara (çerçevenin içinde)
    g.save();
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.clip();
    g.strokeStyle = 'rgba(90,200,255,0.22)';
    g.lineWidth = 2;
    const hy = 980, vx = CW / 2;
    for (let i = -12; i <= 12; i++) {
      g.beginPath();
      g.moveTo(vx + i * 30, hy);
      g.lineTo(vx + i * 260, CH);
      g.stroke();
    }
    for (let k = 1; k < 9; k++) {
      const y = hy + Math.pow(k / 8, 2) * (CH - hy);
      g.globalAlpha = k / 9;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CW, y);
      g.stroke();
    }
    g.restore();

    // Parlak çerçeve
    const edge = g.createLinearGradient(0, 0, 0, CH);
    edge.addColorStop(0, '#7fe9ff');
    edge.addColorStop(0.5, '#1a8cff');
    edge.addColorStop(1, COLORS[0].main);
    g.shadowColor = 'rgba(40,170,255,0.9)';
    g.shadowBlur = 30;
    g.strokeStyle = edge;
    g.lineWidth = 7;
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.stroke();

    // Kale ağızları
    [[48, COLORS[1]], [CH - 48, COLORS[0]]].forEach(([y, col]) => {
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.shadowBlur = 24;
      g.strokeStyle = col.light;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(CW / 2 - 150, y);
      g.lineTo(CW / 2 + 150, y);
      g.stroke();
    });
    g.shadowBlur = 0;

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Logo: AQUA (su renginde) + HOCKEY
    spacing('0px');
    g.font = `italic 900 150px ${FONT}`;
    const lg = g.createLinearGradient(0, 95, 0, 235);
    lg.addColorStop(0, '#effdff');
    lg.addColorStop(0.4, '#7fe9ff');
    lg.addColorStop(0.7, '#19b8ff');
    lg.addColorStop(1, '#0a5fd6');
    g.shadowColor = 'rgba(40,190,255,0.85)';
    g.shadowBlur = 34;
    g.fillStyle = lg;
    g.fillText('AQUA', CW / 2, 168);
    spacing('24px');
    g.font = `italic 900 44px ${FONT}`;
    g.shadowColor = 'rgba(80,210,255,0.9)';
    g.shadowBlur = 22;
    g.fillStyle = '#d9f8ff';
    g.fillText('HOCKEY', CW / 2 + 12, 272);
    spacing('0px');

    // Sonuç başlığı
    const titleRgb = r.draw ? '155,107,255' : r.pvp ? COLORS[r.w].rgb : r.win ? COLORS[0].rgb : COLORS[1].rgb;
    const title = r.draw ? tl('r.draw') : r.pvp ? tl('r.wins', { name: COLORS[r.w].name }) : r.win ? tl('c.won') : tl('c.lost');
    g.font = `italic 900 ${title.length > 12 ? 92 : 108}px ${FONT}`;
    g.shadowColor = `rgba(${titleRgb},1)`;
    g.shadowBlur = 40;
    g.fillStyle = `rgba(${titleRgb},1)`;
    g.fillText(title, CW / 2, 450);
    g.shadowBlur = 14;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillText(title, CW / 2, 450);

    // Orta çizgi ve pak
    g.shadowBlur = 20;
    g.shadowColor = 'rgba(175,130,255,0.9)';
    g.strokeStyle = 'rgba(215,195,255,0.45)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(48, 700);
    g.lineTo(CW - 48, 700);
    g.stroke();
    g.beginPath();
    g.arc(CW / 2, 700, 84, 0, TAU);
    g.stroke();
    g.shadowColor = `rgba(${PUCK_RGB},1)`;
    g.shadowBlur = 40;
    g.fillStyle = '#141729';
    g.beginPath();
    g.arc(CW / 2, 700, 44, 0, TAU);
    g.fill();
    g.strokeStyle = '#fff1b0';
    g.lineWidth = 8;
    g.stroke();

    // Skor
    g.font = `italic 900 300px ${FONT}`;
    [[r.a, 0, CW / 2 - 250], [r.b, 1, CW / 2 + 250]].forEach(([v, i, x]) => {
      const col = COLORS[i];
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.shadowBlur = 50;
      g.fillStyle = col.main;
      g.fillText(String(v), x, 712);
      g.shadowBlur = 0;
      g.fillStyle = `rgba(255,255,255,0.18)`;
      g.fillText(String(v), x, 712);
    });

    // Oyuncu etiketleri
    const labels = r.pvp ? [COLORS[0].name, COLORS[1].name] : [tl('me'), up(r.rname || 'CPU')];
    spacing('6px');
    g.font = `800 36px ${FONT}`;
    g.shadowBlur = 16;
    labels.forEach((t, i) => {
      g.shadowColor = `rgba(${COLORS[i].rgb},0.9)`;
      g.fillStyle = COLORS[i].light;
      g.fillText(t, CW / 2 + (i ? 250 : -250), 900);
    });

    // Maç bilgisi
    spacing('3px');
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(200,205,240,0.75)';
    const info = tl('c.info', { m: r.pvp ? tl('c.pvp') : tl('c.ai') });
    let fs = 32;
    do { g.font = `700 ${fs}px ${FONT}`; fs -= 1; } while (g.measureText(info).width > CW - 200 && fs > 18);
    g.fillText(info, CW / 2, 1010);

    // Alt bilgi
    spacing('0px');
    const date = new Date().toLocaleDateString(LOCALE(), { day: 'numeric', month: 'long', year: 'numeric' });
    g.font = `600 30px ${FONT}`;
    g.fillStyle = 'rgba(200,205,240,0.6)';
    g.fillText(date, CW / 2, 1150);
    g.font = `italic 900 46px ${FONT}`;
    g.shadowColor = `rgba(${PUCK_RGB},0.9)`;
    g.shadowBlur = 20;
    g.fillStyle = '#fff6c4';
    g.fillText(tl('c.try'), CW / 2, 1222);
    return c;
  }

  function togglePause() {
    if (storeEl.classList.contains('show')) return; // mağaza kendi kapanışını yönetir
    if (game.state === 'paused') {
      resume();
    } else if (inputActive()) {
      game.resumeState = game.state;
      game.state = 'paused';
      keys.clear();
      showOverlay(pauseEl);
    }
  }

  function resume() {
    if (game.state !== 'paused') return;
    game.state = game.resumeState;
    showOverlay(null);
    last = performance.now();
  }

  // ---------------------------------------------------------------------------
  // Ses seviyesi
  // ---------------------------------------------------------------------------
  const volPop = $('volPop'), volRange = $('volRange'), volPct = $('volPct'), muteBtn = $('muteBtn');
  const musRange = $('musRange'), musPct = $('musPct'), musBtn = $('musBtn'), musHead = $('musHead'), musRow = $('musRow');

  function syncVolumeUI() {
    const pct = Math.round(settings.volume * 100);
    const on = settings.sound && pct > 0 && !Sound.platformMute;
    volRange.value = String(pct);
    volRange.style.setProperty('--v', pct + '%');
    volRange.setAttribute('aria-valuetext', on ? tl('pct', { n: pct }) : tl('v.off'));
    volPct.textContent = on ? tl('pct', { n: pct }) : tl('v.off');
    volPop.classList.toggle('off', !on);
    soundBtn.classList.toggle('muted', !on);
    soundBtn.classList.toggle('low', on && pct < 45);
    muteBtn.classList.toggle('muted', !on);
    muteBtn.setAttribute('aria-label', on ? tl('v.mute') : tl('v.unmute'));
    muteBtn.title = `${on ? tl('v.mute') : tl('v.unmute')} (M)`;
    const mp = Math.round(settings.musicVol * 100);
    const mOn = settings.music && mp > 0;
    musRange.value = String(mp);
    musRange.style.setProperty('--v', mp + '%');
    musRange.setAttribute('aria-valuetext', mOn ? tl('pct', { n: mp }) : tl('v.off'));
    musPct.textContent = mOn ? tl('pct', { n: mp }) : tl('v.off');
    musHead.classList.toggle('off', !mOn);
    musRow.classList.toggle('off', !mOn);
    musBtn.classList.toggle('muted', !mOn);
    musBtn.setAttribute('aria-label', mOn ? tl('v.musicOff') : tl('v.musicOn'));
    musBtn.title = `${mOn ? tl('v.musicOff') : tl('v.musicOn')} (N)`;
  }

  function setMusicVolume(v) {
    settings.musicVol = clamp(v, 0, 1);
    // Kaydırıcıyı sıfırdan yukarı çekmek müziği yeniden açar
    if (settings.musicVol > 0 && !settings.music) {
      settings.music = true;
      store.set('music', true);
    }
    store.set('musicVol', settings.musicVol);
    Sound.init();
    Music.applyVolume();
    syncVolumeUI();
  }

  function toggleMusic() {
    settings.music = !settings.music;
    if (settings.music && settings.musicVol <= 0) {
      settings.musicVol = 0.6;
      store.set('musicVol', settings.musicVol);
    }
    store.set('music', settings.music);
    Sound.init();
    Music.applyVolume();
    syncVolumeUI();
  }

  function setVolume(v, preview) {
    settings.volume = clamp(v, 0, 1);
    // Kaydırıcıyı sıfırdan yukarı çekmek sesi yeniden açar
    if (settings.volume > 0 && !settings.sound) {
      settings.sound = true;
      store.set('sound', true);
    }
    store.set('volume', settings.volume);
    Sound.init();
    Sound.applyVolume();
    syncVolumeUI();
    if (preview) Sound.preview();
  }

  function toggleSound() {
    if (Sound.platformMute) {
      toast(tl('v.platformMuted'));
      return;
    }
    settings.sound = !settings.sound;
    if (settings.sound && settings.volume <= 0) {
      settings.volume = 0.5;
      store.set('volume', settings.volume);
    }
    store.set('sound', settings.sound);
    if (settings.sound) Sound.init();
    Sound.applyVolume();
    syncVolumeUI();
  }

  function openVolume() {
    volPop.classList.remove('hidden');
    soundBtn.setAttribute('aria-expanded', 'true');
    syncVolumeUI();
  }

  function closeVolume() {
    volPop.classList.add('hidden');
    soundBtn.setAttribute('aria-expanded', 'false');
  }

  volRange.addEventListener('input', () => setVolume(Number(volRange.value) / 100, true));
  musRange.addEventListener('input', () => setMusicVolume(Number(musRange.value) / 100));
  musBtn.addEventListener('click', toggleMusic);
  muteBtn.addEventListener('click', () => {
    toggleSound();
    if (settings.sound) Sound.preview();
  });
  // Panel dışına dokununca kapat (oyun girdisini engellemeden)
  document.addEventListener('pointerdown', (e) => {
    if (volPop.classList.contains('hidden')) return;
    if (e.target.closest && (e.target.closest('#volPop') || e.target.closest('#soundBtn'))) return;
    closeVolume();
  }, true);

  // ---------------------------------------------------------------------------
  // Skill düğmeleri
  // ---------------------------------------------------------------------------
  const skillBars = [$('skillBar0'), $('skillBar1')];
  const skillUI = { dirty: true };

  skillBars.forEach((bar, p) => {
    bar.querySelectorAll('.skill-btn').forEach((btn) => {
      const key = btn.dataset.skill;
      // Basar basmaz çalışsın (raketi süren diğer parmakla aynı anda da)
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        lastInputTouch = e.pointerType !== 'mouse';
        Sound.init();
        useSkill(p, key);
      });
      // Klavyeyle odaklanıp Enter/Boşluk
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) useSkill(p, key);
      });
    });
  });

  function showSkillBars(on) {
    const pvp = settings.mode === 'pvp';
    skillBars[0].classList.toggle('hidden', !on);
    skillBars[1].classList.toggle('hidden', !on || !pvp);
    document.body.classList.toggle('skills', on);
    document.body.classList.toggle('pvp', on && pvp);
    skillUI.dirty = true;
    resize();
  }

  // DOM yalnızca görünen bir şey değiştiğinde güncellenir
  function updateSkillUI() {
    const playing = game.state === 'play' || game.state === 'countdown';
    for (let p = 0; p < 2; p++) {
      const bar = skillBars[p];
      if (bar.classList.contains('hidden')) continue;
      for (const btn of bar.children) {
        const key = btn.dataset.skill, sk = SKILLS[key];
        const free = skills[p][key], owned = mallets[p].ai ? 0 : inventory[key];
        const left = goals[skillGoal(p, key)][key];
        let state, sub, badge, fill;
        if (left > 0) {
          state = 'active';
          sub = tl('sk.active', { n: Math.ceil(left) });
          fill = left / sk.dur;
        } else if (free > 0 || owned > 0) {
          state = playing ? 'ready' : 'wait';
          sub = free > 0 ? tl(key === 'grow' ? 'sk.growSub' : 'sk.shrinkSub') : tl('sk.owned', { n: owned });
          fill = 1;
        } else {
          state = 'buy';
          sub = tl('sk.buy');
          fill = 0;
        }
        badge = free > 0 ? tl('sk.free') : owned > 0 ? `×${owned}` : '+';
        const f = Math.round(fill * 40) / 40;
        const sig = `${state}|${sub}|${badge}|${f}`;
        if (btn._sig === sig && !skillUI.dirty) continue;
        btn._sig = sig;
        for (const c of ['ready', 'active', 'buy', 'wait']) btn.classList.toggle(c, c === state);
        btn.style.setProperty('--fill', String(f));
        btn.querySelector('small').textContent = sub;
        const b = btn.querySelector('.skill-count');
        b.textContent = badge;
        b.classList.toggle('free', free > 0);
      }
    }
    skillUI.dirty = false;
  }

  // ---------------------------------------------------------------------------
  // Mağaza: altınla alınan her şey burada. Temalar sekmesi (tema kilitleri) ve Yetenekler
  // sekmesi (Dev Kale / Kale Kilidi ek hakları). Gerçek para ile satış yoktur.
  // ---------------------------------------------------------------------------
  const PRODUCTS = [
    { id: 'grow_3', get name() { return tl('sk.growL'); }, get desc() { return tl('s.uses3'); }, give: { grow: 3 }, price: 60 },
    { id: 'shrink_3', get name() { return tl('sk.shrinkL'); }, get desc() { return tl('s.uses3'); }, give: { shrink: 3 }, price: 60 },
    { id: 'bundle_5', get name() { return tl('s.bundle'); }, get desc() { return tl('s.bundleD'); }, give: { grow: 5, shrink: 5 }, price: 170, get tag() { return tl('s.best'); } },
  ];

  const SKILL_ICONS = {
    grow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6v12M15 6v12M2 12h4M4 10l-2 2 2 2M22 12h-4M20 10l2 2-2 2"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12h6"/></svg>',
  };

  const storeEl = $('storeMenu'), storeList = $('storeList'), themeList = $('themeList'), storeConfirm = $('storeConfirm');
  // pending: { kind: 'skill' | 'theme', ... }
  const storeState = { fromGame: false, focus: null, back: null, pending: null, tab: 'themes', preview: null };

  function renderInventory() {
    $('invGrow').textContent = inventory.grow;
    $('invShrink').textContent = inventory.shrink;
    const sum = $('menuInv');
    if (sum) sum.textContent = tl('m.inv', { g: inventory.grow, s: inventory.shrink });
  }

  function priceChip(price) {
    const c = document.createElement('span');
    c.className = 'product-price coin-price' + (wallet.coins >= price ? '' : ' short');
    c.innerHTML = '<i class="coin" aria-hidden="true"></i><span></span>';
    c.querySelector('span').textContent = fmt(price);
    return c;
  }

  function productButton(kind, name, desc, iconHtml, right) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'product';
    b.dataset.kind = kind;
    b.innerHTML = `
      <span class="product-ico" aria-hidden="true">${iconHtml}</span>
      <span class="product-text"><b></b><small></small></span>`;
    b.querySelector('b').textContent = name;
    b.querySelector('small').textContent = desc;
    b.appendChild(right);
    return b;
  }

  function renderProducts() {
    storeList.textContent = '';
    for (const pr of PRODUCTS) {
      const keys = Object.keys(pr.give);
      const b = productButton(keys.length > 1 ? 'bundle' : keys[0], pr.name, pr.desc, keys.map((k) => SKILL_ICONS[k]).join(''), priceChip(pr.price));
      if (storeState.focus && pr.give[storeState.focus] && keys.length === 1) b.classList.add('suggest');
      if (pr.tag) {
        const t = document.createElement('em');
        t.className = 'product-tag';
        t.textContent = pr.tag;
        b.appendChild(t);
      }
      b.setAttribute('aria-label', tl('s.ariaItem', { name: pr.name, desc: pr.desc, p: pr.price }));
      b.addEventListener('click', () => askPurchase({ kind: 'skill', pr, name: `${pr.name} · ${pr.desc}`, price: pr.price }));
      storeList.appendChild(b);
    }
  }

  function renderThemes() {
    themeList.textContent = '';
    for (const t of Object.keys(THEME_INFO)) {
      const info = THEME_INFO[t], open = isUnlocked(t), sel = settings.theme === t && open;
      let right;
      if (!open) {
        right = priceChip(info.price);
      } else {
        right = document.createElement('span');
        right.className = 'product-price state' + (sel ? ' selected' : '');
        right.textContent = sel ? tl('s.selected') : storeState.fromGame ? tl('s.owned') : tl('s.select');
      }
      const b = productButton('theme', info.name, info.desc || '', `<i class="swatch sw-${t}"></i>`, right);
      b.dataset.theme = t;
      if (!open) b.classList.add('locked');
      if (info.price === 0) {
        const tg = document.createElement('em');
        tg.className = 'product-tag free';
        tg.textContent = tl('s.free');
        b.appendChild(tg);
      }
      b.setAttribute('aria-label', tl(open ? (sel ? 's.ariaSel' : 's.ariaOwn') : 's.ariaPrice', { name: info.name, p: info.price }));
      b.addEventListener('click', () => {
        if (!open) askPurchase({ kind: 'theme', theme: t, name: info.name, price: info.price });
        else if (!storeState.fromGame && !sel) selectTheme(t);
      });
      themeList.appendChild(b);
    }
  }

  function selectTheme(th) {
    settings.theme = th;
    store.set('theme', th);
    applyTheme();
    const li = LEAGUES.indexOf(th);
    if (settings.mode === 'ai' && li >= 0 && leagueOpen(li)) {
      career.li = li;
      career.mi = Math.min(career.won[th], 4);
      saveCareer();
    }
    syncMenu();
    renderThemes();
    toast(tl('s.chosen', { name: THEME_INFO[th].name }));
  }

  // Raket görünümleri: önizleme, gerçek raket çiziminin küçültülmüş kopyasıdır
  const skinPreview = {};
  function renderSkins() {
    const list = $('skinList');
    list.textContent = '';
    for (const k of Object.keys(SKINS)) {
      const sk = SKINS[k], own = hasSkin(k), sel = settings.skin === k;
      let right;
      if (!own) right = priceChip(sk.price);
      else {
        right = document.createElement('span');
        right.className = 'product-price state' + (sel ? ' selected' : '');
        right.textContent = sel ? tl('s.selected') : tl('s.select');
      }
      const name = tl('skin.' + k);
      const b = productButton('skin', name, tl('s.skinD'), '', right);
      if (!skinPreview[k]) {
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        c.getContext('2d').drawImage(buildMallet(sk, 'ice'), 0, 0, 96, 96);
        skinPreview[k] = c;
      }
      const img = document.createElement('img');
      img.className = 'skin-prev';
      img.alt = '';
      img.src = skinPreview[k].toDataURL();
      b.querySelector('.product-ico').appendChild(img);
      if (!own) b.classList.add('locked');
      b.setAttribute('aria-label', tl(own ? (sel ? 's.ariaSel' : 's.ariaOwn') : 's.ariaPrice', { name, p: sk.price }));
      b.addEventListener('click', () => {
        if (!own) askPurchase({ kind: 'skin', skin: k, name, price: sk.price });
        else if (!sel) selectSkin(k);
      });
      list.appendChild(b);
    }
  }

  const puckPreview = {};
  function renderPucks() {
    const list = $('puckList');
    list.textContent = '';
    for (const k of Object.keys(PUCKS)) {
      const pk = PUCKS[k], own = hasPuck(k), sel = settings.puck === k;
      let right;
      if (!own) right = priceChip(pk.price);
      else {
        right = document.createElement('span');
        right.className = 'product-price state' + (sel ? ' selected' : '');
        right.textContent = sel ? tl('s.selected') : tl('s.select');
      }
      const name = tl('pk.' + k);
      const b = productButton('skin', name, k === 'theme' ? tl('s.puckThemeD') : tl('s.puckD'), '', right);
      // Tema pakının önizlemesi seçili stadyuma göre değişir; diğerleri bir kez çizilir
      const key = k === 'theme' ? 'theme:' + settings.theme : k;
      if (!puckPreview[key]) {
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        // Pak hale payıyla birlikte çizilir; önizlemede yalnızca pakın kendisi (biraz payla) gösterilir
        const src = k === 'theme' ? buildPuck(settings.theme) : buildSkinPuck(k, 'ice');
        const f = (PUCK_R + 5) / PS, sw = src.width * f * 2, sx = src.width / 2 - sw / 2;
        c.getContext('2d').drawImage(src, sx, sx, sw, sw, 0, 0, 96, 96);
        puckPreview[key] = c.toDataURL();
      }
      const img = document.createElement('img');
      img.className = 'skin-prev';
      img.alt = '';
      img.src = puckPreview[key];
      b.querySelector('.product-ico').appendChild(img);
      if (!own) b.classList.add('locked');
      b.setAttribute('aria-label', tl(own ? (sel ? 's.ariaSel' : 's.ariaOwn') : 's.ariaPrice', { name, p: pk.price }));
      b.addEventListener('click', () => {
        if (!own) askPurchase({ kind: 'puck', puck: k, name, price: pk.price });
        else if (!sel) selectPuck(k);
      });
      list.appendChild(b);
    }
  }

  function selectPuck(k) {
    settings.puck = k;
    store.set('puck', k);
    buildSprites();
    renderPucks();
    toast(tl('s.chosen', { name: tl('pk.' + k) }));
  }

  function selectSkin(k) {
    settings.skin = k;
    store.set('skin', k);
    buildSprites();
    renderSkins();
    toast(tl('s.chosen', { name: tl('skin.' + k) }));
  }

  function setTab(tab) {
    storeState.tab = tab;
    $('tabThemes').classList.toggle('hidden', tab !== 'themes');
    $('tabMallets').classList.toggle('hidden', tab !== 'mallets');
    $('tabSkills').classList.toggle('hidden', tab !== 'skills');
    for (const id of ['tabBtnThemes', 'tabBtnMallets', 'tabBtnSkills']) {
      const b = $(id), on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function showStoreBody(confirm) {
    storeConfirm.classList.toggle('hidden', !confirm);
    document.querySelector('.store-tabs').classList.toggle('hidden', confirm);
    $('tabThemes').classList.toggle('hidden', confirm || storeState.tab !== 'themes');
    $('tabSkills').classList.toggle('hidden', confirm || storeState.tab !== 'skills');
  }

  // tab: 'themes' | 'skills'; theme: doğrudan satın alma adımı açılacak tema
  function openStore({ focus = null, fromGame = false, tab = null, theme = null } = {}) {
    storeState.focus = focus;
    storeState.fromGame = fromGame;
    storeState.pending = null;
    if (fromGame) {
      // Maç duraklatılır, mağaza kapanınca kaldığı yerden sürer
      game.resumeState = game.state;
      game.state = 'paused';
      keys.clear();
      storeState.back = null;
    } else {
      storeState.back = [menuEl, overEl, pauseEl].find((o) => o.classList.contains('show')) || menuEl;
    }
    storeState.msgFocus = focus;
    renderStoreMsg();
    setTab(tab || (focus ? 'skills' : 'themes'));
    renderProducts();
    renderThemes();
    renderSkins();
    renderPucks();
    renderInventory();
    showStoreBody(false);
    showOverlay(storeEl);
    if (theme && !isUnlocked(theme)) {
      const info = THEME_INFO[theme];
      askPurchase({ kind: 'theme', theme, name: info.name, price: info.price });
    }
  }

  function renderStoreMsg() {
    const focus = storeState.msgFocus;
    $('storeMsg').textContent = focus ? tl('s.msgFocus', { s: SKILLS[focus].label }) : tl('s.msg');
  }

  function closeStore() {
    if (storeState.fromGame) {
      storeState.fromGame = false;
      resume();
    } else {
      showOverlay(storeState.back || menuEl);
    }
  }

  function askPurchase(item) {
    storeState.pending = item;
    $('confirmName').textContent = item.name;
    $('confirmPrice').textContent = fmt(item.price);
    renderConfirm();
    showStoreBody(true);
    $('confirmBuy').focus();
  }

  function renderConfirm() {
    const it = storeState.pending;
    if (!it) return;
    const need = it.price - wallet.coins, left = adsLeft();
    $('coinConfirm').textContent = fmt(wallet.coins);
    $('confirmNeed').textContent = need > 0 ? tl('s.need', { n: fmt(need) }) : '';
    const buy = $('confirmBuy');
    buy.disabled = need > 0;
    buy.textContent = need > 0 ? tl('s.short') : tl('s.buy');
    // Yetmiyorsa reklamla altın kazanma kısayolu
    const ad = $('confirmAd');
    ad.classList.toggle('hidden', need <= 0);
    ad.disabled = left <= 0;
    ad.querySelector('span').textContent = left > 0 ? tl('ad.watch') : tl('ad.limit');
    ad.querySelector('b').textContent = left > 0 ? `+${COIN.adReward}` : '';
    // Önizleme yalnızca menüden açılan mağazada (arkada tanıtım maçı oynarken)
    $('confirmPreview').classList.toggle('hidden', it.kind !== 'theme' || storeState.fromGame || storeState.back !== menuEl);
  }

  function cancelPurchase() {
    storeState.pending = null;
    showStoreBody(false);
  }

  function confirmPurchase() {
    const it = storeState.pending;
    if (!it || wallet.coins < it.price) return;
    wallet.coins -= it.price;
    if (it.kind === 'skill') {
      for (const k of Object.keys(it.pr.give)) inventory[k] += it.pr.give[k];
      saveInventory();
      renderInventory();
      skillUI.dirty = true;
      const got = Object.keys(it.pr.give).map((k) => `${SKILLS[k].label} +${it.pr.give[k]}`).join(', ');
      toast(tl('s.bought', { x: got }));
    } else if (it.kind === 'puck') {
      if (!wallet.pucks.includes(it.puck)) wallet.pucks.push(it.puck);
      settings.puck = it.puck; // yeni görünüm hemen takılır
      store.set('puck', it.puck);
      buildSprites();
      toast(tl('s.unlockedSel', { name: it.name }));
    } else if (it.kind === 'skin') {
      if (!wallet.skins.includes(it.skin)) wallet.skins.push(it.skin);
      settings.skin = it.skin; // yeni görünüm hemen takılır
      store.set('skin', it.skin);
      buildSprites();
      toast(tl('s.unlockedSel', { name: it.name }));
    } else {
      if (!wallet.unlocked.includes(it.theme)) wallet.unlocked.push(it.theme);
      if (!storeState.fromGame) {
        // Yeni açılan tema hemen seçilir (önizlemede zaten uygulanmış olabilir)
        settings.theme = it.theme;
        store.set('theme', it.theme);
        if (!it.previewed) applyTheme(); // önizlemede zaten uygulandı
        const li = LEAGUES.indexOf(it.theme);
        if (settings.mode === 'ai' && li >= 0) { // satın alınan stadyumun ligi açılır ve seçilir
          career.li = li;
          career.mi = Math.min(career.won[it.theme], 4);
          saveCareer();
        }
        syncMenu();
        toast(tl('s.unlockedSel', { name: it.name }));
      } else {
        toast(tl('s.unlocked', { name: it.name }));
      }
    }
    saveWallet();
    updateCoins(true);
    Sound.ready();
    checkAchievements(); // Koleksiyoncu
    storeState.pending = null;
    if (storeState.fromGame && it.kind === 'skill') {
      closeStore();
      return;
    }
    renderProducts();
    renderThemes();
    renderSkins();
    renderPucks();
    showStoreBody(false);
  }

  // Tema önizleme: mağaza gizlenir, tema arkadaki tanıtım maçında oynar
  function previewTheme() {
    const it = storeState.pending;
    if (!it || it.kind !== 'theme') return;
    storeState.preview = { prev: settings.theme };
    settings.theme = it.theme; // yalnızca önizleme: kaydedilmez
    applyTheme();
    renderPreview();
    showOverlay(unlockEl);
  }

  function renderPreview() {
    const it = storeState.pending;
    if (!it || it.kind !== 'theme') return;
    const need = it.price - wallet.coins;
    $('unlockName').textContent = it.name;
    $('unlockDesc').textContent = THEME_INFO[it.theme].desc || '';
    $('unlockPrice').textContent = fmt(it.price);
    $('coinUnlock').textContent = fmt(wallet.coins);
    $('unlockNeed').textContent = need > 0 ? tl('s.need', { n: fmt(need) }) : '';
    $('unlockBuy').disabled = need > 0;
    $('unlockBuy').textContent = need > 0 ? tl('s.short') : tl('s.buy');
  }

  function endPreview(bought) {
    const pv = storeState.preview;
    storeState.preview = null;
    if (!bought && pv && pv.prev !== settings.theme) {
      settings.theme = pv.prev;
      applyTheme();
    }
    showOverlay(storeEl);
  }

  $('unlockBuy').addEventListener('click', () => {
    const it = storeState.pending;
    if (!it || wallet.coins < it.price) return;
    it.previewed = true;
    storeState.preview = null;
    showOverlay(storeEl);
    confirmPurchase();
  });
  $('unlockCancel').addEventListener('click', () => endPreview(false));
  $('confirmBuy').addEventListener('click', confirmPurchase);
  $('confirmCancel').addEventListener('click', cancelPurchase);
  $('confirmPreview').addEventListener('click', previewTheme);
  $('tabBtnThemes').addEventListener('click', () => setTab('themes'));
  $('tabBtnSkills').addEventListener('click', () => setTab('skills'));
  $('tabBtnMallets').addEventListener('click', () => setTab('mallets'));
  $('storeClose').addEventListener('click', closeStore);
  $('menuStoreBtn').addEventListener('click', () => openStore());
  $('menuAchBtn').addEventListener('click', openAchievements);
  // Menü açıkken kalan süre (ve gece yarısı yenilenen görevler) güncel kalsın
  setInterval(() => { if (menuEl.classList.contains('show')) renderMissions(); }, 30000);
  $('achClose').addEventListener('click', () => showOverlay(achBack || menuEl));
  $('overStoreBtn').addEventListener('click', () => openStore());

  function skillKey(code) {
    const pvp = settings.mode === 'pvp';
    switch (code) {
      case 'Digit1': case 'Numpad1': case 'KeyK': return [0, 'grow'];
      case 'Digit2': case 'Numpad2': case 'KeyL': return [0, 'shrink'];
      case 'KeyQ': return [pvp ? 1 : 0, 'grow'];
      case 'KeyE': return [pvp ? 1 : 0, 'shrink'];
      default: return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Altın: maç ödülü, ödüllü reklam ve tema kilitleri
  // ---------------------------------------------------------------------------
  const WELCOME_GIFT = 100; // ilk maçın sonunda bir kez
  const DAILY = [30, 40, 50, 60, 80, 100, 150]; // art arda 1.–7. gün (sonrası 7. gün)
  const fmt = (n) => n.toLocaleString(LOCALE());
  const lastReward = { total: 0, doubled: true };

  // Maç ödülü: sonuç (galibiyet 35, beraberlik 20, yenilgi 10) × seviye çarpanı (levelMult)
  // + attığın her gol için 2 (en fazla 10 gol). İki oyunculu modda sabit 15 + gol başına 1.
  function matchReward(r) {
    if (r.pvp) {
      const g = Math.min(10, r.a + r.b);
      return { total: 15 + g, why: `${tl('r.match')} 15 · ${tl('r.goals', { n: g, b: g })}` };
    }
    const base = r.win ? 35 : r.draw ? 20 : 10;
    const mult = levelMult(r.level);
    const goals = Math.min(10, r.a) * 2;
    const label = tl(r.win ? 'r.win2' : r.draw ? 'r.draw2' : 'r.match');
    const parts = [`${label} ${base}`];
    if (mult !== 1) parts.push(`${r.rname || 'CPU'} ×${mult.toLocaleString(LOCALE())}`);
    if (goals) parts.push(tl('r.goals', { n: r.a, b: goals }));
    return { total: Math.round(base * mult) + goals, why: parts.join(' · ') };
  }

  function grantMatchReward(r) {
    const rw = matchReward(r);
    lastReward.total = rw.total; // reklamla ikiye katlanan kısım (hediye hariç)
    lastReward.doubled = false;
    let shown = rw.total, why = rw.why;
    if (r.champ !== null && r.champ !== undefined) { // lig şampiyonluğu ödülü (ikiye katlanmaz)
      const bonus = 80 + r.champ * 30;
      shown += bonus;
      why += ` · ${tl('c.title')} ${bonus}`;
    }
    if (!wallet.welcomed && !isShowcase) { // ilk maç: hoş geldin hediyesi
      wallet.welcomed = true;
      shown += WELCOME_GIFT;
      why += ` · ${tl('r.gift')} ${WELCOME_GIFT}`;
    }
    addCoins(shown, false);
    $('rewardWhy').textContent = why;
    $('rewardAmt').textContent = '+0';
    renderReward();
    // Sonuç ekranı açılınca sayaç yükselerek dolsun
    setTimeout(() => countUp($('rewardAmt'), 0, shown, '+'), 1450);
  }

  // Maç sonunda bir sonraki hedef: en ucuz kilitli tema (alınabiliyorsa mağazaya kısayol)
  function cheapestLocked() {
    let best = null;
    for (const t of Object.keys(THEME_INFO)) {
      if (!isUnlocked(t) && (!best || THEME_INFO[t].price < THEME_INFO[best].price)) best = t;
    }
    return best;
  }

  function renderNextUnlock() {
    const el = $('nextUnlock'), t = cheapestLocked();
    el.classList.toggle('hidden', !t);
    if (!t) return;
    const info = THEME_INFO[t], left = info.price - wallet.coins;
    el.dataset.theme = t;
    el.classList.toggle('ready', left <= 0);
    $('nextUnlockText').textContent = left <= 0 ? tl('r.canUnlock', { t: info.name }) : tl('r.toUnlock', { t: info.name, n: fmt(left) });
    $('nextUnlockBar').style.width = Math.round(clamp(wallet.coins / info.price, 0, 1) * 100) + '%';
  }

  // Günlük ödül: her gün ilk açılışta kendiliğinden verilir; art arda gelinen günlerde artar.
  function dayKey(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  const dailyAmount = (streak) => DAILY[Math.min(streak, DAILY.length) - 1];

  function checkDaily() {
    if (isShowcase) return;
    const d = today();
    if (wallet.dailyDay === d) return;
    const first = !store.get('played', false);
    wallet.streak = wallet.dailyDay === dayKey(-1) ? wallet.streak + 1 : 1;
    wallet.dailyDay = d;
    if (first) { // ilk gün hoş geldin hediyesi verilir; günlük ödül ertesi gün başlar
      saveWallet();
      return;
    }
    const n = dailyAmount(wallet.streak);
    addCoins(n);
    toast(tl('d.toast', { d: wallet.streak, n }), 4200);
    checkAchievements();
  }

  // ---------------------------------------------------------------------------
  // Başarımlar: istatistikler (bulutta / cihazda saklanır) belirli eşiğe ulaşınca açılır, altın
  // ödülü hemen bakiyeye eklenir ve ekranın üstünde kısa bir bildirim çıkar.
  // ---------------------------------------------------------------------------
  const stats = (() => {
    const v = store.get('stats', null) || {};
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    return {
      matches: n(v.matches), wins: n(v.wins), goals: n(v.goals), skills: n(v.skills), pvp: n(v.pvp),
      clean: n(v.clean), five: n(v.five), comeback: n(v.comeback), buzzer: n(v.buzzer), frenzy: n(v.frenzy), rocket: n(v.rocket),
      themes: Array.isArray(v.themes) ? v.themes.filter((t) => THEME_INFO[t]) : [],
    };
  })();
  const achDone = (() => {
    const v = store.get('ach', null);
    return v && typeof v === 'object' ? v : {};
  })();

  // [kimlik, simge, ödül, ilerleme → [şimdiki, hedef]]
  const ACH = [
    ['goal1', '🥅', 20, () => [stats.goals, 1]],
    ['win1', '🏆', 30, () => [stats.wins, 1]],
    ['lvl5', '🏆', 50, () => [leaguesWon(), 1]],
    ['lvl10', '🧗', 120, () => [leaguesWon(), 4]],
    ['lvl13', '👑', 300, () => [leaguesWon(), 8]],
    ['goals25', '🎯', 40, () => [stats.goals, 25]],
    ['goals100', '💯', 120, () => [stats.goals, 100]],
    ['m10', '⏱️', 40, () => [stats.matches, 10]],
    ['m50', '🔥', 150, () => [stats.matches, 50]],
    ['clean', '🧤', 60, () => [stats.clean, 1]],
    ['five', '🌧️', 60, () => [stats.five, 1]],
    ['comeback', '🔄', 80, () => [stats.comeback, 1]],
    ['buzzer', '⏰', 50, () => [stats.buzzer, 1]],
    ['frenzy', '🎱', 50, () => [stats.frenzy, 1]],
    ['rocket', '🚀', 40, () => [stats.rocket, 1]],
    ['skills', '✨', 30, () => [stats.skills, 10]],
    ['style', '🖌️', 30, () => [wallet.skins.length + wallet.pucks.length, 1]],
    ['pvp', '🤝', 30, () => [stats.pvp, 1]],
    ['tour', '🏟️', 50, () => [stats.themes.length, 3]],
    ['all', '🎨', 250, () => [Object.keys(THEME_INFO).filter((t) => isUnlocked(t)).length, Object.keys(THEME_INFO).length]],
    ['s3', '📅', 50, () => [wallet.streak, 3]],
    ['s7', '🗓️', 150, () => [wallet.streak, 7]],
  ].map(([id, icon, reward, prog]) => ({ id, icon, reward, prog }));

  function saveStats() {
    store.set('stats', stats);
  }

  // Yeni tamamlananları açar, ödülü verir, bildirimi sıraya koyar
  function checkAchievements() {
    if (isShowcase) return;
    let gained = 0;
    for (const a of ACH) {
      if (achDone[a.id]) continue;
      const [cur, goal] = a.prog();
      if (cur < goal) continue;
      achDone[a.id] = today();
      gained += a.reward;
      achQueue.push(a);
    }
    if (!gained) return;
    store.set('ach', achDone);
    addCoins(gained);
    renderAchBtn();
    flushAchPops();
  }

  // Oyun akarken bildirim rakip kalenin önünü kapatmasın: ilk duraklamada (gol, geri sayım,
  // maç sonu, menü) gösterilir. Her karede çağrılır.
  function flushAchPops() {
    if (achQueue.length && !achShowing && game.state !== 'play') nextAchPop();
  }

  const achQueue = [];
  let achShowing = false;
  function nextAchPop() {
    const a = achQueue.shift();
    const el = $('achPop');
    if (!a) {
      achShowing = false;
      return;
    }
    achShowing = true;
    $('achPopIcon').textContent = a.icon;
    $('achPopLabel').textContent = a.label || tl('a.unlocked');
    $('achPopName').textContent = a.name || tl('a.' + a.id);
    $('achPopReward').textContent = '+' + fmt(a.reward);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    Sound.ready();
    // Sırada başkası varsa daha kısa göster (bir maçta birkaç başarım / görev birden açılabilir)
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(nextAchPop, 300);
    }, achQueue.length ? 1700 : 2600);
  }

  function renderAchBtn() {
    const n = ACH.filter((a) => achDone[a.id]).length;
    $('achCount').textContent = `${n}/${ACH.length}`;
  }

  function renderAchList() {
    const n = ACH.filter((a) => achDone[a.id]).length;
    $('achSub').textContent = tl('a.count', { n, t: ACH.length });
    const list = $('achList');
    list.textContent = '';
    // Tamamlanmamışlar (en yakın olan önce), sonra tamamlananlar
    const items = ACH.map((a) => {
      const [cur, goal] = a.prog();
      return { a, cur: Math.min(cur, goal), goal, done: !!achDone[a.id] };
    }).sort((x, y) => (x.done - y.done) || (y.cur / y.goal - x.cur / x.goal));
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'ach' + (it.done ? ' done' : '');
      const ico = document.createElement('span');
      ico.className = 'ach-ico';
      ico.textContent = it.a.icon;
      const txt = document.createElement('span');
      txt.className = 'ach-text';
      const b = document.createElement('b');
      b.textContent = tl('a.' + it.a.id);
      const sm = document.createElement('small');
      sm.textContent = tl('a.' + it.a.id + '.d');
      txt.append(b, sm);
      if (!it.done && it.goal > 1) {
        const bar = document.createElement('i');
        bar.className = 'ach-bar';
        const fill = document.createElement('i');
        fill.style.width = Math.round((it.cur / it.goal) * 100) + '%';
        bar.append(fill);
        const cnt = document.createElement('em');
        cnt.textContent = `${fmt(it.cur)} / ${fmt(it.goal)}`;
        txt.append(bar, cnt);
      }
      const rw = document.createElement('span');
      rw.className = 'ach-reward';
      if (it.done) rw.textContent = '✓';
      else {
        const c = document.createElement('i');
        c.className = 'coin';
        rw.append(c, document.createTextNode(' ' + fmt(it.a.reward)));
      }
      row.append(ico, txt, rw);
      list.append(row);
    }
  }

  function openAchievements() {
    renderAchList();
    achBack = [menuEl, overEl, pauseEl].find((o) => o.classList.contains('show')) || menuEl;
    showOverlay(achEl);
  }
  let achBack = null;

  // Maç içi takip (yalnızca yapay zekâya karşı; iki oyunculuda yalnızca maç sayılır)
  function achMatchStart() {
    game.m = { g: 0, c: 0, def: 0, fg: 0 };
  }

  function achGoal(scorer) {
    const m = game.m;
    if (!m || settings.mode === 'pvp') return;
    if (scorer === 0) {
      m.g++;
      stats.goals++;
      missionAdd('goals');
      if (game.clock <= 15) missionAdd('late');
      if (game.frenzy) m.fg++;
      if (game.clock <= 3) stats.buzzer = 1;
      if (m.fg >= 2) stats.frenzy = 1;
    } else {
      m.c++;
      m.def = Math.max(m.def, m.c - m.g);
    }
    saveStats();
    checkAchievements();
  }

  function achMatchEnd(win) {
    const m = game.m || { g: 0, c: 0, def: 0 };
    stats.matches++;
    missionAdd('matches');
    if (settings.mode === 'pvp') stats.pvp++;
    else {
      if (win) {
        stats.wins++;
        missionAdd('wins');
        missionAdd('themeWin', settings.theme);
        if (m.c === 0) missionAdd('clean');
      }
      if (win && m.c === 0) stats.clean = 1;
      if (m.g >= 5) stats.five = 1;
      if (win && m.def >= 2) stats.comeback = 1;
    }
    if (!stats.themes.includes(settings.theme)) stats.themes.push(settings.theme);
    saveStats();
    checkAchievements();
  }

  function achSkill() {
    stats.skills++;
    missionAdd('skills');
    saveStats();
    checkAchievements();
  }

  // Oyuncunun vuruşundan sonra pak neredeyse en yüksek hızdaysa
  function achShot(m) {
    if (stats.rocket || m.ai || game.state !== 'play') return;
    for (const p of pucks) {
      if (p.active && Math.hypot(p.x - m.x, p.y - m.y) < MIN_D + 8 && Math.hypot(p.vx, p.vy) > MAX_PUCK * 0.85) {
        stats.rocket = 1;
        saveStats();
        checkAchievements();
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Günlük görevler: her gün tarihten türetilen 3 görev (herkeste aynı), her biri altın verir;
  // üçü de bitince bonus. İlerleme maç içinde işler, gece yarısı yenilenir.
  // ---------------------------------------------------------------------------
  // tür, hedefler, ödüller (aynı sırayla)
  const MISSION_TYPES = {
    goals: [[3, 5, 8], [30, 40, 60]],
    wins: [[1, 2, 3], [30, 50, 70]],
    matches: [[2, 3, 4], [25, 35, 45]],
    skills: [[2, 3, 4], [25, 35, 45]],
    themeWin: [[1], [50]],
    clean: [[1], [60]],
    late: [[1], [40]],
  };
  const MISSION_BONUS = 50;
  let missions = null;

  function genMissions(day) {
    let h = 2166136261;
    for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909), (h >>> 0) / 4294967296));
    const types = Object.keys(MISSION_TYPES);
    for (let i = types.length - 1; i > 0; i--) { // karıştır
      const j = Math.floor(rnd() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const open = Object.keys(THEME_INFO).filter((t) => isUnlocked(t));
    return types.slice(0, 3).map((type) => {
      const [ns, rs] = MISSION_TYPES[type];
      const k = Math.floor(rnd() * ns.length);
      const m = { type, n: ns[k], r: rs[k], prog: 0, done: false };
      if (type === 'themeWin') m.theme = open[Math.floor(rnd() * open.length)] || 'water';
      return m;
    });
  }

  function ensureMissions() {
    const d = today();
    if (missions && missions.day === d) return;
    const v = store.get('missions', null);
    missions = v && v.day === d && Array.isArray(v.list) ? v : { day: d, list: genMissions(d), bonus: false };
    store.set('missions', missions);
  }

  function missionText(m) {
    if (m.type === 'themeWin') return tl('mi.themeWin', { t: THEME_INFO[m.theme] ? THEME_INFO[m.theme].name : '' });
    if (m.type === 'wins' && m.n === 1) return tl('mi.wins1');
    return tl('mi.' + m.type, { n: m.n });
  }

  // Bir görev türüne ilerleme ekler; tamamlananın ödülü hemen verilir
  function missionAdd(type, theme) {
    if (isShowcase) return;
    ensureMissions();
    let gained = 0;
    for (const m of missions.list) {
      if (m.done || m.type !== type || (type === 'themeWin' && m.theme !== theme)) continue;
      m.prog = Math.min(m.n, m.prog + 1);
      if (m.prog >= m.n) {
        m.done = true;
        gained += m.r;
        achQueue.push({ icon: '📋', label: tl('mi.done'), name: missionText(m), reward: m.r });
      }
    }
    if (!gained) {
      store.set('missions', missions);
      return;
    }
    if (!missions.bonus && missions.list.every((m) => m.done)) {
      missions.bonus = true;
      gained += MISSION_BONUS;
      achQueue.push({ icon: '🎉', label: tl('mi.done'), name: tl('mi.allName'), reward: MISSION_BONUS });
    }
    store.set('missions', missions);
    addCoins(gained);
    renderMissions();
    flushAchPops();
  }

  function renderMissions() {
    if (isShowcase) return;
    ensureMissions();
    const list = $('miList');
    list.textContent = '';
    for (const m of missions.list) {
      const row = document.createElement('div');
      row.className = 'mi' + (m.done ? ' done' : '');
      const chk = document.createElement('span');
      chk.className = 'mi-chk';
      chk.textContent = m.done ? '✓' : '';
      const txt = document.createElement('span');
      txt.className = 'mi-text';
      txt.textContent = missionText(m);
      const prog = document.createElement('em');
      prog.className = 'mi-prog';
      prog.textContent = !m.done && m.n > 1 ? `${m.prog}/${m.n}` : '';
      const rw = document.createElement('span');
      rw.className = 'mi-reward';
      const c = document.createElement('i');
      c.className = 'coin';
      rw.append(c, document.createTextNode(' ' + m.r));
      row.append(chk, txt, prog, rw);
      list.append(row);
    }
    const now = new Date(), next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const mins = Math.max(0, Math.ceil((next - now) / 60000));
    $('miTimer').textContent = tl('mi.reset', { h: Math.floor(mins / 60), m: mins % 60 });
    $('miBonus').textContent = missions.bonus ? tl('mi.bonusDone') : tl('mi.bonus', { n: MISSION_BONUS });
    $('miOver').textContent = tl('mi.over', { n: missions.list.filter((m) => m.done).length });
  }

  function renderTomorrow() {
    const el = $('dailyNext');
    el.classList.toggle('hidden', isShowcase);
    // Bugün alındıysa yarın seri bir artar; alınmadıysa (gece yarısı geçtiyse) sıradaki gün
    const next = wallet.dailyDay === today() ? wallet.streak + 1 : 1;
    el.textContent = tl('d.tomorrow', { n: dailyAmount(next) });
  }

  function renderReward() {
    renderNextUnlock();
    renderTomorrow();
    renderMissions();
    const btn = $('doubleBtn');
    const left = adsLeft();
    btn.classList.toggle('hidden', lastReward.doubled || lastReward.total <= 0);
    btn.disabled = left <= 0;
    btn.querySelector('span').textContent = left > 0 ? tl('r.double', { n: lastReward.total }) : tl('ad.limit');
  }

  function countUp(el, from, to, prefix = '') {
    const t0 = performance.now(), dur = 700;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = prefix + fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function addCoins(n, bump = true) {
    wallet.coins += n;
    saveWallet();
    updateCoins(bump);
  }

  function updateCoins(bump) {
    for (const id of ['coinMenu', 'coinStore', 'coinOver', 'coinUnlock', 'coinConfirm']) {
      const el = $(id);
      el.textContent = fmt(wallet.coins);
      if (bump) {
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
      }
    }
    const left = adsLeft();
    for (const id of ['earnBtn', 'storeEarnBtn']) {
      const b = $(id);
      b.disabled = left <= 0;
      b.querySelector('span').textContent = left > 0 ? tl('ad.watch') : tl('ad.limit');
      b.querySelector('b').textContent = left > 0 ? `+${COIN.adReward}` : '';
      b.title = left > 0 ? tl('ad.left', { l: left, d: COIN.adDaily }) : tl('ad.tomorrow');
    }
    renderReward();
    renderThemeLocks();
    if (storeState.pending) {
      renderConfirm();
      renderPreview();
    }
    if (storeEl.classList.contains('show')) {
      renderProducts();
      renderThemes();
      renderSkins();
      renderPucks();
    }
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  // Bugün kalan ödüllü reklam hakkı
  function adsLeft() {
    const d = today();
    if (wallet.adDay !== d) {
      wallet.adDay = d;
      wallet.adCount = 0;
    }
    return Math.max(0, COIN.adDaily - wallet.adCount);
  }

  // Ödüllü reklam sağlayıcısı.
  // - CrazyGames sürümü: CrazyGames SDK'sının ödüllü reklamı (SDK.ad.requestAd('rewarded')).
  // - Diğer yerler: TEST modu; gerçek reklam yerine kısa bir örnek gösterim oynatılır. Gerçek reklam
  //   için showRewarded() bir reklam altyapısına bağlanmalıdır (web için Google H5 Games Ads / Ad
  //   Placement API, mobil uygulama için AdMob vb.); gerçek sistemde ödül, sağlayıcının sunucu
  //   tarafı doğrulamasından (SSV) sonra sunucuda eklenmelidir.
  // Ödül yalnızca reklam sonuna kadar izlenince verilir (söz true ile çözülür).
  const isCrazyBuild = BUILD === 'crazygames';
  const Ads = {
    testDuration: 5, // sn
    playing: false,  // reklam oynarken oyun donar, girişler engellenir
    get mode() {
      return crazyAdsReady() ? 'crazygames' : isCrazyBuild ? 'unavailable' : 'test';
    },
    showRewarded() {
      if (crazyAdsReady()) return playCrazyAd();
      // CrazyGames sürümünde SDK yoksa örnek reklam gösterilmez
      if (isCrazyBuild) return Promise.reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
      return playTestAd(this.testDuration);
    },
  };

  function crazyAdsReady() {
    const sdk = cloudData && window.CrazyGames && window.CrazyGames.SDK;
    return !!(sdk && sdk.ad && typeof sdk.ad.requestAd === 'function');
  }

  function setAdPlaying(on) {
    Ads.playing = on;
    document.body.classList.toggle('ad-busy', on);
    Sound.adMute = on;
    Sound.applyVolume();
    if (on) keys.clear();
  }

  function playCrazyAd() {
    return new Promise((resolve, reject) => {
      let settled = false, guard = 0;
      const finish = (ok, err) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        setAdPlaying(false);
        if (ok) resolve(true);
        else reject(err || new Error('ad'));
      };
      // Reklam bitene ya da hata verene kadar oyun durur ve girişler engellenir
      setAdPlaying(true);
      // Hiçbir geri çağrı gelmezse oyun kilitli kalmasın
      guard = setTimeout(() => finish(false, { code: 'timeout' }), 120000);
      try {
        window.CrazyGames.SDK.ad.requestAd('rewarded', {
          adStarted: () => setAdPlaying(true),
          adFinished: () => finish(true),
          adError: (error) => finish(false, error),
        });
      } catch (e) {
        finish(false, e);
      }
    });
  }

  const adState = { back: null, done: false, timer: 0, resolve: null };

  function playTestAd(secs) {
    return new Promise((resolve) => {
      adState.back = [menuEl, overEl, storeEl, unlockEl, pauseEl].find((o) => o.classList.contains('show')) || menuEl;
      adState.done = false;
      adState.resolve = resolve;
      Sound.adMute = true;
      Sound.applyVolume();
      const bar = $('adProgress'), msg = $('adMsg'), claim = $('adClaim');
      claim.disabled = true;
      $('adClose').textContent = tl('ad.closeNo');
      const t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
        bar.style.transform = `scaleX(${k})`;
        if (k < 1) {
          msg.textContent = tl('ad.wait', { n: Math.ceil(secs * (1 - k)) });
        } else {
          clearInterval(adState.timer);
          adState.done = true;
          claim.disabled = false;
          msg.textContent = tl('ad.done');
          $('adClose').textContent = tl('s.close');
        }
      };
      tick();
      clearInterval(adState.timer);
      adState.timer = setInterval(tick, 100);
      showOverlay(adEl);
    });
  }

  function endAd() {
    clearInterval(adState.timer);
    Sound.adMute = false;
    Sound.applyVolume();
    const done = adState.done, resolve = adState.resolve;
    adState.resolve = null;
    showOverlay(adState.back || menuEl);
    if (resolve) resolve(done);
  }

  $('adClaim').addEventListener('click', endAd);
  $('adClose').addEventListener('click', endAd);

  function watchAd(onReward) {
    if (adsLeft() <= 0) {
      toast(tl('ad.limitToast'));
      return;
    }
    Ads.showRewarded().then((rewarded) => {
      if (!rewarded) {
        toast(tl('ad.aborted'));
        return;
      }
      wallet.adCount++;
      saveWallet();
      onReward();
      Sound.ready();
    }).catch((err) => toast(tl(err && err.code === 'adblocker' ? 'ad.blocked' : 'ad.fail')));
  }

  function earnFromAd() {
    watchAd(() => {
      addCoins(COIN.adReward);
      toast(tl('ad.earned', { n: COIN.adReward }));
    });
  }

  $('earnBtn').addEventListener('click', earnFromAd);
  $('storeEarnBtn').addEventListener('click', earnFromAd);
  $('confirmAd').addEventListener('click', earnFromAd);
  $('doubleBtn').addEventListener('click', () => {
    if (lastReward.doubled) return;
    watchAd(() => {
      const before = wallet.coins;
      lastReward.doubled = true;
      addCoins(lastReward.total);
      countUp($('rewardAmt'), lastReward.total, lastReward.total * 2, '+');
      countUp($('coinOver'), before, wallet.coins);
      toast(tl('ad.doubled', { n: lastReward.total }));
    });
  });

  // Tema düğmelerinde kilit ve fiyat
  const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  function renderThemeLocks() {
    document.querySelectorAll('.seg[data-group="theme"] button').forEach((b) => {
      const th = b.dataset.value, locked = !isUnlocked(th);
      const nameEl = b.querySelector('.th-name') || (() => {
        const n = document.createElement('span');
        n.className = 'th-name';
        b.textContent = '';
        b.appendChild(n);
        return n;
      })();
      nameEl.textContent = THEME_INFO[th].name;
      b.classList.toggle('locked', locked);
      let tag = b.querySelector('.lock-tag');
      if (locked && !tag) {
        tag = document.createElement('small');
        tag.className = 'lock-tag';
        tag.innerHTML = `${LOCK_SVG}<i class="coin" aria-hidden="true"></i><span></span>`;
        b.appendChild(tag);
      } else if (!locked && tag) {
        tag.remove();
        tag = null;
      }
      if (tag) {
        const price = THEME_INFO[th].price;
        tag.querySelector('span').textContent = fmt(price);
        tag.classList.toggle('afford', wallet.coins >= price);
        b.setAttribute('aria-label', tl('s.ariaLocked', { name: THEME_INFO[th].name, p: price }));
      } else {
        b.removeAttribute('aria-label');
      }
    });
  }


  // Tema: Neon ya da Su Stadyumu
  function applyTheme() {
    const t = settings.theme, th = t;
    if ((t === 'water' || t === 'mud') && !Water.init(waterCanvas)) {
      toast(tl('webgl', { x: tl(th === 'mud' ? 'webgl.mud' : 'webgl.water') }));
    }
    document.body.classList.toggle('theme-water', t === 'water');
    document.body.classList.toggle('theme-ice', t === 'ice');
    document.body.classList.toggle('theme-lava', t === 'lava');
    document.body.classList.toggle('theme-sand', t === 'sand');
    document.body.classList.toggle('theme-space', t === 'space');
    document.body.classList.toggle('theme-crystal', t === 'crystal');
    document.body.classList.toggle('theme-mud', t === 'mud');
    goalSprites[0] = goalSprites[1] = null;
    if (t === 'water' || t === 'mud') Water.setMode(t);
    if (t === 'mud') Swamp.reset();
    if (t === 'ice') Ice.reset();
    if (t === 'lava') Lava.reset();
    if (t === 'sand') Sand.reset();
    if (t === 'space') Space.reset();
    if (t === 'crystal') Crystal.reset();
    Arena.reset();
    resize();
    Sound.ambient(t);
    Music.setTheme(t);
  }

  // Menü seçimleri
  function syncMenu() {
    document.querySelectorAll('.seg').forEach((seg) => {
      const key = seg.dataset.group;
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', String(settings[key]) === b.dataset.value);
      });
    });
    // Rakip seviyesi (tek oyunculu): oynanacak seviye, en yüksek açılan seviyeye kadar seçilebilir
    const pvp = settings.mode === 'pvp';
    // Tek oyunculu: kariyer (stadyum ligden gelir); iki oyunculu: stadyum seçilir
    $('levelField').classList.toggle('hidden', pvp);
    $('themeField').classList.toggle('hidden', !pvp);
    renderCareer();
    const [, rn] = rival(career.li, career.mi);
    $('playSub').textContent = pvp ? tl('m.pvp') : tl('c.play', { l: tl('lg.' + LEAGUES[career.li]), n: rn, i: career.mi + 1 });
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    $('hint').innerHTML = settings.mode === 'pvp'
      ? tl(touch ? (landscape ? 'hint.pvpTouchL' : 'hint.pvpTouch') : 'hint.pvpKeys', KEYCAP)
      : tl(touch ? (landscape ? 'hint.aiTouchL' : 'hint.aiTouch') : 'hint.aiKeys');
  }

  // Dil: sabit metinleri (data-i18n*) ve o an görünen dinamik arayüzü yeniden yazar
  function applyLang() {
    document.documentElement.lang = LANG;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = tl(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = tl(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', tl(el.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = tl(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.alt = tl(el.dataset.i18nAlt); });
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = tl('meta.desc');
    clearTextCache();
    goalSprites[0] = goalSprites[1] = null;
    syncMenu();
    syncIntro();
    renderAchBtn();
    renderMissions();
    if (achEl.classList.contains('show')) renderAchList();
    syncVolumeUI();
    renderInventory();
    renderStoreMsg();
    updateCoins(false);
    skillUI.dirty = true;
    if (game.state !== 'demo') {
      updateClock();
      updateScoreHud();
    }
    $('againBtn').textContent = tl(...(game.again || ['r.again']));
  }

  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = seg.dataset.group;
      if (key === 'theme' && !isUnlocked(b.dataset.value)) {
        openStore({ tab: 'themes', theme: b.dataset.value });
        return;
      }
      const prev = settings[key];
      settings[key] = b.dataset.value;
      store.set(key, settings[key]);
      if (key === 'mode' && settings.mode === 'ai') selectLeague(career.li, career.mi); // ligin stadyumuna dön
      syncMenu();
      if (key === 'theme' && prev !== settings.theme) applyTheme();
      if (key === 'lang' && prev !== settings.lang) {
        LANG = settings.lang;
        applyLang();
      }
    });
  });

  // Lig kartı: başlık (oklarla lig değişir) ve 5 rakip düğmesi (yenilenler ve sıradaki seçilebilir)
  function renderCareer() {
    const li = career.li, lg = LEAGUES[li];
    $('lgName').textContent = tl('lg.' + lg);
    $('lgStars').textContent = tl('c.stars', { n: leagueStars(li) });
    $('lgPrev').disabled = li <= 0;
    const nextOk = li < 7 && leagueOpen(li + 1);
    $('lgNext').disabled = !nextOk;
    $('lgNext').title = li < 7 && !nextOk ? tl('c.lockedL') : tl('c.nextL');
    const box = $('lgRivals');
    box.textContent = '';
    for (let mi = 0; mi < 5; mi++) {
      const [icon, name, kind] = rival(li, mi), open = matchOpen(li, mi);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rv' + (kind === 'boss' ? ' boss' : '') + (open ? '' : ' locked') + (mi === career.mi ? ' sel' : '') + (mi < career.won[lg] ? ' beat' : '');
      b.disabled = !open;
      const av = document.createElement('span');
      av.className = 'rv-av';
      av.textContent = open ? icon : '🔒';
      const nm = document.createElement('small');
      nm.textContent = kind === 'boss' ? tl('c.boss') : name;
      const st = document.createElement('i');
      const n = career.stars[lg + '-' + mi] || 0;
      st.textContent = n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '';
      b.append(av, nm, st);
      b.title = name;
      b.setAttribute('aria-label', name);
      b.addEventListener('click', () => selectLeague(li, mi));
      box.append(b);
    }
  }
  $('lgPrev').addEventListener('click', () => selectLeague(career.li - 1));
  $('lgNext').addEventListener('click', () => selectLeague(career.li + 1));
  $('nextUnlock').addEventListener('click', (e) => openStore({ tab: 'themes', theme: e.currentTarget.dataset.theme }));

  updateCoins(false);
  $('startBtn').addEventListener('click', startMatch);
  $('resumeBtn').addEventListener('click', resume);
  $('restartBtn').addEventListener('click', startMatch);
  $('quitBtn').addEventListener('click', startDemo);
  $('againBtn').addEventListener('click', startMatch);
  $('menuBtn').addEventListener('click', startDemo);
  pauseBtn.addEventListener('click', togglePause);
  soundBtn.addEventListener('click', () => {
    Sound.init();
    if (volPop.classList.contains('hidden')) openVolume();
    else closeVolume();
  });
  syncVolumeUI();

  const fsSupported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (fsSupported) {
    fsBtn.classList.remove('hidden');
    fsBtn.addEventListener('click', () => {
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = req && req.call(el);
        if (p && p.catch) p.catch(() => {});
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && inputActive()) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Çizim
  // ---------------------------------------------------------------------------
  // Yazılar bir kez (parıltısıyla) ayrı bir tuvale çizilir, her karede yalnızca kopyalanır.
  function textSprite(text, font, size, rgb, glow) {
    const key = `${text}|${font}|${rgb}|${glow ? 1 : 0}`;
    let sp = textCache.get(key);
    if (sp) return sp;
    if (textCache.size > 60) clearTextCache();
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const pad = glow ? size * 0.55 : size * 0.12;
    const w = m.measureText(text).width + pad * 2, h = size * 1.25 + pad * 2;
    const [c, g] = makeLayer(w, h);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (glow) {
      g.shadowColor = `rgba(${rgb},1)`;
      g.shadowBlur = size * 0.35 * S;
      g.fillStyle = `rgba(${rgb},1)`;
      g.fillText(text, w / 2, h / 2);
      g.shadowBlur = size * 0.12 * S;
      g.fillStyle = 'rgba(255,255,255,0.92)';
    } else {
      g.fillStyle = `rgb(${rgb})`;
    }
    g.fillText(text, w / 2, h / 2);
    sp = { c, w, h };
    textCache.set(key, sp);
    return sp;
  }

  function drawSprite(sp, x, y) {
    ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
  }

  // Kaleler: sabit kısımlar (ağız, çizgi, direkler) genişlik ya da durum değişince bir kez çizilip
  // saklanır; her karede yalnızca skill animasyonları (nabız, oklar, kalkan, etiket) çizilir.
  const goalSprites = [null, null];
  const GOAL_SPRITE_H = B + 14;

  function goalLine(c, x0, x1, y) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  }

  function goalSprite(i) {
    const g = goals[i], col = COLORS[i], top = i === 1;
    const grow = g.grow > 0, shrink = g.shrink > 0;
    const w = Math.round(g.w * 2) / 2;
    const key = `${w}|${grow}|${shrink}|${S}`;
    const cached = goalSprites[i];
    if (cached && cached.key === key) return cached;

    const y0 = top ? -B : H - 14; // görselin masadaki üst kenarı
    const [c, gc] = makeLayer(W, GOAL_SPRITE_H);
    gc.translate(0, -y0);
    const half = w / 2, L = W / 2 - half, Rx = W / 2 + half;
    const sy = top ? -B + 5 : H - 2, ly = top ? 0 : H;

    rr(gc, L, sy, w, B - 3, 6);
    gc.fillStyle = '#02030a';
    gc.fill();
    const gr = gc.createLinearGradient(0, sy, 0, sy + B - 3);
    gr.addColorStop(top ? 0 : 1, '#000');
    gr.addColorStop(top ? 1 : 0, `rgba(${col.rgb},0.35)`);
    gc.fillStyle = gr;
    gc.fill();

    const lineRgb = grow ? SKILLS.grow.rgb : shrink ? SKILLS.shrink.rgb : col.rgb;
    gc.lineCap = 'round';
    gc.strokeStyle = `rgba(${lineRgb},0.3)`;
    gc.lineWidth = 12;
    goalLine(gc, L + 4, Rx - 4, ly);
    gc.strokeStyle = grow ? '#ffe7a3' : shrink ? '#ffffff' : col.light;
    gc.lineWidth = 3;
    goalLine(gc, L + 4, Rx - 4, ly);

    gc.fillStyle = shrink ? `rgb(${SKILLS.shrink.rgb})` : '#fff';
    const pr = shrink ? 6.5 : 4.5;
    for (const x of [L, Rx]) {
      gc.beginPath();
      gc.arc(x, ly, pr, 0, TAU);
      gc.fill();
    }
    const sp = { c, key, y: y0 };
    goalSprites[i] = sp;
    return sp;
  }

  function drawGoals() {
    const pvp = settings.mode === 'pvp' && game.state !== 'demo';
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
    for (let i = 0; i < 2; i++) {
      const g = goals[i];
      const sp = goalSprite(i);
      ctx.drawImage(sp.c, 0, sp.y, W, GOAL_SPRITE_H);
      const grow = g.grow > 0, shrink = g.shrink > 0;
      if (!grow && !shrink) continue;

      const top = i === 1;
      const half = g.w / 2, L = W / 2 - half, Rx = W / 2 + half, ly = top ? 0 : H;
      ctx.lineCap = 'round';

      // Nabız gibi atan ek parıltı
      ctx.strokeStyle = `rgb(${grow ? SKILLS.grow.rgb : SKILLS.shrink.rgb})`;
      ctx.globalAlpha = 0.35 * pulse;
      ctx.lineWidth = 14;
      goalLine(ctx, L + 4, Rx - 4, ly);

      // Kale Kilidi: kalenin önünde kesikli kalkan yayı
      if (shrink) {
        ctx.globalAlpha = 0.3 + 0.3 * pulse;
        ctx.strokeStyle = `rgb(${SKILLS.shrink.rgb})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(W / 2, ly, half + 18, top ? 0 : Math.PI, top ? Math.PI : TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dev Kale: direklerin dışında dışa bakan oklar
      if (grow) {
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.fillStyle = `rgb(${SKILLS.grow.rgb})`;
        const oy = top ? 9 : H - 9, o = 6 + pulse * 5;
        for (const [x, d] of [[L - o, -1], [Rx + o, 1]]) {
          ctx.beginPath();
          ctx.moveTo(x + d * 9, oy);
          ctx.lineTo(x, oy - 6);
          ctx.lineTo(x, oy + 6);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Kalan süre etiketleri
      let row = 0;
      for (const key of SKILL_KEYS) {
        if (g[key] <= 0) continue;
        const sk = SKILLS[key];
        const label = textSprite(`${sk.name}  ${Math.ceil(g[key])}`, `800 15px ${FONT}`, 15, sk.rgb, false);
        ctx.save();
        if (landscape) {
          // Yatay masada yazı dik durur ve ekranda kale direğinin altında, satır satır dizilir
          ctx.translate(W / 2 + half + 28 + row * 20, top ? 64 : H - 64);
          ctx.rotate(-Math.PI / 2);
        } else {
          ctx.translate(W / 2, top ? 36 + row * 20 : H - 36 - row * 20);
          if (top && pvp) ctx.rotate(Math.PI);
        }
        ctx.globalAlpha = 0.9;
        drawSprite(label, 0, 0);
        ctx.restore();
        row++;
      }
    }
  }

  // Skill kullanıldığında kalenin önünden yükselen yazı
  function drawFloaters() {
    const pvp = settings.mode === 'pvp' && game.state !== 'demo';
    for (const f of floaters) {
      const t = f.t / f.dur;
      const top = f.gi === 1;
      const rise = 40 * t, y0 = landscape ? 250 : 120; // yatayda yazı masanın uzun ekseninde uzanır
      const y = top ? y0 + rise : H - y0 - rise;
      const pop = t < 0.15 ? 1.5 - (t / 0.15) * 0.5 : 1;
      const alpha = t > 0.65 ? (1 - t) / 0.35 : 1;
      textGlow(f.text, W / 2, y, 46, f.rgb, alpha, pop, top && pvp && !landscape);
    }
  }

  function render() {
    if (isLiquid()) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    let ox = 0, oy = 0;
    if (isLiquid()) {
      // Su ve kenar birlikte sarsılsın: iki tuvali taşıyan kutuyu kaydır
      const board = boardEl;
      if (game.shake > 0.3 && !reduceMotion) {
        const k = cssScale;
        board.style.transform = `translate(${(rand(-1, 1) * game.shake * k).toFixed(1)}px, ${(rand(-1, 1) * game.shake * k).toFixed(1)}px)`;
        boardShaken = true;
      } else if (boardShaken) {
        board.style.transform = '';
        boardShaken = false;
      }
    } else if (game.shake > 0.3 && !reduceMotion) {
      ox = rand(-1, 1) * game.shake;
      oy = rand(-1, 1) * game.shake;
      // Sarsıntıda kenarlarda eski kare kalmasın (su temasında tuval zaten her karede temizleniyor;
      // doldurmak alttaki suyu örterdi)
      if (!isLiquid()) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#05060f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    ctx.setTransform(S, 0, 0, S, ox * S, oy * S);
    ctx.drawImage(tableLayer, 0, 0, LW, LH);
    ctx.translate(B, B);

    if (isIce()) Ice.drawUnder(ctx); // izler masa katmanının içinde
    else if (isLava()) Lava.drawOver(ctx);
    else if (isSand()) Sand.drawOver(ctx);
    else if (isSpace()) Space.drawOver(ctx);
    else if (isCrystal()) Crystal.drawOver(ctx);
    else if (isMud()) Swamp.drawOver(ctx);
    drawGoals();
    drawRipples();
    Arena.draw(ctx);
    drawPucks();
    drawMallets();
    drawParticles();

    if (game.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = game.flash * 0.28;
      ctx.fillStyle = `rgb(${game.flashRgb})`;
      ctx.fillRect(-B, -B, LW, LH);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    drawFloaters();
    drawBanner();
  }

  function drawRipples() {
    if (!ripples.length || settings.theme !== 'neon') return; // diğer temalarda zemin kendi tepkisini verir
    ctx.globalCompositeOperation = 'lighter';
    for (const r of ripples) {
      const t = r.t / r.dur;
      const e = 1 - (1 - t) * (1 - t);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.col;
      ctx.lineWidth = r.w * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPucks() {
    for (const p of pucks) drawPuck(p);
  }

  function drawPuck(p) {
    const tr = p.trail;
    const n = tr.length / 2;
    if (n > 1 && (settings.theme === 'neon' || isSpace())) { // suda köpük ve dalga, buzda çizik bırakır
      const sp = Math.hypot(p.vx, p.vy);
      const heat = clamp((sp - 600) / 1500, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = isSpace() // uzayda kuyruklu yıldız
        ? `rgb(${Math.round(lerp(140, 220, heat))},${Math.round(lerp(200, 150, heat))},255)`
        : `rgb(255,${Math.round(lerp(226, 110, heat))},${Math.round(lerp(110, 60, heat))})`;
      // Her ikinci noktayı çiz: aynı görünüm, yarı maliyet
      // Uzayda ince, sürekli kuyruklu yıldız izi (her nokta, daha küçük)
      const comet = isSpace(), step = comet ? 1 : 2, rk = comet ? 0.6 : 1;
      for (let i = comet ? 0 : n % 2; i < n; i += step) {
        const t = (i + 1) / n;
        ctx.globalAlpha = t * t * (comet ? 0.22 : 0.3);
        ctx.beginPath();
        ctx.arc(tr[i * 2], tr[i * 2 + 1], PUCK_R * rk * (0.25 + 0.75 * t), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!p.visible) return;
    const spin = PUCKS[settings.puck] && PUCKS[settings.puck].spin && p.spin;
    if (spin) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
    }
    const x = spin ? 0 : p.x, y = spin ? 0 : p.y;
    if (!p.active && game.state !== 'over') {
      // Oyuna girmeyi bekleyen pak yanıp söner
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 14);
      ctx.drawImage(puckSprite, x - PS / 2, y - PS / 2, PS, PS);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(puckSprite, x - PS / 2, y - PS / 2, PS, PS);
    }
    if (spin) ctx.restore();
  }

  function drawMallets() {
    for (const m of mallets) {
      if (m.glow > 0.01 && settings.theme === 'neon') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = m.glow;
        const s = MS * (1 + (1 - m.glow) * 0.35);
        ctx.drawImage(glowSprites[m.i], m.x - s / 2, m.y - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(malletSprites[m.i], m.x - MS / 2, m.y - MS / 2, MS, MS);
    }
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let cur = '';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.col !== cur) {
        cur = p.col;
        ctx.fillStyle = cur;
        ctx.strokeStyle = cur;
      }
      if (p.spark) {
        ctx.lineWidth = p.size * (0.4 + 0.6 * a);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else {
        const r = p.size * (0.4 + 0.6 * a);
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBanner() {
    const b = game.banner;
    if (!b) return;
    const t = b.t / b.dur;
    const pop = t < 0.18 ? 1.7 - (t / 0.18) * 0.7 : 1;
    const alpha = t > 0.7 ? (1 - t) / 0.3 : Math.min(1, t / 0.08);
    if (settings.mode === 'pvp' && game.state !== 'demo' && !landscape) {
      textGlow(b.text, W / 2, H / 2 + 150, b.size * 0.8, b.rgb, alpha, pop, false);
      textGlow(b.text, W / 2, H / 2 - 150, b.size * 0.8, b.rgb, alpha, pop, true);
    } else {
      textGlow(b.text, W / 2, H / 2, b.size, b.rgb, alpha, pop, false);
    }
  }

  function textGlow(text, x, y, size, rgb, alpha, scale, flip) {
    const sp = textSprite(text, `italic 900 ${size}px ${FONT}`, size, rgb, true);
    ctx.save();
    ctx.translate(x, y);
    if (landscape) ctx.rotate(-Math.PI / 2);
    else if (flip) ctx.rotate(Math.PI);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    drawSprite(sp, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Döngü
  // ---------------------------------------------------------------------------
  let last = performance.now();
  // Bir karede beklenmeyen bir hata olursa oyun donmasın: döngü her durumda sürer, hata
  // konsola bir kez yazılır.
  const frameErrors = new Set();
  function frame(now) {
    requestAnimationFrame(frame);
    try {
      const raw = now - last;
      const dt = Math.min(Math.max(raw / 1000, 0), 0.1);
      last = now;
      trackFrame(raw);
      if (dt > 0 && !Ads.playing) update(dt); // reklam oynarken oyun (tanıtım maçı dahil) donar
      // Duraklatılmışken ekranda değişen bir şey yok: çizme (pil ve ısınma için)
      if (game.state !== 'paused') {
        if (isLiquid()) Water.render();
        render();
      }
      if (game.state !== 'demo') updateSkillUI();
      syncGameplay();
      Music.update();
      flushAchPops();
    } catch (err) {
      const key = String(err && err.message);
      if (!frameErrors.has(key)) {
        frameErrors.add(key);
        console.warn('Aqua Hockey frame error:', err);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0); // yarım kalan çizim durumunu sıfırla
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const was = landscape;
      resize();
      if (was !== landscape) renderInventory(); // "alttaki / soldaki düğmeler" ipuçları
    });
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  // Yazı tipi geç yüklenirse önbellekteki yazıları yeni yazı tipiyle yeniden üret
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(() => clearTextCache());
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => clearTextCache());
  }

  // CrazyGames: platformun ses kapatma ayarı (SDK game.settings.muteAudio) uygulanır ve değişiklikleri
  // dinlenir; açıkken oyun içi ses düğmesi sesi geri açamaz.
  const crazySdk = cloudData && window.CrazyGames && window.CrazyGames.SDK;
  if (crazySdk && crazySdk.game) {
    const applyPlatformMute = (st) => {
      Sound.platformMute = !!(st && st.muteAudio);
      Sound.applyVolume();
      syncVolumeUI();
    };
    try {
      applyPlatformMute(crazySdk.game.settings);
      crazySdk.game.addSettingsChangeListener(applyPlatformMute);
    } catch (e) { /* SDK bu özelliği sunmuyorsa yok say */ }
  }

  // CrazyGames: oyuncu fiilen oynarken (maç, geri sayım, gol kutlaması) gameplayStart, oyun
  // durunca (duraklatma, maç içi mağaza, maç sonu, ana menü, sekme gizlenince) gameplayStop
  // bildirilir. Durum her karede oyunun durumundan türetilir; SDK'ya yalnızca değişimde çağrı yapılır.
  const gameplay = { active: false };
  function syncGameplay() {
    if (!crazySdk || !crazySdk.game) return;
    const st = game.state;
    const active = (st === 'play' || st === 'countdown' || st === 'goal') && !document.hidden;
    if (active === gameplay.active) return;
    gameplay.active = active;
    try {
      if (active) crazySdk.game.gameplayStart();
      else crazySdk.game.gameplayStop();
    } catch (e) { /* yok say */ }
  }
  // Gizli sekmede kare döngüsü durur: durdurma bildirimi hemen gitsin
  document.addEventListener('visibilitychange', syncGameplay);
  document.addEventListener('visibilitychange', () => Music.applyVolume()); // arka planda müzik susar

  // CrazyGames sürümü: platform kuralı gereği oyunun dışına götüren sosyal paylaşım düğmeleri ve
  // bağlantıları sayfadan tamamen çıkarılır (yalnızca gizlemek yetmez); skor kartı görseli kalır.
  if (BUILD === 'crazygames') {
    for (const el of [document.querySelector('.share-label'), $('shareRow'), $('cardShare')]) if (el) el.remove();
  }

  applyLang();
  applyTheme();
  startDemo();
  requestAnimationFrame(frame);

  // Çevrimdışı önbellek (PWA); CrazyGames ve tanıtım sürümlerinde gerekmez
  if (!BUILD && !cloudData && !window.CrazyGames && 'serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Test ve hata ayıklama için
  window.__airHockey = { saveTarget: cloudData ? 'crazygames' : 'local', wallet, Ads, THEME_INFO, matchReward, adsLeft, Water, Ice, Lava, Sand, Space, Crystal, Swamp, game, pucks, mallets, settings, AI_LEVELS, quality, Sound, goals, skills, inventory, useSkill, openStore, step: update, Music };
});
