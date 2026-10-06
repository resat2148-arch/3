const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, mob, n] of [[960, 600, false, 'desk'], [390, 664, true, 'mob']]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob, locale: 'tr-TR' })).newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('http://127.0.0.1:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(800);
    if (mob) await page.tap('#introMenu'); else await page.click('#introMenu');
    await page.waitForTimeout(900);
    console.log(n, 'coach shown:', await page.evaluate(() => !document.getElementById('coach0').classList.contains('hidden')), 'toast:', await page.evaluate(() => document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : '-'));
    await page.screenshot({ path: `guide-${n}.png` });
    // raketi hareket ettir → rehber kaybolur
    const box = await page.locator('#game').boundingBox();
    if (mob) { await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.8); }
    else { for (let i = 0; i < 8; i++) { await page.mouse.move(box.x + box.width * (0.5 - i * 0.04), box.y + box.height * 0.8); await page.waitForTimeout(40); } }
    await page.waitForTimeout(600);
    console.log(n, 'after move hidden:', await page.evaluate(() => document.getElementById('coach0').classList.contains('hidden')), 'seen saved:', await page.evaluate(() => localStorage.getItem('neonah_coachAi')));
    if (!mob) {
      await page.waitForTimeout(2500);
      await page.evaluate(() => { __airHockey.game.state = 'play'; }); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      console.log('Escape pauses?', await page.evaluate(() => __airHockey.game.state));
      await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
      console.log('P pauses?', await page.evaluate(() => __airHockey.game.state));
      await page.click('#resumeBtn'); await page.waitForTimeout(200);
      // AZERTY: M harfi Semicolon konumunda
      const before = await page.evaluate(() => __airHockey.settings.sound);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'Semicolon' })));
      const after = await page.evaluate(() => __airHockey.settings.sound);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'KeyM' })));
      const after2 = await page.evaluate(() => __airHockey.settings.sound);
      console.log('AZERTY m toggles sound:', before, '->', after, '; comma at KeyM ignored:', after2 === after);
      // blur → duraklat
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(200);
      console.log('blur pauses:', await page.evaluate(() => __airHockey.game.state));
      // ikinci maç: yetenek ipucu, rehber yok
      await page.click('#restartBtn'); await page.waitForTimeout(2300);
      console.log('2nd match coach:', await page.evaluate(() => !document.getElementById('coach0').classList.contains('hidden')), 'toast:', await page.evaluate(() => document.getElementById('toast').textContent));
      // maç sonu: reklam düğmesi boyutu
      await page.evaluate(() => { const g = __airHockey.game; g.score = [2, 1]; g.clock = 0.05; }); await page.waitForTimeout(3300);
      console.log('double btn width / again width:', await page.evaluate(() => [Math.round(document.getElementById('doubleBtn').getBoundingClientRect().width), Math.round(document.getElementById('againBtn').getBoundingClientRect().width)]));
      await page.screenshot({ path: 'guide-over.png' });
      // PvP rehberi
      await page.click('#menuBtn'); await page.click('[data-value="pvp"]'); await page.click('#startBtn'); await page.waitForTimeout(900);
      console.log('pvp coach:', await page.evaluate(() => [0, 1].map(i => !document.getElementById('coach' + i).classList.contains('hidden'))), await page.evaluate(() => document.getElementById('hint').innerHTML.slice(0, 0)));
      await page.screenshot({ path: 'guide-pvp.png' });
    }
  }
  console.log('errors', errs);
  await browser.close();
})();
