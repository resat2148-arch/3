// Yükseltme dengesi: oyuncunun raketini yapay zekâ sürer; aynı rakiplere karşı yükseltmesiz ve
// tüm yükseltmeler son seviyedeyken kazanma oranı ve gol farkı ölçülür (sanal saat, tohumlu rastgelelik).
// Kullanım: node tools/tests/balance.js [maç sayısı] [lig.maç,lig.maç,...] [oyuncu için lig başına seviye]
// Örnek: node tools/tests/balance.js 60 4.2,7.4 1.4  (oyuncu eski zorluk eğrisinde, rakip yenisinde)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const N = +(process.argv[2] || 16);
const PK = process.argv[4] ? +process.argv[4] : 0;
(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 420, height: 720 } });
  await ctx.addInitScript(fs.readFileSync(path.join(__dirname, '../preview-video/vtime.js'), 'utf8'));
  await ctx.addInitScript(() => { try { localStorage.setItem('neonah_played', 'true'); localStorage.setItem('neonah_coachAi', 'true'); localStorage.setItem('neonah_skillsSeen', 'true'); } catch (e) {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/');
  await page.evaluate(() => { for (let i = 0; i < 30; i++) __vt.advance(16); });
  // [lig, maç]: oyuncunun yapay zekâsı rakibin zorluk seviyesinde (rivalDiff)
  const cases = (process.argv[3] || '0.2,4.2,7.4').split(',').map((s) => s.split('.').map(Number));
  for (const [li, mi] of cases) {
    const row = {};
    for (const up of [false, true]) {
      row[up ? 'max' : 'none'] = await page.evaluate(([li, mi, up, N, PK]) => {
        const A = __airHockey;
        // Oyuncunun seviyesi: rakibinki ya da (3. bağımsız değişken) lig başına K ile eski formül
        const diff = PK ? 1 + li * PK + mi * 0.3 + (mi === 4 ? 0.3 : 0) : A.rivalDiff(li, mi);
        let win = 0, draw = 0, gf = 0, ga = 0, maxSp = 0;
        for (let k = 0; k < N; k++) {
          let seed = 1000 + k * 7919; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          const btn = document.getElementById(document.getElementById('menu').classList.contains('show') ? 'startBtn' : 'againBtn');
          btn.click();
          const [p, r] = A.mallets;
          p.ai = true; p.level = A.aiForLevel(diff);
          p.up = up ? { speed: 5, power: 5, skill: 5 } : null;
          r.level = A.rivalAI(li, mi);
          for (let i = 0; i < 6000 && A.game.state !== 'over'; i++) {
            A.step(1 / 60);
            for (const q of A.pucks) if (q.active) maxSp = Math.max(maxSp, Math.hypot(q.vx, q.vy));
          }
          const [a, b] = A.game.score;
          gf += a; ga += b; if (a > b) win++; else if (a === b) draw++;
          __vt.advance(16);
        }
        return { win: Math.round(win / N * 100) + '%', draw: Math.round(draw / N * 100) + '%', goals: +(gf / N).toFixed(1) + '-' + +(ga / N).toFixed(1), maxSp: Math.round(maxSp) };
      }, [li, mi, up, N, PK]);
    }
    console.log(`lig ${li + 1} maç ${mi + 1}`.padEnd(12), JSON.stringify(row));
  }
  console.log('errors', errs.slice(0, 5));
  await browser.close();
})();
