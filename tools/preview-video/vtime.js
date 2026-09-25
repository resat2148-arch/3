// Sayfaya yüklenmeden önce enjekte edilir: rAF, performance.now, setTimeout/setInterval sanal saate bağlanır.
(() => {
  let now = 0, seq = 0;
  const rafQ = [];
  const timers = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { rafQ.push(cb); return ++seq; };
  window.cancelAnimationFrame = () => {};
  const realST = window.setTimeout.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, ms), fn: () => fn(...a) }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (fn, ms = 0, ...a) => { const id = ++seq; timers.set(id, { at: now + ms, every: Math.max(1, ms), fn: () => fn(...a) }); return id; };
  window.clearInterval = (id) => { timers.delete(id); };
  window.__vt = {
    advance(ms) {
      const end = now + ms;
      // zamanlayıcıları sırayla çalıştır
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every; else timers.delete(id);
        try { t.fn(); } catch (e) { console.error(e); }
      }
      now = end;
      const cbs = rafQ.splice(0);
      for (const cb of cbs) { try { cb(now); } catch (e) { console.error(e); } }
    },
    get now() { return now; },
  };
})();
