const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); localStorage.setItem('neonah_wallet', JSON.stringify({ coins: 3000, welcomed: true, unlocked: ['neon', 'ice', 'lava', 'sand', 'space', 'crystal', 'mud'] })); });
  await page.reload(); await page.waitForTimeout(800);
  await page.tap('#menuStoreBtn'); await page.waitForTimeout(300); await page.tap('#tabBtnMallets'); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.store-sec + #puckList, #puckList').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'pk-store.png' });
  // Futbolu satın al
  await page.tap('#puckList .product:nth-child(5)'); await page.waitForTimeout(300); await page.tap('#confirmBuy'); await page.waitForTimeout(400);
  console.log('bought:', await page.evaluate(() => [__airHockey.settings.puck, JSON.parse(localStorage.getItem('neonah_wallet')).pucks]));
  await page.tap('#storeClose'); await page.waitForTimeout(300);
  await page.tap('#startBtn'); await page.waitForTimeout(2600);
  await page.evaluate(() => { const p = __airHockey.pucks[0]; p.vx = 900; p.vy = 300; });
  await page.waitForTimeout(300);
  console.log('spin:', await page.evaluate(() => +(__airHockey.pucks[0].spin || 0).toFixed(2)));
  const b = await page.locator('#game').boundingBox();
  await page.screenshot({ path: 'pk-game.png', clip: b });
  console.log('errors', errs);
  await browser.close();
})();
