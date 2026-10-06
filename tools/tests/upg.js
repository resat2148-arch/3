// Yükseltmeler: satın alma, kayıt, maçta etkisi (yetenek süresi, raket hız sınırı, şut gücü),
// iki oyunculu modda etkisizlik, başarımlar, tanıtım sürümünde son seviye.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); localStorage.setItem('neonah_wallet', JSON.stringify({ coins: 3000, welcomed: true })); });
  await page.reload(); await page.waitForTimeout(600);

  // Mağaza → Yükseltmeler: Yetenek Süresi'ni 5 kez al
  await page.click('#menuStoreBtn'); await page.click('#tabBtnUpgrades');
  for (let i = 0; i < 5; i++) {
    await page.locator('#upgList .product').nth(2).click();
    await page.click('#confirmBuy');
    await page.waitForTimeout(100);
  }
  const s1 = await page.evaluate(() => ({
    upg: __airHockey.wallet.upg, coins: __airHockey.wallet.coins,
    rows: [...document.querySelectorAll('#upgList .product')].map((b) => b.querySelector('b').textContent + ' | ' + b.querySelector('small').textContent + ' | ' + b.querySelector('.upg-pips em').textContent + ' | ' + b.querySelector('.product-price').textContent),
    ach: Object.keys(JSON.parse(localStorage.getItem('neonah_ach') || '{}')),
  }));
  console.log('after 5 buys:', JSON.stringify(s1, null, 1));
  // Son seviyedeki satır tıklanınca onay açılmamalı
  await page.locator('#upgList .product').nth(2).click();
  console.log('maxed click opens confirm:', await page.evaluate(() => !document.getElementById('storeConfirm').classList.contains('hidden')));
  await page.click('#storeClose');

  // Kayıt: yeniden yüklenince seviyeler duruyor
  await page.reload(); await page.waitForTimeout(600);
  console.log('after reload:', JSON.stringify(await page.evaluate(() => __airHockey.wallet.upg)));

  // Tek oyunculu maç: oyuncunun raketinde yükseltmeler, rakipte yok; yetenek 5 + 3 = 8 sn
  await page.click('#startBtn'); await page.waitForTimeout(3300);
  const m = await page.evaluate(() => {
    const A = __airHockey;
    A.useSkill(0, 'grow');
    return { up0: A.mallets[0].up, up1: A.mallets[1].up, grow: A.goals[1].grow };
  });
  console.log('ai match:', JSON.stringify(m));
  // Şut gücü: duran paka 480 birim/sn ile vuruş (önce yükseltmesiz, sonra son seviye)
  const shot = await page.evaluate(() => {
    const A = __airHockey, r = {};
    for (const [k, up] of [['none', null], ['max', { speed: 5, power: 5, skill: 5 }]]) {
      const p = A.pucks[0], ml = A.mallets[0];
      A.mallets[1].x = 470; A.mallets[1].aiTx = 470;
      ml.up = up; ml.x = ml.tx = 270; ml.y = ml.ty = 700;
      A.step(1 / 60);
      p.active = true; p.x = 270; p.y = 638; p.vx = 0; p.vy = 0;
      // Raket her karede 8 birim yukarı (480 birim/sn): şut hız sınırının altında kalır
      for (let i = 1; i <= 6; i++) { ml.ty = 700 - i * 8; A.step(1 / 60); }
      r[k] = Math.round(Math.hypot(p.vx, p.vy));
    }
    return r;
  });
  console.log('shot speed (puck from rest):', JSON.stringify(shot));

  // İki oyunculu: yükseltme yok
  await page.click('#pauseBtn'); await page.click('#quitBtn'); await page.waitForTimeout(300);
  await page.click('[data-group="mode"] [data-value="pvp"]');
  await page.click('#startBtn'); await page.waitForTimeout(3300);
  console.log('pvp up:', JSON.stringify(await page.evaluate(() => [__airHockey.mallets[0].up, __airHockey.mallets[1].up])));
  await ctx.close();

  // Tanıtım sürümü: hepsi son seviyede, fiyat yok
  const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' })).newPage();
  p2.on('pageerror', (e) => errs.push('showcase ' + e.message));
  await p2.goto('http://127.0.0.1:8765/dist/showcase/'); await p2.waitForTimeout(600);
  await p2.click('#menuStoreBtn'); await p2.click('#tabBtnUpgrades');
  console.log('showcase:', JSON.stringify(await p2.evaluate(() => [...document.querySelectorAll('#upgList .product-price')].map((e) => e.textContent))), 'water at start:', await p2.evaluate(() => __airHockey.Water.ok));
  console.log('errors', errs);
  await browser.close();
})();
