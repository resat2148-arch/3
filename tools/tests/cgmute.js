const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'tr-TR' })).newPage();
  page.on('pageerror', e => errs.push(e.message));
  const gain = () => page.evaluate(() => { const S = __airHockey.Sound; return { platformMute: !!S.platformMute, level: S.level(), master: S.master ? +S.master.gain.value.toFixed(3) : null, btnMuted: document.getElementById('soundBtn').classList.contains('muted') }; });
  // 1) Platform sesi kapalı başlar
  await page.goto('http://127.0.0.1:8771/?muteAudio=true'); await page.waitForTimeout(1200);
  await page.tap((await page.$('#introMenu.show')) ? '#introMenu' : '#startBtn'); await page.waitForTimeout(1200);
  console.log('muted at start:', await gain());
  // oyun içi M tuşu / düğme sesi açamaz
  await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
  console.log('after M:', await gain(), '| toast:', await page.$eval('#toast', e => e.textContent));
  await page.keyboard.press('Equal'); await page.waitForTimeout(300);
  console.log('after +:', await gain(), '| toast:', await page.$eval('#toast', e => e.textContent));
  // 2) Platform sesi açar (dinleyici)
  await page.evaluate(() => window.CrazyGames.SDK.game._set({ muteAudio: false })); await page.waitForTimeout(400);
  console.log('platform unmute:', await gain());
  // 3) Oyun sırasında platform yeniden kapatır
  await page.evaluate(() => window.CrazyGames.SDK.game._set({ muteAudio: true })); await page.waitForTimeout(400);
  console.log('platform mute again:', await gain());
  // 4) Normal açılış (muteAudio false)
  await page.goto('http://127.0.0.1:8771/'); await page.waitForTimeout(1200); await page.tap((await page.$('#introMenu.show')) ? '#introMenu' : '#startBtn'); await page.waitForTimeout(1000);
  console.log('not muted:', await gain());
  console.log('errors', errs);
  await browser.close();
})();
