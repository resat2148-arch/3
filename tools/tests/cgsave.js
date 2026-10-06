const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  const base = 'http://127.0.0.1:8771/';
  await page.goto(base); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('MOCK_CLOUD', JSON.stringify({ neonah_played: 'true' })); }); await page.reload(); await page.waitForTimeout(1200);
  const state = () => page.evaluate(() => ({
    target: window.__airHockey && __airHockey.saveTarget, coins: window.__airHockey && __airHockey.wallet.coins, lang: window.__airHockey && __airHockey.settings.lang,
    cloudKeys: Object.keys(JSON.parse(localStorage.getItem('MOCK_CLOUD') || '{}')).join(','),
    localGameKeys: Object.keys(localStorage).filter(k => k.startsWith('neonah_')).join(','),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
  }));
  console.log('fresh:', await state());
  // Reklamla altın kazan, dili değiştir, Neon'u satın al (200: 4 reklam)
  await page.evaluate(() => { __airHockey.Ads.testDuration = 0.2; });
  for (let i = 0; i < 4; i++) { await page.tap('#earnBtn'); await page.waitForTimeout(1900); }
  await page.tap('[data-value="tr"]'); await page.waitForTimeout(300);
  await page.tap('[data-value="pvp"]'); await page.waitForTimeout(200); await page.tap('[data-value="neon"]'); await page.waitForTimeout(600); await page.tap('#confirmBuy'); await page.waitForTimeout(400); await page.tap('#storeClose'); await page.waitForTimeout(400);
  console.log('after actions:', await state(), await page.evaluate(() => ({ writes: window.__cloudWrites, theme: __airHockey.settings.theme, unlocked: __airHockey.wallet.unlocked })));
  await page.reload(); await page.waitForTimeout(1200);
  console.log('after reload:', await state(), await page.evaluate(() => ({ theme: __airHockey.settings.theme, unlocked: __airHockey.wallet.unlocked.join(','), start: document.getElementById('startBtn').textContent })));
  // Fallback modları
  for (const m of ['fail', 'disabled']) {
    await page.goto(base + '?mock=' + m); await page.waitForTimeout(1000);
    console.log(m + ':', await state());
  }
  await page.goto(base + '?mock=hang'); await page.waitForTimeout(2000);
  const early = await page.evaluate(() => !!window.__airHockey);
  await page.waitForTimeout(5000);
  console.log('hang: started early?', early, 'after timeout:', await state());
  console.log('errors', errs);
  await browser.close();
})();
