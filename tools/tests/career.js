const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
  page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.goto('http://127.0.0.1:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
  await page.tap('#introMenu'); await page.waitForTimeout(600);
  const st = () => page.evaluate(() => ({ theme: __airHockey.settings.theme, hud: document.getElementById('hsLab1').textContent }));
  console.log('first match:', JSON.stringify(await st()));
  const finish = async (a, b) => { await page.evaluate(([a, b]) => { const g = __airHockey.game; g.score = [a, b]; g.clock = 0.05; }, [a, b]); await page.waitForTimeout(3300); };
  await finish(3, 0);
  console.log('win1:', await page.evaluate(() => [document.getElementById('resultSub').textContent, document.getElementById('againBtn').textContent]));
  // kalan 4 maç (biri yenilgi)
  for (const [a, b] of [[2, 1], [1, 2], [2, 1], [4, 2], [3, 1]]) {
    await page.tap('#againBtn', { force: true }); await page.waitForTimeout(500);
    const s = await st();
    await finish(a, b);
    console.log(s.hud.padEnd(8), `${a}-${b}`, '→', await page.evaluate(() => [document.getElementById('resultSub').textContent, document.getElementById('againBtn').textContent, document.getElementById('rewardWhy').textContent].join(' | ')));
  }
  const c = await page.evaluate(() => JSON.parse(localStorage.getItem('neonah_career')));
  console.log('career:', JSON.stringify(c.won), 'stars', JSON.stringify(c.stars), 'neon unlocked:', await page.evaluate(() => JSON.parse(localStorage.getItem('neonah_wallet')).unlocked));
  await page.waitForTimeout(6000);
  await page.tap('#againBtn', { force: true }); await page.waitForTimeout(600);
  console.log('next league match:', JSON.stringify(await st()));
  await page.keyboard.press('KeyP').catch(() => {}); await page.evaluate(() => { __airHockey.game.state = 'paused'; document.getElementById('pauseMenu').classList.add('show'); });
  await page.tap('#quitBtn'); await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'career-menu.png' });
  console.log('menu:', await page.evaluate(() => [document.getElementById('lgName').textContent, document.getElementById('lgStars').textContent, [...document.querySelectorAll('.rv')].map(r => r.className.replace('rv', '').trim() || '-').join(','), document.getElementById('playSub').textContent, document.getElementById('themeField').classList.contains('hidden')]));
  // önceki lige dön, Kraken'i seç
  await page.tap('#lgPrev'); await page.waitForTimeout(300);
  await page.tap('.rv:nth-child(5)'); await page.waitForTimeout(300);
  console.log('replay boss:', await page.evaluate(() => [document.getElementById('playSub').textContent, __airHockey.settings.theme]));
  // iki oyunculu
  await page.tap('[data-value="pvp"]'); await page.waitForTimeout(200);
  console.log('pvp:', await page.evaluate(() => [document.getElementById('themeField').classList.contains('hidden'), document.getElementById('levelField').classList.contains('hidden')]));
  console.log('ach:', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('neonah_ach') || '{}')).join(',')));
  console.log('errors', errs);
  await browser.close();
})();
