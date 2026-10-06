// Kapak görselleri: dört stadyumdan (Su, Lav, Kristal, Uzay) oyun anı çekilir, çapraz dilimler
// hâlinde dizilir; ortada oyunun logosu (ELEMENTAL / PUCK ARENA). Boyutlar: 1920×1080 (16:9),
// 800×1200 (2:3), 800×800 (1:1). Boyutları CrazyGames geliştirici portalındaki güncel isteklerle
// karşılaştırın.
// Kullanım (tanıtım sürümü 127.0.0.1:8772'de sunulurken, yazı tipi tools/preview-video/font altında):
//   node tools/cover/cover.js [çıktı klasörü]   (varsayılan dist/cover)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../../dist/cover'));
const FONT = path.join(__dirname, '../preview-video/font/package/files');
const font = (f) => fs.readFileSync(path.join(FONT, f)).toString('base64');
const THEMES = ['water', 'lava', 'crystal', 'space'];
const LEAGUES = ['water', 'neon', 'ice', 'sand', 'lava', 'mud', 'space', 'crystal'];
const SIZES = [['landscape', 1920, 1080], ['portrait', 800, 1200], ['square', 800, 800]];

// Bir stadyumda maç anı: yatay masa, arayüz gizli, iki pak oyunda
async function shot(browser, theme) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript({ path: path.join(__dirname, '../preview-video/vtime.js') });
  await ctx.addInitScript((li) => {
    localStorage.clear();
    const set = (k, v) => localStorage.setItem('aquash_' + k, JSON.stringify(v));
    set('lang', 'en'); set('mode', 'ai'); set('played', true); set('skillsSeen', true); set('career', { li, mi: 2 });
  }, LEAGUES.indexOf(theme));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8772/');
  await page.waitForFunction(() => window.__airHockey && window.__vt);
  await page.addStyleTag({ content: '.hud, .hud-btn, .skill-bar, .toast, .coach, #achPop { visibility: hidden !important; }' });
  const adv = (n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__vt.advance(33); }, n);
  await adv(10);
  await page.click('#startBtn');
  await page.evaluate(() => {
    const [a, b] = __airHockey.mallets;
    a.ai = true; a.level = { ...__airHockey.AI_LEVELS.hard, skillSmart: 0, skillRandom: 0 };
    b.level = { ...b.level, skillSmart: 0, skillRandom: 0 };
  });
  await adv(150); // stadyumun zemini maçla canlansın (dalga, çatlak, iz)
  // Gol olduysa geri sayım yazısı görünmesin: oyun sürene kadar bekle
  for (let i = 0; i < 20 && await page.evaluate(() => __airHockey.game.state !== 'play'); i++) await adv(10);
  // Poz (yatay ekranda alan x'i ekranın dikeyine düşer): logonun altında ve üstünde kalsın diye
  // pak ve raketler alanın yan kenarlarına yakın; pak rakip kaleye uçarken (izli)
  await page.evaluate(() => {
    const A = __airHockey, [a, b] = A.mallets, p = A.pucks[0];
    a.ai = b.ai = false;
    A.game.banner = null; // GOL / BAŞLA yazısı kapağa girmesin
    a.x = a.tx = 440; a.y = a.ty = 590; b.x = b.tx = 430; b.y = b.ty = 320;
    p.active = p.visible = true; p.x = 160; p.y = 610; p.vx = -400; p.vy = -1350;
  });
  await adv(3);
  await page.waitForTimeout(600);
  // Sanal saatte locator.screenshot kararlılık bekler: kutu ölçülüp sayfa görüntüsünden kırpılır
  const box = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const buf = await page.screenshot({ type: 'jpeg', quality: 92, clip: box });
  await ctx.close();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

function html(w, h, imgs) {
  const n = imgs.length, land = w > h;
  // Çapraz dilimler: her dilim tüm alanı kaplayan görsel + eğik kırpma
  const k = 0.18; // eğim (genişliğin oranı)
  const slices = imgs.map((src, i) => {
    const x0 = (i / n) * 100, x1 = ((i + 1) / n) * 100, s = k * 100;
    const clip = `polygon(${x0 + (i ? s / 2 : -50)}% 0, ${x1 + (i < n - 1 ? s / 2 : 50)}% 0, ${x1 - (i < n - 1 ? s / 2 : -50)}% 100%, ${x0 - (i ? s / 2 : 50)}% 100%)`;
    const cx = ((i + 0.5) / n) * 100;
    return `<div class="sl" style="clip-path:${clip}"><img src="${src}" style="left:${cx}%"></div>`;
  }).join('');
  const seams = imgs.slice(1).map((_, i) => {
    const x = ((i + 1) / n) * 100;
    return `<i class="seam" style="left:${x}%"></i>`;
  }).join('');
  const l1 = land ? 190 : w * 0.165, l2 = land ? 64 : w * 0.056;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Exo 2'; font-style: italic; font-weight: 900; src: url(data:font/woff2;base64,${font('exo-2-latin-900-italic.woff2')}) format('woff2'); }
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #070a1c; }
    .sl { position: absolute; inset: 0; overflow: hidden; }
    .sl img { position: absolute; top: 50%; height: ${land ? 112 : 104}%; transform: translate(-50%, -50%) ${land ? 'rotate(0deg)' : ''}; filter: saturate(1.15) contrast(1.05); }
    .seam { position: absolute; top: -10%; bottom: -10%; width: ${Math.max(4, w * 0.004)}px; background: rgba(255,255,255,0.85); box-shadow: 0 0 24px rgba(255,255,255,0.7); transform: skewX(${-Math.atan((k * w) / h) * 180 / Math.PI}deg); }
    .shade { position: absolute; inset: 0; background: radial-gradient(ellipse 75% 60% at 50% ${land ? 50 : 46}%, rgba(4,6,20,0.62), rgba(4,6,20,0.18) 70%, rgba(4,6,20,0.45)); }
    .logo { position: absolute; left: 0; right: 0; top: ${land ? 50 : 46}%; transform: translateY(-50%); text-align: center; font-family: 'Exo 2', sans-serif; font-style: italic; font-weight: 900; line-height: 0.95; }
    .l1 { display: block; font-size: ${l1}px; letter-spacing: 0.02em;
      background: linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%), linear-gradient(95deg, #3fd2ff 0%, #9ff0ff 20%, #ffd25a 42%, #ff6a1e 60%, #ff4f8b 76%, #a66bff 100%);
      -webkit-background-clip: text; background-clip: text; color: transparent;
      filter: drop-shadow(0 ${l1 * 0.04}px 0 rgba(10,12,40,0.9)) drop-shadow(0 0 ${l1 * 0.14}px rgba(140,150,255,0.65)); }
    .l2 { display: block; margin-top: ${l2 * 0.3}px; font-size: ${l2}px; letter-spacing: 0.5em; padding-left: 0.5em; color: #f2f5ff;
      text-shadow: 0 0 ${l2 * 0.4}px rgba(150,170,255,0.95), 0 ${l2 * 0.06}px 0 rgba(10,12,40,0.9); }
  </style></head><body>${slices}${seams}<div class="shade"></div>
  <div class="logo"><span class="l1">ELEMENTAL</span><span class="l2">PUCK ARENA</span></div></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const imgs = [];
  for (const t of THEMES) {
    imgs.push(await shot(browser, t));
    console.log('çekildi:', t);
  }
  for (const [name, w, h] of SIZES) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await page.setContent(html(w, h, imgs));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    const file = path.join(OUT, `elemental-puck-arena-cover-${w}x${h}.png`);
    await page.screenshot({ path: file });
    console.log('Hazır:', file);
  }
  await browser.close();
})();
