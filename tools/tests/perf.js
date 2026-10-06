// Açılış ölçümü: telefon görünümü, işlemci 4 kat yavaşlatılmış (Chrome DevTools CPU throttling).
// Her adres için 5 açılışın ortancası: DOMContentLoaded, ilk kare (oyunun ilk rAF karesi bitince),
// load; ilk dokunuştan sonra su (WebGL) kurulumu. Google Fonts istekleri kesilir (ağ gürültüsü). Sade mod: düşük bellek taklidi (deviceMemory = 1).
// Kullanım: node tools/tests/perf.js [adres ...]   (varsayılan http://127.0.0.1:8765/)
const { chromium } = require('playwright');
const urls = process.argv.slice(2).length ? process.argv.slice(2) : ['http://127.0.0.1:8765/'];
const RUNS = 5;
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [label, lowMem] of [['normal', false], ['az bellek', true]]) {
    for (const url of urls) {
      const rows = [];
      for (let r = 0; r < RUNS; r++) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
        await ctx.addInitScript((lowMem) => {
          try { localStorage.setItem('neonah_played', 'true'); } catch (e) {}
          if (lowMem) Object.defineProperty(navigator, 'deviceMemory', { get: () => 1 });
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (cb) => raf((t) => {
            cb(t);
            if (!window.__ff && window.__airHockey) window.__ff = performance.now();
          });
        }, lowMem);
        // Dış yazı tipi isteği bu ortamda değişken süre bekliyor: ölçümü bozmasın diye kesilir
        await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errs.push(e.message));
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__ff, null, { timeout: 30000 });
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const A = window.__airHockey;
          return {
            dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), ff: Math.round(window.__ff),
            water: A.Water.ok, lite: A.quality.lite, dpr: A.quality.levels[A.quality.level],
          };
        });
        // İlk dokunuş: su kurulumu (yeni sürümde ölçülür)
        await page.touchscreen.tap(195, 60);
        await page.waitForTimeout(300);
        Object.assign(m, await page.evaluate(() => {
          const A = window.__airHockey;
          return { waterAfterTap: A.Water.ok, liquidInit: A.perf ? A.perf.liquidInit : null };
        }));
        rows.push(m);
        await ctx.close();
      }
      const k = (f) => med(rows.map((x) => x[f]));
      const last = rows[rows.length - 1];
      console.log(`${label.padEnd(10)} ${url.padEnd(28)} DCL ${k('dcl')} ms · ilk kare ${k('ff')} ms · load ${k('load')} ms · su kurulumu ${k('liquidInit')} ms · açılışta su ${last.water} → dokununca ${last.waterAfterTap} · sade ${last.lite} · dpr ${last.dpr}`);
    }
  }
  console.log('errors', errs.slice(0, 5));
  await browser.close();
})();
