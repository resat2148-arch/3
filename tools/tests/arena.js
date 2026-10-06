const { chromium } = require('playwright');
const fs = require('fs');
const SECS = +(process.argv[2] || 120);
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 420, height: 720 } });
  await ctx.addInitScript(fs.readFileSync('/home/user/3/tools/preview-video/vtime.js', 'utf8'));
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.goto('http://127.0.0.1:8765/dist/showcase/');
  await page.evaluate(() => { for (let i = 0; i < 30; i++) __vt.advance(16); });
  for (const th of ['neon', 'water', 'ice', 'sand', 'mud', 'lava', 'space', 'crystal']) {
    await page.evaluate((th) => { document.querySelector(`[data-group="theme"] [data-value="${th}"]`).click(); for (let i = 0; i < 5; i++) __vt.advance(16); document.getElementById('startBtn').click(); }, th);
    const r = await page.evaluate(([SECS]) => {
      const A = __airHockey; let seed = 5; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      A.mallets[0].ai = true; A.mallets[0].up = null; // tanıtım sürümünde yükseltmeler son seviyede: ölçümde eşit raketler
      const lv = { ...A.AI_LEVELS.medium, skillSmart: 0, skillRandom: 0 };
      A.mallets.forEach((m) => { m.level = lv; });
      let goals = 0, t = 0, spSum = 0, n = 0, slow = 0, longSlow = 0, cur = 0;
      const dt = 1 / 60;
      for (; t < SECS; t += dt) {
        if (A.game.clock < 5) A.game.clock = 1e4;
        A.game.frenzy = true;
        const before = A.game.score[0] + A.game.score[1];
        A.step(dt);
        if (A.game.score[0] + A.game.score[1] > before) goals++;
        if (A.game.state !== 'play') continue;
        const p = A.pucks[0]; if (!p.active) continue;
        const sp = Math.hypot(p.vx, p.vy); spSum += sp; n++;
        if (sp < 60) { slow += dt; cur += dt; } else { if (cur > 3) longSlow++; cur = 0; }
      }
      return { goalsPerMin: +(goals / (SECS / 60)).toFixed(1), avgSpeed: Math.round(spSum / n), slowPct: Math.round(slow / SECS * 100), stuck3s: longSlow };
    }, [SECS]);
    console.log(th.padEnd(8), JSON.stringify(r));
    await page.evaluate(() => { document.getElementById('menuBtn').click(); __airHockey.game.state = 'demo'; });
    await page.evaluate(() => { const m = document.getElementById('menu'); if (!m.classList.contains('show')) document.getElementById('quitBtn').click(); });
  }
  console.log('errors', errs.slice(0, 5));
  await browser.close();
})();
