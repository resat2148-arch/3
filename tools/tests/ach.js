const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/'); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); }); await page.reload(); await page.waitForTimeout(800);
  console.log('menu btn:', await page.evaluate(() => [document.getElementById('achCount').textContent, Math.round(document.getElementById('startBtn').getBoundingClientRect().bottom), innerHeight]));
  await page.tap('#startBtn'); await page.waitForTimeout(2500);
  // gerçek gol: rakip kaleye
  await page.evaluate(() => { const A = __airHockey; A.mallets[1].x = 470; A.mallets[1].aiTx = 470; const p = A.pucks[0]; p.x = 230; p.y = 150; p.vx = 0; p.vy = -2300; });
  await page.waitForTimeout(400);
  console.log('after goal:', await page.evaluate(() => [__airHockey.game.score.join('-'), document.getElementById('achPop').classList.contains('show'), document.getElementById('achPopName').textContent, __airHockey.wallet.coins]));
  await page.screenshot({ path: 'ach-pop.png' });
  // maçı 6-0 bitir: ilk zafer, gol yemeden, gol yağmuru
  await page.evaluate(() => { const g = __airHockey.game; g.score = [6, 0]; g.m.g = 6; g.clock = 0.05; });
  await page.waitForTimeout(3500);
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('neonah_stats')));
  const ach = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('neonah_ach') || '{}')));
  console.log('stats:', JSON.stringify(stats), 'ach:', ach.join(','));
  await page.waitForTimeout(9000);
  await page.tap('#menuBtn'); await page.waitForTimeout(400);
  await page.tap('#menuAchBtn'); await page.waitForTimeout(400);
  console.log('panel:', await page.evaluate(() => [document.getElementById('achSub').textContent, document.querySelectorAll('.ach').length, document.querySelectorAll('.ach.done').length]));
  await page.screenshot({ path: 'ach-panel.png' });
  await page.tap('#achClose'); await page.waitForTimeout(300);
  console.log('back to:', await page.evaluate(() => [...document.querySelectorAll('.overlay.show')].map(o => o.id)));
  // yeniden yükle: kalıcı mı, tekrar ödül vermiyor mu
  const coins = await page.evaluate(() => __airHockey.wallet.coins);
  await page.reload(); await page.waitForTimeout(800);
  console.log('reload coins same:', coins === await page.evaluate(() => __airHockey.wallet.coins), await page.evaluate(() => document.getElementById('achCount').textContent));
  console.log('errors', errs);
  await browser.close();
})();
