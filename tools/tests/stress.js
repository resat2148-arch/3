// Çökme avı: her temada AI'ye karşı AI, sanal zamanla hızlı; aşırı boyutlar, düşük kalite, duraklatma, yetenekler.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const mob of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 700 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 3 : 1 });
    await ctx.addInitScript(fs.readFileSync('/home/user/3/tools/preview-video/vtime.js', 'utf8'));
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push((mob ? 'M ' : 'D ') + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push((mob ? 'M ' : 'D ') + 'console: ' + m.text()); });
    await page.goto('http://127.0.0.1:8765/dist/showcase/');
    await page.evaluate(() => { for (let i = 0; i < 30; i++) __vt.advance(16); });
    const sizes = [[400, 700], [120, 160], [1900, 300], [300, 1900], [60, 60], [1280, 720], [400, 700]];
    for (const th of ['water', 'neon', 'ice', 'lava', 'sand', 'space', 'crystal', 'mud']) {
      await page.evaluate((th) => { document.querySelector(`[data-group="theme"] [data-value="${th}"]`).click(); }, th);
      await page.evaluate(() => { for (let i = 0; i < 5; i++) __vt.advance(16); document.getElementById('startBtn').click(); });
      await page.evaluate(() => { __airHockey.mallets[0].ai = true; __airHockey.mallets[0].level = __airHockey.AI_LEVELS.hard; });
      for (let k = 0; k < sizes.length; k++) {
        await page.setViewportSize({ width: sizes[k][0], height: sizes[k][1] });
        await page.evaluate((k) => {
          const A = __airHockey;
          if (k === 2) { A.quality.lite = true; A.quality.level = A.quality.levels.length - 1; window.dispatchEvent(new Event('resize')); }
          if (k === 4) { A.useSkill(0, 'grow'); A.useSkill(1, 'shrink'); }
          if (k === 5) A.game.clock = 14; // ikinci pak
          for (let i = 0; i < 300; i++) __vt.advance(16.7);
          if (k === 3) { document.dispatchEvent(new KeyboardEvent('keydown', {})); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP' })); for (let i = 0; i < 20; i++) __vt.advance(16.7); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP' })); }
        }, k);
      }
      await page.evaluate(() => { const A = __airHockey; A.quality.lite = false; A.quality.level = 0; A.game.clock = 0.05; for (let i = 0; i < 200; i++) __vt.advance(16.7); document.getElementById('menuBtn').click(); for (let i = 0; i < 10; i++) __vt.advance(16.7); });
      console.log((mob ? 'M ' : 'D ') + th, 'ok', errs.length);
    }
    await ctx.close();
  }
  console.log('errors', errs.length); errs.slice(0, 15).forEach(e => console.log(' ', e));
  await browser.close();
})();
