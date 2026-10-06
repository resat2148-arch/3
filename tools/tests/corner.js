// Köşe sıkıştırma testi: pak AI'nin köşesine / kenarına bırakılır, AI'nin onu ne kadar sürede çıkardığı ölçülür.
const { chromium } = require('playwright');
const fs = require('fs');
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 600, height: 900 } });
  await ctx.addInitScript(fs.readFileSync('/home/user/3/tools/preview-video/vtime.js', 'utf8'));
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL); if (process.env.BOT) await page.addInitScript('window.__BOT = 1'); if (process.env.LV) await page.addInitScript(`window.__LV = ${JSON.stringify(process.env.LV.split(','))}`);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); });
  await page.reload();
  await page.evaluate(() => { for (let i = 0; i < 40; i++) __vt.advance(16); });
  await page.click('#startBtn');
  await page.evaluate(() => { for (let i = 0; i < 300; i++) __vt.advance(16); });
  const res = await page.evaluate(() => {
    const A = __airHockey, W = 540, H = 900;
    const out = {};
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const origRandom = Math.random; Math.random = rnd;
    for (const lvl of (window.__LV || ['easy', 'medium', 'hard'])) {
      const L = { ...A.AI_LEVELS[lvl], skillSmart: 0, skillRandom: 0 };
      const BOT = !!window.__BOT; const ai = A.mallets[BOT ? 0 : 1]; ai.ai = true; ai.level = L; const other = A.mallets[BOT ? 1 : 0]; other.ai = false;
      const starts = [];
      for (const x of [22, 40, 70, 110]) for (const y of [22, 40, 70, 110]) for (const side of [0, 1]) starts.push([side ? W - x : x, y]);
      for (const x of [22, 40]) for (const y of [180, 260, 340]) for (const side of [0, 1]) starts.push([side ? W - x : x, y]); // yan duvar
      for (const x of [150, 200, 340, 390]) starts.push([x, 22]); // arka duvar
      const cats = {}, modes = {}; let pinT = 0, total = 0, worst = 0, slow = 0, cornerT = 0, trials = 0; const bad = [];
      for (const [x, y] of starts) for (const mstart of [[W / 2, 92], [x < W / 2 ? 120 : W - 120, 200]]) {
        trials++;
        A.game.state = 'play'; A.game.clock = 1e4; A.game.frenzy = true;
        const p = A.pucks[0];
        A.pucks.forEach((q, i) => { q.active = i === 0; });
        p.x = x; p.y = BOT ? H - y : y; p.vx = (rnd() - 0.5) * 60; p.vy = (rnd() - 0.5) * 60; p.stuck = 0;
        ai.x = ai.aiTx = mstart[0]; ai.y = ai.aiTy = BOT ? H - mstart[1] : mstart[1]; ai.vx = ai.vy = ai.avx = ai.avy = 0; ai.aiTimer = 0; ai.aiMode = '';
        const hm = other; hm.x = hm.tx = W / 2; hm.y = hm.ty = BOT ? 92 : H - 92;
        let t = 0, ct = 0, pt = 0; const dt = 1 / 60;
        for (; t < 8; t += dt) {
          A.step(dt);
          if (A.game.state !== 'play') break;            // gol
          if ((BOT ? H - p.y : p.y) > H / 2 + 40) break;                    // pak AI yarısından çıktı
          const cx = Math.min(p.x, W - p.x), cy = BOT ? H - p.y : p.y;
          if (cx < 75 && cy < 75) ct += dt;
          if (cy < 70) { const k = ai.aiMode + (Math.hypot(p.x - ai.x, p.y - ai.y) < 61 ? '+touch' : ''); modes[k] = (modes[k] || 0) + dt; }
          const wg = Math.min(p.x - 21, W - 21 - p.x, cy - 21);
          if (wg < 6 && Math.hypot(p.vx, p.vy) < 80 && Math.hypot(p.x - ai.x, p.y - ai.y) < 61) pt += dt;
        }
        total += t; worst = Math.max(worst, t); cornerT += ct; pinT += pt;
        const cat = (Math.min(x, W - x) < 45 && y < 45) ? 'corner' : y < 45 ? 'back' : Math.min(x, W - x) < 45 && y > 150 ? 'side' : 'near';
        (cats[cat] = cats[cat] || []).push(t);
        if (t >= 3) { slow++; bad.push([x, y, mstart[0], +t.toFixed(1), +ct.toFixed(1)]); }
      }
      const cs = {}; for (const [k, a] of Object.entries(cats)) cs[k] = [+(a.reduce((u, v) => u + v, 0) / a.length).toFixed(2), a.filter((v) => v >= 3).length + '/' + a.length];
      for (const k in modes) modes[k] = +modes[k].toFixed(1);
      out[lvl] = { modes, cats: cs, trials, avg: +(total / trials).toFixed(2), worst: +worst.toFixed(1), over3s: slow, cornerSec: +cornerT.toFixed(1), pinSec: +pinT.toFixed(1), bad: bad.slice(0, 30) };
    }
    Math.random = origRandom;
    return out;
  });
  for (const [k, v] of Object.entries(res)) console.log(k, JSON.stringify(v));
  console.log('errors', errs.slice(0, 3));
  await browser.close();
})();
