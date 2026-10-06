const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const log = (...a) => console.log(...a);
  // 1) İlk ziyaret: intro → tek dokunuşla maç
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(900);
    log('first visit overlay:', await page.evaluate(() => [...document.querySelectorAll('.overlay.show')].map(o => o.id)), await page.evaluate(() => [__airHockey.wallet.coins, __airHockey.wallet.dailyDay !== '', __airHockey.wallet.streak]));
    await page.screenshot({ path: 'ux-intro.png' });
    await page.tap('#introMenu', { position: { x: 200, y: 500 } }); await page.waitForTimeout(500);
    log('after tap state:', await page.evaluate(() => [__airHockey.game.state, __airHockey.settings.level, +__airHockey.mallets[1].level.speed.toFixed(0)]));
    // maçı kazanarak bitir
    await page.evaluate(() => { const g = __airHockey.game; g.score = [3, 1]; g.clock = 0.05; });
    await page.waitForTimeout(3600);
    log('over:', await page.evaluate(() => [document.getElementById('againBtn').textContent, document.getElementById('resultSub').textContent, document.getElementById('rewardWhy').textContent, __airHockey.wallet.coins, __airHockey.settings.level, __airHockey.settings.maxLevel, document.getElementById('nextUnlockText').textContent, document.getElementById('dailyNext').textContent]));
    const b = await page.evaluate(() => { const r = document.getElementById('againBtn').getBoundingClientRect(); return [Math.round(r.bottom), innerHeight]; });
    log('again button bottom/vh:', b);
    await page.screenshot({ path: 'ux-over.png' });
    await page.tap('#nextUnlock', { force: true }); await page.waitForTimeout(500);
    log('next unlock opens:', await page.evaluate(() => [...document.querySelectorAll('.overlay.show')].map(o => o.id)));
    await browser.contexts()[0].close();
  }
  // 2) Geri dönen oyuncu: menü katlama, günlük ödül
  for (const [w, h, mob, n] of [[960, 540, false, 'desk-960x540'], [1280, 720, false, 'desk-1280x720'], [390, 664, true, 'mob-390x664'], [360, 600, true, 'mob-360x600']]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: 'en-US' })).newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/');
    await page.evaluate(() => { localStorage.clear(); const d = new Date(); d.setDate(d.getDate() - 1); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_wallet', JSON.stringify({ coins: 120, unlocked: [], welcomed: true, dailyDay: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, streak: 2 })); localStorage.setItem('neonah_maxLevel', '5'); localStorage.setItem('neonah_level', '5'); });
    await page.reload(); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const b = document.getElementById('startBtn').getBoundingClientRect(); return { startBottom: Math.round(b.bottom), vh: innerHeight, visible: b.bottom <= innerHeight, coins: __airHockey.wallet.coins, streak: __airHockey.wallet.streak, toast: document.getElementById('toast').textContent, play: document.getElementById('startBtn').innerText.replace(/\n/g, ' | ') }; });
    log(n, JSON.stringify(r));
    await page.screenshot({ path: `ux-menu-${n}.png` });
  }
  log('errors', errs);
  await browser.close();
})();
