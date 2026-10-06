// Elemental Puck Arena tanıtım videosu: sanal zamanla kare kare çekim.
// Kullanım: node record.js <landscape|portrait> <çıktı klasörü> [yalnızca klip adı]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const orient = process.argv[2] || 'landscape';
const OUT = process.argv[3] || path.join(__dirname, '../../dist/preview-video', orient);
const ONLY = process.argv[4] || null;
const FPS = 30;
const VIEW = orient === 'portrait' ? { width: 540, height: 810 } : { width: 960, height: 540 };
const FONT_DIR = path.join(__dirname, 'font/package'); // npm pack @fontsource/exo-2 && tar xzf ile açılır
const fontCss = ['500.css', '700.css', '800.css', '800-italic.css', '900-italic.css']
  .map((f) => fs.readFileSync(path.join(FONT_DIR, f), 'utf8'))
  .join('\n')
  .replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/');

// Klipler: tema, süre (sn), olaylar [kare, eylem, parametre]. kind: 'match' (varsayılan: maç içi),
// 'intro' (ilk açılış ekranı: logo), 'career' (menüdeki kariyer kartı; ligler arasında geçiş).
// Sıra: kimlik → stadyum mekanikleri (lav halkası, kristal sütun, çekim kuyuları, iki pak) → kariyer.
const CLIPS = [
  { name: '0-intro', theme: 'water', secs: 1.5, kind: 'intro' },
  { name: '1-water', theme: 'water', secs: 2.4, skills: true, events: [[0, 'place'], [2, 'strike'], [16, 'ai'], [40, 'slam', 1]] },
  { name: '2-lava', theme: 'lava', secs: 2.6, events: [[0, 'ventShot'], [70, 'ai']] },
  { name: '3-crystal', theme: 'crystal', secs: 2.2, events: [[0, 'place'], [2, 'pillarShot'], [34, 'ai']] },
  { name: '4-space', theme: 'space', secs: 2.5, events: [[22, 'goalShot'], [74, 'ai']] },
  { name: '5-sand', theme: 'sand', secs: 2.4, pre: 'frenzy', events: [[18, 'place'], [20, 'strike'], [34, 'ai']] },
  { name: '6-ice', theme: 'ice', secs: 2.2, events: [[0, 'place', 'keepTop'], [2, 'strike'], [16, 'ai'], [36, 'slam', 1]] },
  { name: '7-career', theme: 'water', secs: 2.6, kind: 'career', events: [[18, 'nextLeague'], [48, 'nextLeague']] },
];

async function recordClip(browser, clip) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  await ctx.addInitScript({ path: path.join(__dirname, 'vtime.js') });
  await ctx.addInitScript(({ theme, kind }) => {
    try {
      localStorage.clear();
      const set = (k, v) => localStorage.setItem('aquash_' + k, JSON.stringify(v));
      set('theme', theme); set('lang', 'en'); set('skillsSeen', true); set('difficulty', 'hard'); set('mode', 'ai');
      // Tek oyunculu maçın stadyumu kariyerdeki ligden gelir: klibin stadyumunun ligi seçilir
      const li = ['water', 'neon', 'ice', 'sand', 'lava', 'mud', 'space', 'crystal'].indexOf(theme);
      set('career', { li: Math.max(0, li), mi: kind === 'career' ? 0 : 2 });
      if (kind === 'career') set('played', true);
    } catch (e) { /* yok say */ }
  }, { theme: clip.theme, kind: clip.kind || 'match' });
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: fontCss }));
  await ctx.route('https://fonts.gstatic.com/local/**', (r) => {
    const f = path.join(FONT_DIR, 'files', r.request().url().split('/local/')[1]);
    r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:8772/');
  await page.waitForFunction(() => window.__airHockey && window.__vt);
  // Video için sade görünüm: duraklat / tam ekran / ses düğmeleri gizli
  await page.addStyleTag({ content: '.hud-btn { visibility: hidden !important; }' });
  if (!clip.skills) {
    await page.evaluate(() => { for (const k of ['easy', 'medium', 'hard']) { __airHockey.AI_LEVELS[k].skillSmart = 0; __airHockey.AI_LEVELS[k].skillRandom = 0; } });
  }
  await page.evaluate(() => Promise.all(['500 10px "Exo 2"', '700 10px "Exo 2"', '800 10px "Exo 2"', 'italic 800 10px "Exo 2"', 'italic 900 10px "Exo 2"'].map((f) => document.fonts.load(f))));
  const adv = (ms) => page.evaluate((ms) => window.__vt.advance(ms), ms);
  for (let i = 0; i < 10; i++) await adv(33);
  if (!clip.kind) {
    await page.click('#startBtn');
    // geri sayım + 1 sn ısınma (çekilmez)
    await page.evaluate((skills) => {
      const [m0, m1] = __airHockey.mallets;
      m0.ai = true; m0.level = __airHockey.AI_LEVELS.hard;
      // Kariyer rakibinin kendi yapay zekâ ayarı var: yetenekler istenmiyorsa onda da kapatılır
      if (!skills) m1.level = { ...m1.level, skillSmart: 0, skillRandom: 0 };
    }, !!clip.skills);
    for (let i = 0; i < 135; i++) await adv(33);
    if (clip.pre === 'frenzy') await page.evaluate(() => { __airHockey.game.clock = 15.45; });
  } else {
    // Menü ve ilk açılış ekranı: arkadaki tanıtım maçı 2 sn ısınsın; kariyer kartı görünür alana
    for (let i = 0; i < 60; i++) await adv(33);
    await page.evaluate((kind) => {
      if (kind === 'intro') {
        // Tanıtım sürümü ilk açılış ekranını atlar: logo ekranı elle gösterilir
        document.getElementById('menu').classList.remove('show');
        document.getElementById('introMenu').classList.add('show');
      } else {
        // Kariyer kartı ekrana sığmıyorsa (yatay) alt kenarı görünene kadar kaydır
        const card = document.getElementById('lgRivals');
        if (card.getBoundingClientRect().bottom > innerHeight - 8) card.scrollIntoView({ block: 'end' });
      }
    }, clip.kind);
  }
  await page.waitForTimeout(800); // menünün CSS geçişi bitsin (gerçek zaman)

  const dir = path.join(OUT, clip.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(clip.secs * FPS);
  for (let f = 0; f < n; f++) {
    for (const [at, act, arg] of clip.events || []) {
      if (at !== f) continue;
      await page.evaluate(([act, arg]) => {
        const A = __airHockey, m = A.mallets[0], m1 = A.mallets[1], p = A.pucks[0];
        if (act === 'place') {
          // sert şut hazırlığı: disk ortada durur, raket arkasında
          m.ai = false; m.x = m.tx = 300; m.y = m.ty = 820; m.vx = m.vy = 0;
          p.active = true; p.visible = true; p.x = 280; p.y = 640; p.vx = 0; p.vy = 0;
          if (arg !== 'keepTop') { m1.ai = false; m1.x = m1.tx = 440; m1.y = m1.ty = 150; }
        } else if (act === 'strike') {
          m.tx = 262; m.ty = 470; // diskin içinden hızla geçer
        } else if (act === 'ai') {
          m.ai = true; m1.ai = true;
        } else if (act === 'slam') {
          // en yakın diski yan duvara sert gönder
          p.active = true; p.visible = true; p.x = 270; p.y = 470; p.vx = 2150 * arg; p.vy = -380;
        } else if (act === 'ventShot') {
          // lav halkası: disk halkanın üst kenarında durur; halka patlayınca rakip kaleye fırlar
          m.ai = false; m.x = m.tx = 270; m.y = m.ty = 820; m.vx = m.vy = 0;
          m1.ai = false; m1.x = m1.tx = 440; m1.y = m1.ty = 150;
          p.active = true; p.visible = true; p.x = 262; p.y = 330; p.vx = 0; p.vy = 0;
          A.Arena.vents.push({ x: 268, y: 372, t: 0, blown: false });
        } else if (act === 'pillarShot') {
          // kristal sütuna sağdan sert şut: sütundan sekip nota çalar ve rakip kaleye gider
          p.active = true; p.visible = true; p.x = 480; p.y = 530; p.vx = -1719; p.vy = -531;
        } else if (act === 'nextLeague') {
          document.getElementById('lgNext').click();
        } else if (act === 'goalShot') {
          m1.ai = false; m1.x = m1.tx = 90; m1.y = m1.ty = 140;
          p.active = true; p.visible = true; p.x = 250; p.y = 560; p.vx = 60; p.vy = -2250;
        }
      }, [act, arg]);
    }
    await adv(1000 / FPS);
    await page.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 93 });
  }
  const info = await page.evaluate(() => ({ state: __airHockey.game.state, score: __airHockey.game.score.join('-'), frenzy: __airHockey.game.frenzy }));
  console.log(orient, clip.name, n, 'frames', JSON.stringify(info), errs.slice(0, 2).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const clip of CLIPS) if (!ONLY || clip.name === ONLY) await recordClip(browser, clip);
  await browser.close();
})();
