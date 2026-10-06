const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  // görevleri bilinen bir sete ayarla (her gün farklı gelir)
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); localStorage.setItem('neonah_wallet', JSON.stringify({ coins: 1000, welcomed: true })); });
  await page.reload(); await page.waitForTimeout(800);
  console.log('today missions:', await page.evaluate(() => [...document.querySelectorAll('.mi')].map(r => r.innerText.replace(/\n/g, ' ')).join(' | ')), '|', await page.evaluate(() => document.getElementById('miTimer').textContent));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('neonah_missions')); d.list = [{ type: 'goals', n: 3, r: 30, prog: 2, done: false }, { type: 'wins', n: 1, r: 30, prog: 0, done: false }, { type: 'themeWin', n: 1, r: 50, prog: 0, done: false, theme: 'water' }]; localStorage.setItem('neonah_missions', JSON.stringify(d)); });
  await page.reload(); await page.waitForTimeout(800);
  await page.screenshot({ path: 'mi-menu.png', fullPage: false });
  const c0 = await page.evaluate(() => __airHockey.wallet.coins);
  await page.tap('#startBtn'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const A = __airHockey; A.mallets[1].x = 470; A.mallets[1].aiTx = 470; const p = A.pucks[0]; p.x = 230; p.y = 150; p.vx = 0; p.vy = -2300; });
  await page.waitForTimeout(700);
  console.log('after goal: pop', await page.evaluate(() => [document.getElementById('achPopLabel').textContent, document.getElementById('achPopName').textContent]));
  await page.evaluate(() => { const g = __airHockey.game; g.score = [3, 1]; g.clock = 0.05; }); await page.waitForTimeout(3600);
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('neonah_missions')));
  console.log('missions after match:', d.list.map(m => `${m.type}:${m.prog}/${m.n}${m.done ? '✓' : ''}`).join(' '), 'bonus', d.bonus, 'over:', await page.evaluate(() => document.getElementById('miOver').textContent));
  console.log('coins gained:', await page.evaluate(() => __airHockey.wallet.coins) - c0);
  // mağaza → raketler
  await page.tap('#overStoreBtn'); await page.waitForTimeout(300); await page.tap('#tabBtnMallets'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'skins-store.png' });
  await page.tap('#skinList .product:nth-child(5)'); await page.waitForTimeout(300); await page.tap('#confirmBuy'); await page.waitForTimeout(400);
  console.log('bought:', await page.evaluate(() => [__airHockey.settings.skin, JSON.parse(localStorage.getItem('neonah_wallet')).skins, localStorage.getItem('neonah_skin')]));
  await page.tap('#storeClose'); await page.waitForTimeout(300);
  await page.tap('#againBtn'); await page.waitForTimeout(1500);
  await page.screenshot({ path: 'skins-game.png' });
  await page.reload(); await page.waitForTimeout(800);
  console.log('after reload skin:', await page.evaluate(() => __airHockey.settings.skin));
  console.log('errors', errs);
  await browser.close();
})();
