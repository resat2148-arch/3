// Yatay masa: masanın ekranı ne kadar kapladığı, arayüzle çakışma, işaretçi ve klavye dönüşümü.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const sizes = [[960, 540, false], [1280, 720, false], [1920, 1080, false], [844, 390, true], [390, 844, true], [1024, 768, false]];
  for (const [w, h, mob] of sizes) {
    const n = `${w}x${h}`;
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: 'tr-TR' })).newPage();
    page.on('pageerror', e => errs.push(n + ' ' + e.message));
    await page.goto('http://127.0.0.1:8765/');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); });
    await page.reload(); await page.waitForTimeout(700);
    if (mob) await page.tap('#startBtn'); else await page.click('#startBtn');
    await page.waitForTimeout(3200); // geri sayım bitsin
    const r = await page.evaluate(() => {
      const box = (id) => { const e = typeof id === 'string' ? document.querySelector(id) : id; if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
      const hit = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      const g = box('#game');
      const ui = { clock: box('#clock'), pause: box('#pauseBtn'), sound: box('#soundBtn'), skills: box('#skillBar0') };
      const overlap = Object.entries(ui).filter(([, b]) => hit(g, b)).map(([k]) => k);
      return { landscape: document.body.classList.contains('landscape'), table: [g[2] - g[0], g[3] - g[1]], cover: Math.round((g[2] - g[0]) * (g[3] - g[1]) / (innerWidth * innerHeight) * 100) + '%', overlap, inside: g[0] >= 0 && g[1] >= 0 && g[2] <= innerWidth && g[3] <= innerHeight };
    });
    // İşaretçi: masanın sol-orta noktası (yatayda) oyuncunun kalesine yakın olmalı
    const g = await page.locator('#game').boundingBox();
    const pt = r.landscape ? [g.x + g.width * 0.15, g.y + g.height * 0.3] : [g.x + g.width * 0.3, g.y + g.height * 0.85];
    if (mob) await page.touchscreen.tap(pt[0], pt[1]); else await page.mouse.move(pt[0], pt[1]);
    await page.waitForTimeout(150);
    const tgt = await page.evaluate(() => { const m = __airHockey.mallets[0]; return [Math.round(m.tx), Math.round(m.ty)]; });
    // Klavye: sağ ok rakibe doğru (y azalır) götürmeli
    let key = null;
    if (!mob) {
      const y0 = await page.evaluate(() => __airHockey.mallets[0].ty);
      await page.keyboard.down(r.landscape ? 'ArrowRight' : 'ArrowUp'); await page.waitForTimeout(250); await page.keyboard.up(r.landscape ? 'ArrowRight' : 'ArrowUp');
      key = Math.round(y0 - await page.evaluate(() => __airHockey.mallets[0].ty));
    }
    // Banner (yazının dik durması) için bir gol at
    await page.evaluate(() => { const A = __airHockey; const p = A.pucks[0]; A.mallets[1].x = 470; A.mallets[1].aiTx = 470; p.x = 230; p.y = 150; p.vx = 0; p.vy = -2300; });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `land-${n}.png` });
    console.log(n.padEnd(10), JSON.stringify(r), 'pointer→', JSON.stringify(tgt), 'key→', key);
    await page.context().close();
  }
  console.log('errors', errs);
  await browser.close();
})();
