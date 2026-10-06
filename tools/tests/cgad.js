const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8771/'); await page.evaluate(() => { (localStorage.clear(), localStorage.setItem('MOCK_CLOUD', JSON.stringify({ neonah_played: 'true' }))); localStorage.setItem('neonah_skillsSeen', 'true'); });
  await page.reload(); await page.waitForTimeout(1200);
  const st = () => page.evaluate(() => ({ mode: __airHockey.Ads.mode, coins: __airHockey.wallet.coins, playing: __airHockey.Ads.playing, busy: document.body.classList.contains('ad-busy'), muted: !!__airHockey.Sound.adMute, testAdShown: document.getElementById('adMenu').classList.contains('show'), left: __airHockey.adsLeft(), log: (window.__adLog || []).join(',') }));
  console.log('start:', await st());
  await page.tap('#earnBtn'); await page.waitForTimeout(700);
  const t0 = await page.evaluate(() => __airHockey.game.time);
  await page.waitForTimeout(400);
  const t1 = await page.evaluate(() => __airHockey.game.time);
  console.log('during ad:', await st(), 'demo frozen:', t0 === t1);
  // girişler engelli mi: tıklama başka düğmeye etki etmesin
  await page.mouse.click(195, 700).catch(() => {});
  await page.waitForTimeout(900);
  console.log('after ad:', await st(), '| toast:', await page.$eval('#toast', e => e.textContent));
  // maç sonu ödülünü ikiye katla
  await page.tap((await page.$('#introMenu.show')) ? '#introMenu' : '#startBtn'); await page.waitForTimeout(3300);
  await page.evaluate(() => { const A = __airHockey; A.game.score = [2, 0]; A.game.clock = 0.05; });
  await page.waitForTimeout(3300);
  const before = await st();
  await page.tap('#doubleBtn'); await page.waitForTimeout(2200);
  console.log('double: before', before.coins, 'after', (await st()).coins, await page.$eval('#rewardAmt', e => e.textContent));
  for (const q of ['unfilled', 'adblocker']) {
    await page.goto('http://127.0.0.1:8771/?ad=' + q); await page.waitForTimeout(1200);
    const c0 = (await st()).coins;
    await page.tap('#earnBtn'); await page.waitForTimeout(700);
    console.log(q + ':', 'coins', c0, '->', (await st()).coins, '| busy', (await st()).busy, '| toast:', await page.$eval('#toast', e => e.textContent));
  }
  console.log('errors', errs);
  await browser.close();
})();
