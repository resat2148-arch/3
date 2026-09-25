/* Neon Air Hockey — bağımlılıksız, tek dosyalık oyun motoru. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Sabitler (mantıksal birimler; ekran boyutundan bağımsız)
  // ---------------------------------------------------------------------------
  const W = 540, H = 900;           // oyun alanı
  const B = 24;                     // masa kenarı kalınlığı
  const LW = W + B * 2, LH = H + B * 2;
  const GOAL_W = 184;
  const GOAL_L = (W - GOAL_W) / 2, GOAL_R = (W + GOAL_W) / 2;
  const PUCK_R = 21, MALLET_R = 37;
  const MIN_D = PUCK_R + MALLET_R;
  const CENTER_GAP = MALLET_R * 0.5; // raketin merkez çizgisine en fazla yaklaşabileceği mesafe
  const MAX_PUCK = 2300;             // birim / saniye
  const MAX_MALLET_V = 4200;
  const DAMPING = 0.3;               // hava yastığı sürtünmesi
  const WALL_E = 0.88, MALLET_E = 0.9, PUCK_E = 0.92;
  const SUBSTEPS = 10;
  const TAU = Math.PI * 2;
  const MATCH_TIME = 60;              // maç süresi (sn)
  const SECOND_PUCK_AT = 45;         // ikinci topun girdiği saniye
  const POSTS = [[GOAL_L, 0], [GOAL_R, 0], [GOAL_L, H], [GOAL_R, H]];

  const COLORS = [
    { main: '#19e6ff', light: '#c4faff', dark: '#064a74', rgb: '25,230,255', name: 'MAVİ' },
    { main: '#ff3d9a', light: '#ffd0e6', dark: '#6e0a3c', rgb: '255,61,154', name: 'PEMBE' },
  ];
  const PUCK_RGB = '255,226,110';
  const FONT = '"Exo 2", system-ui, sans-serif';

  const AI_LEVELS = {
    easy:   { speed: 540,  accel: 3000,  think: 0.22,  predict: 0.1,  aimErr: 1.0,  noise: 70, strike: 1.0,  bank: 0,    counter: false },
    medium: { speed: 880,  accel: 6000,  think: 0.1,   predict: 0.22, aimErr: 0.55, noise: 30, strike: 1.15, bank: 0.15, counter: true },
    hard:   { speed: 1380, accel: 11000, think: 0.035, predict: 0.36, aimErr: 0.2,  noise: 6,  strike: 1.3,  bank: 0.3,  counter: true },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------------------
  // Ayarlar (localStorage erişilemezse varsayılanlarla çalışır)
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('neonah_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('neonah_' + k, JSON.stringify(v)); } catch (e) { /* yok say */ }
    },
  };

  const settings = {
    mode: store.get('mode', 'ai'),
    difficulty: store.get('difficulty', 'medium'),
    sound: store.get('sound', true),
  };

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Ses (Web Audio ile sentezlenir, dosya gerekmez)
  // ---------------------------------------------------------------------------
  const Sound = {
    ctx: null, out: null, noiseBuf: null, last: {},
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      this.out = c.createGain();
      this.out.gain.value = 0.75;
      this.out.connect(comp);
      comp.connect(c.destination);
      const len = Math.floor(c.sampleRate * 0.6);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },
    ok(name, gap) {
      if (!this.ctx || !settings.sound || game.state === 'demo') return false;
      const t = this.ctx.currentTime;
      if (this.last[name] !== undefined && t - this.last[name] < gap) return false;
      this.last[name] = t;
      return true;
    },
    tone(f0, f1, dur, type, vol, delay = 0) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.03);
    },
    noise(dur, vol, freq, q = 1, delay = 0, type = 'bandpass') {
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(this.out);
      s.start(t);
      s.stop(t + dur + 0.03);
    },
    hit(k) {
      if (!this.ok('hit', 0.045)) return;
      this.tone(380 + k * 420, 160 + k * 140, 0.09, 'triangle', 0.22 + k * 0.4);
      this.noise(0.05, 0.18 + k * 0.35, 2600 + k * 2400, 1.3);
    },
    wall(k) {
      if (!this.ok('wall', 0.045)) return;
      this.tone(180 + k * 110, 110, 0.08, 'sine', 0.18 + k * 0.32);
      this.noise(0.04, 0.08 + k * 0.2, 1300, 1);
    },
    goal(good) {
      if (!this.ok('goal', 0.3)) return;
      const notes = good ? [523.25, 659.25, 783.99, 1046.5] : [440, 349.23, 293.66, 220];
      notes.forEach((n, i) => {
        this.tone(n, 0, 0.26, 'square', 0.09, i * 0.085);
        this.tone(n * 2, 0, 0.2, 'triangle', 0.07, i * 0.085);
      });
      this.noise(0.7, 0.28, 900, 0.7, 0, 'lowpass');
    },
    beep(hi) {
      if (!this.ok(hi ? 'beepHi' : 'beep', 0.1)) return;
      this.tone(hi ? 1046.5 : 659.25, 0, hi ? 0.32 : 0.13, 'sine', 0.3);
      if (hi) this.tone(1567.98, 0, 0.32, 'triangle', 0.12);
    },
    clack(k) {
      if (!this.ok('clack', 0.05)) return;
      this.tone(900 + k * 500, 500, 0.05, 'square', 0.08 + k * 0.15);
      this.noise(0.03, 0.15 + k * 0.25, 4200, 2);
    },
    tick(urgent) {
      if (!this.ok('tick', 0.3)) return;
      this.tone(urgent ? 1318.5 : 988, 0, 0.07, 'square', urgent ? 0.14 : 0.08);
    },
    frenzy() {
      if (!this.ok('frenzy', 1)) return;
      this.tone(220, 1760, 0.6, 'sawtooth', 0.08);
      this.tone(330, 2640, 0.6, 'square', 0.05);
      [659.25, 830.61, 987.77, 1318.5].forEach((n, i) => this.tone(n, 0, 0.22, 'triangle', 0.14, 0.45 + i * 0.07));
      this.noise(0.6, 0.2, 2000, 0.5, 0, 'highpass');
    },
    buzzer() {
      if (!this.ok('buzzer', 1)) return;
      this.tone(155.56, 0, 0.9, 'sawtooth', 0.16);
      this.tone(233.08, 0, 0.9, 'square', 0.08);
    },
    finale(win) {
      if (!this.ctx || !settings.sound) return;
      const seq = win
        ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5]
        : [392, 369.99, 349.23, 329.63, 261.63];
      seq.forEach((n, i) => {
        const long = i === seq.length - 1;
        this.tone(n, 0, long ? 0.7 : 0.18, win ? 'square' : 'sawtooth', win ? 0.09 : 0.06, i * 0.13);
        this.tone(n / 2, 0, long ? 0.7 : 0.18, 'triangle', 0.1, i * 0.13);
      });
    },
  };

  function vibrate(ms) {
    if (lastInputTouch && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* yok say */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Tuval ve ölçekleme
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  let S = 1; // mantıksal birim başına cihaz pikseli
  let tableLayer = null, puckSprite = null;
  let malletSprites = [], glowSprites = [];

  function makeLayer(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * S));
    c.height = Math.max(1, Math.ceil(h * S));
    const g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0);
    return [c, g];
  }

  function resize() {
    const cs = getComputedStyle(stage);
    const aw = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const scale = Math.max(0.1, Math.min(aw / LW, ah / LH));
    const cssW = Math.floor(LW * scale), cssH = Math.floor(LH * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.borderRadius = Math.round(44 * scale) + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    S = canvas.width / LW;
    buildTable();
    buildSprites();
  }

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Statik masa katmanı: yalnızca boyut değiştiğinde yeniden çizilir.
  function buildTable() {
    const [c, g] = makeLayer(LW, LH);
    tableLayer = c;

    // Dış çerçeve
    rr(g, 0, 0, LW, LH, 44);
    const fr = g.createLinearGradient(0, 0, LW, LH);
    fr.addColorStop(0, '#20264c');
    fr.addColorStop(0.5, '#0f1229');
    fr.addColorStop(1, '#1d2046');
    g.fillStyle = fr;
    g.fill();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.09)';
    g.stroke();
    rr(g, B - 7, B - 7, W + 14, H + 14, 32);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.stroke();

    g.save();
    g.translate(B, B);

    // Oyun yüzeyi
    rr(g, 0, 0, W, H, 26);
    const sg = g.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, H * 0.72);
    sg.addColorStop(0, '#18225e');
    sg.addColorStop(0.55, '#0c1339');
    sg.addColorStop(1, '#050920');
    g.fillStyle = sg;
    g.fill();

    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();

    // Yarı alan renk tonları
    const tTop = g.createLinearGradient(0, 0, 0, H / 2);
    tTop.addColorStop(0, `rgba(${COLORS[1].rgb},0.16)`);
    tTop.addColorStop(1, `rgba(${COLORS[1].rgb},0)`);
    g.fillStyle = tTop;
    g.fillRect(0, 0, W, H / 2);
    const tBot = g.createLinearGradient(0, H, 0, H / 2);
    tBot.addColorStop(0, `rgba(${COLORS[0].rgb},0.16)`);
    tBot.addColorStop(1, `rgba(${COLORS[0].rgb},0)`);
    g.fillStyle = tBot;
    g.fillRect(0, H / 2, W, H / 2);

    // Hava delikleri
    g.fillStyle = 'rgba(170,195,255,0.13)';
    g.beginPath();
    const step = 27;
    for (let row = 0, y = step / 2; y < H; y += step, row++) {
      for (let x = step / 2 + (row % 2) * (step / 2); x < W; x += step) {
        g.moveTo(x + 1.4, y);
        g.arc(x, y, 1.4, 0, TAU);
      }
    }
    g.fill();

    // Buz parlaması
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.25, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.045)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.62, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(0.7, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);

    // Çizgiler (neon parıltılı)
    g.shadowBlur = 16 * S;
    g.lineCap = 'round';

    g.shadowColor = 'rgba(175,130,255,0.95)';
    g.strokeStyle = 'rgba(215,195,255,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();

    g.beginPath();
    g.arc(W / 2, H / 2, 80, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(155,107,255,0.06)';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(215,195,255,0.25)';
    g.beginPath();
    g.arc(W / 2, H / 2, 66, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(225,210,255,0.8)';
    g.beginPath();
    g.arc(W / 2, H / 2, 6, 0, TAU);
    g.fill();

    // Kale yarım daireleri
    [[1, 0, 0, Math.PI], [0, H, Math.PI, TAU]].forEach(([ci, y, a0, a1]) => {
      const col = COLORS[ci];
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.strokeStyle = `rgba(${col.rgb},0.7)`;
      g.fillStyle = `rgba(${col.rgb},0.07)`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(W / 2, y, 118, a0, a1);
      g.fill();
      g.stroke();
      g.lineWidth = 1.5;
      g.strokeStyle = `rgba(${col.rgb},0.3)`;
      g.beginPath();
      g.arc(W / 2, y, 60, a0, a1);
      g.stroke();
    });

    // Köşe işaretleri
    g.shadowColor = 'rgba(175,130,255,0.9)';
    g.strokeStyle = 'rgba(215,195,255,0.28)';
    g.lineWidth = 2;
    [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 34, 0, TAU);
      g.stroke();
    });

    g.restore(); // clip

    // Neon iç kenar
    g.shadowBlur = 22 * S;
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, COLORS[1].main);
    edge.addColorStop(0.5, '#9b6bff');
    edge.addColorStop(1, COLORS[0].main);
    g.shadowColor = 'rgba(155,107,255,0.9)';
    g.strokeStyle = edge;
    g.lineWidth = 4;
    rr(g, 0, 0, W, H, 26);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    rr(g, 0, 0, W, H, 26);
    g.stroke();

    // Kale ağızları (çerçeveye oyulmuş)
    [[1, -B + 5, 0], [0, H - 2, H]].forEach(([ci, y, ly]) => {
      const col = COLORS[ci];
      const inner = g.createLinearGradient(0, y, 0, y + B - 3);
      if (ci === 1) {
        inner.addColorStop(0, '#000');
        inner.addColorStop(1, `rgba(${col.rgb},0.35)`);
      } else {
        inner.addColorStop(0, `rgba(${col.rgb},0.35)`);
        inner.addColorStop(1, '#000');
      }
      rr(g, GOAL_L, y, GOAL_W, B - 3, 6);
      g.fillStyle = '#02030a';
      g.fill();
      g.fillStyle = inner;
      g.fill();
      g.shadowBlur = 18 * S;
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.strokeStyle = col.light;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(GOAL_L + 4, ly);
      g.lineTo(GOAL_R - 4, ly);
      g.stroke();
      g.fillStyle = '#fff';
      for (const x of [GOAL_L, GOAL_R]) {
        g.beginPath();
        g.arc(x, ly, 4.5, 0, TAU);
        g.fill();
      }
      g.shadowBlur = 0;
    });

    g.restore();
  }

  const MS_PAD = 30, MS = (MALLET_R + MS_PAD) * 2;
  const PS_PAD = 28, PS = (PUCK_R + PS_PAD) * 2;

  function buildSprites() {
    malletSprites = COLORS.map(buildMallet);
    glowSprites = COLORS.map((col) => {
      const [c, g] = makeLayer(MS, MS);
      const r = MS / 2;
      const gr = g.createRadialGradient(r, r, MALLET_R * 0.6, r, r, r);
      gr.addColorStop(0, `rgba(${col.rgb},0.9)`);
      gr.addColorStop(0.45, `rgba(${col.rgb},0.35)`);
      gr.addColorStop(1, `rgba(${col.rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, MS, MS);
      return c;
    });
    puckSprite = buildPuck();
  }

  function buildMallet(col) {
    const [c, g] = makeLayer(MS, MS);
    const R = MALLET_R;
    g.translate(MS / 2, MS / 2);

    // Gölge
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.75)';
    g.shadowBlur = 14 * S;
    g.shadowOffsetX = 4 * S;
    g.shadowOffsetY = 8 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, R - 2, 0, TAU);
    g.fill();
    g.restore();

    // Hale
    const halo = g.createRadialGradient(0, 0, R * 0.85, 0, 0, R + MS_PAD);
    halo.addColorStop(0, `rgba(${col.rgb},0.5)`);
    halo.addColorStop(1, `rgba(${col.rgb},0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, R + MS_PAD, 0, TAU);
    g.fill();

    // Gövde
    const base = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    base.addColorStop(0, col.light);
    base.addColorStop(0.45, col.main);
    base.addColorStop(1, col.dark);
    g.fillStyle = base;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(0, 0, R - 1.5, 0, TAU);
    g.stroke();

    // İç çukur
    const well = g.createRadialGradient(R * 0.2, R * 0.25, R * 0.05, 0, 0, R * 0.66);
    well.addColorStop(0, col.main);
    well.addColorStop(1, col.dark);
    g.fillStyle = well;
    g.beginPath();
    g.arc(0, 0, R * 0.66, 0, TAU);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.stroke();

    // Tutamak
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.arc(2.5, 4, R * 0.42, 0, TAU);
    g.fill();
    const knob = g.createRadialGradient(-R * 0.14, -R * 0.17, 1, 0, 0, R * 0.42);
    knob.addColorStop(0, '#ffffff');
    knob.addColorStop(0.35, col.light);
    knob.addColorStop(1, col.main);
    g.fillStyle = knob;
    g.beginPath();
    g.arc(0, 0, R * 0.42, 0, TAU);
    g.fill();

    // Parlama
    g.fillStyle = 'rgba(255,255,255,0.38)';
    g.beginPath();
    g.ellipse(-R * 0.38, -R * 0.48, R * 0.34, R * 0.14, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  function buildPuck() {
    const [c, g] = makeLayer(PS, PS);
    const r = PUCK_R;
    g.translate(PS / 2, PS / 2);

    g.save();
    g.shadowColor = 'rgba(0,0,0,0.7)';
    g.shadowBlur = 10 * S;
    g.shadowOffsetX = 3 * S;
    g.shadowOffsetY = 6 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.fill();
    g.restore();

    const halo = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r + PS_PAD);
    halo.addColorStop(0, `rgba(${PUCK_RGB},0.55)`);
    halo.addColorStop(1, `rgba(${PUCK_RGB},0)`);
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD, 0, TAU);
    g.fill();

    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#3a3f60');
    body.addColorStop(1, '#0b0d1a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();

    g.shadowBlur = 10 * S;
    g.shadowColor = `rgba(${PUCK_RGB},1)`;
    g.strokeStyle = '#fff1b0';
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(0, 0, r - 2, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = `rgba(${PUCK_RGB},0.55)`;
    g.beginPath();
    g.arc(0, 0, r * 0.52, 0, TAU);
    g.stroke();
    g.shadowBlur = 0;

    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.32, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // ---------------------------------------------------------------------------
  // Oyun durumu
  // ---------------------------------------------------------------------------
  const game = {
    state: 'demo',          // demo | countdown | play | goal | paused | over
    resumeState: 'play',
    score: [0, 0],
    pulse: [0, 0],
    timer: 0,
    count: 0,
    time: 0,
    clock: MATCH_TIME,      // kalan süre (sn); yalnızca oyun akarken azalır
    frenzy: false,          // ikinci top oyunda mı
    shake: 0,
    flash: 0,
    flashRgb: '255,255,255',
    banner: null,
  };

  function makePuck() {
    return {
      x: W / 2, y: H / 2, vx: 0, vy: 0,
      active: false,        // fizikte yer alıyor mu
      visible: true,        // çiziliyor mu (pasifken yanıp söner)
      blink: 0,             // > 0: yanıp sönerek oyuna girmeyi bekliyor
      respawn: 0,           // > 0: gol sonrası gizli bekleme
      respawnSide: -1,
      launch: null,         // oyuna girerken verilecek hız
      trail: [],
      stuck: 0,
    };
  }

  const pucks = [makePuck()];

  function makeMallet(i) {
    return {
      i, bottom: i === 0,
      x: W / 2, y: homeY(i), vx: 0, vy: 0,
      tx: W / 2, ty: homeY(i),
      ai: true, level: AI_LEVELS.medium,
      aiTx: W / 2, aiTy: homeY(i), avx: 0, avy: 0,
      aiTimer: 0, aiMode: '', aimX: W / 2, charge: false,
      glow: 0, hitCool: 0,
    };
  }

  function homeY(i) {
    return i === 0 ? H - 110 : 110;
  }

  const mallets = [makeMallet(0), makeMallet(1)];

  function clampPos(m, x, y) {
    x = clamp(x, MALLET_R, W - MALLET_R);
    y = m.bottom ? clamp(y, H / 2 + CENTER_GAP, H - MALLET_R) : clamp(y, MALLET_R, H / 2 - CENTER_GAP);
    return [x, y];
  }

  function resetMallet(m) {
    m.x = m.tx = m.aiTx = W / 2;
    m.y = m.ty = m.aiTy = homeY(m.i);
    m.vx = m.vy = m.avx = m.avy = 0;
    m.aiMode = '';
    m.charge = false;
  }

  function placePuck(p, side) {
    // side: 0 = alt yarı, 1 = üst yarı, -1 = orta
    p.x = W / 2;
    p.y = side === 0 ? H * 0.7 : side === 1 ? H * 0.3 : H / 2;
    // Aynı noktada başka bir pak varsa yana kaydır
    for (const o of pucks) {
      if (o !== p && o.visible && Math.hypot(o.x - p.x, o.y - p.y) < PUCK_R * 2 + 16) {
        p.x += o.x < W / 2 ? 90 : -90;
      }
    }
    p.vx = p.vy = 0;
    p.trail.length = 0;
    p.stuck = 0;
    p.blink = 0;
    p.respawn = 0;
    p.launch = null;
  }

  // ---------------------------------------------------------------------------
  // Efektler
  // ---------------------------------------------------------------------------
  const particles = [];
  const ripples = [];

  function spawn(x, y, rgb, count, speed, life, size, opts = {}) {
    for (let i = 0; i < count; i++) {
      if (particles.length > 500) particles.shift();
      const a = opts.dir !== undefined ? opts.dir + rand(-opts.spread, opts.spread) : rand(0, TAU);
      const sp = speed * rand(0.25, 1);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1), max: life,
        size: size * rand(0.5, 1),
        rgb, spark: !!opts.spark, g: opts.gravity || 0,
      });
    }
  }

  function ripple(x, y, rgb, r0, r1, dur, w) {
    ripples.push({ x, y, rgb, r0, r1, dur, w, t: 0 });
  }

  function banner(text, rgb, dur, size) {
    game.banner = { text, rgb, dur, size, t: 0 };
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const k = Math.exp(-2.6 * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t >= ripples[i].dur) ripples.splice(i, 1);
    }
    if (game.banner) {
      game.banner.t += dt;
      if (game.banner.t >= game.banner.dur) game.banner = null;
    }
    game.shake *= Math.exp(-9 * dt);
    game.flash *= Math.exp(-4 * dt);
    for (let i = 0; i < 2; i++) {
      game.pulse[i] = Math.max(0, game.pulse[i] - dt * 0.9);
      mallets[i].glow = Math.max(0, mallets[i].glow - dt * 3.5);
      mallets[i].hitCool -= dt;
    }

    // İz
    for (const p of pucks) {
      if (p.active) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > 36) p.trail.splice(0, 2);
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 1300 && Math.random() < 0.7) {
          spawn(p.x, p.y, sp > 1800 ? '255,140,70' : PUCK_RGB, 1, 120, 0.35, 2.6);
        }
      } else if (p.trail.length) {
        p.trail.splice(0, 2);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fizik
  // ---------------------------------------------------------------------------
  function collideMallet(p, m) {
    const dx = p.x - m.x, dy = p.y - m.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= MIN_D * MIN_D) return 0;
    let d = Math.sqrt(d2), nx, ny;
    if (d < 1e-6) { nx = 0; ny = m.bottom ? -1 : 1; d = 0; } else { nx = dx / d; ny = dy / d; }
    p.x = m.x + nx * MIN_D;
    p.y = m.y + ny * MIN_D;
    const vn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
    if (vn < 0) {
      p.vx -= (1 + MALLET_E) * vn * nx;
      p.vy -= (1 + MALLET_E) * vn * ny;
      m.hx = m.x + nx * MALLET_R;
      m.hy = m.y + ny * MALLET_R;
      return -vn;
    }
    return 0;
  }

  function collideWalls(p) {
    let imp = 0;
    if (p.x < PUCK_R) {
      p.x = PUCK_R;
      if (p.vx < 0) { imp = -p.vx; p.vx = -p.vx * WALL_E; }
    } else if (p.x > W - PUCK_R) {
      p.x = W - PUCK_R;
      if (p.vx > 0) { imp = p.vx; p.vx = -p.vx * WALL_E; }
    }
    const inMouth = p.x > GOAL_L && p.x < GOAL_R;
    if (!inMouth) {
      if (p.y < PUCK_R) {
        p.y = PUCK_R;
        if (p.vy < 0) { imp = Math.max(imp, -p.vy); p.vy = -p.vy * WALL_E; }
      } else if (p.y > H - PUCK_R) {
        p.y = H - PUCK_R;
        if (p.vy > 0) { imp = Math.max(imp, p.vy); p.vy = -p.vy * WALL_E; }
      }
    }
    for (const [qx, qy] of POSTS) {
      const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
      if (d2 < PUCK_R * PUCK_R && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        p.x = qx + nx * PUCK_R;
        p.y = qy + ny * PUCK_R;
        const vn = p.vx * nx + p.vy * ny;
        if (vn < 0) {
          p.vx -= (1 + WALL_E) * vn * nx;
          p.vy -= (1 + WALL_E) * vn * ny;
          imp = Math.max(imp, -vn);
        }
      }
    }
    return imp;
  }

  // İki pak arasında eşit kütleli esnek çarpışma.
  function collidePucks(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, md = PUCK_R * 2;
    if (d2 >= md * md || d2 < 1e-9) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (md - d) / 2;
    a.x -= nx * ov;
    a.y -= ny * ov;
    b.x += nx * ov;
    b.y += ny * ov;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn < 0) {
      const j = (-(1 + PUCK_E) * vn) / 2;
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
      return -vn;
    }
    return 0;
  }

  // Pak duvara sıkıştıysa raketi geri it (içinden geçmesin).
  function resolvePin(p, m) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy);
    if (d < MIN_D - 0.5 && d > 1e-6) {
      const push = MIN_D - d;
      m.x -= (dx / d) * push;
      m.y -= (dy / d) * push;
    }
  }

  function stepPhysics(dt) {
    const plan = mallets.map((m) => {
      let ex, ey;
      if (m.ai) {
        m.aiTimer -= dt;
        if (m.aiTimer <= 0) {
          aiThink(m);
          m.aiTimer = m.level.think * rand(0.7, 1.3);
        }
        [ex, ey] = aiMove(m, dt);
      } else {
        applyKeyboard(m, dt);
        ex = m.tx;
        ey = m.ty;
      }
      [ex, ey] = clampPos(m, ex, ey);
      let vx = (ex - m.x) / dt, vy = (ey - m.y) / dt;
      const v = Math.hypot(vx, vy);
      if (v > MAX_MALLET_V) { vx *= MAX_MALLET_V / v; vy *= MAX_MALLET_V / v; }
      m.vx = vx;
      m.vy = vy;
      if (m.ai) { m.avx = vx; m.avy = vy; }
      return { sx: m.x, sy: m.y, ex, ey };
    });

    const h = dt / SUBSTEPS;
    const hits = [0, 0];
    let wallImp = 0, wx = 0, wy = 0;
    let puckImp = 0, cx = 0, cy = 0;
    const goals = [];

    for (let s = 1; s <= SUBSTEPS; s++) {
      const f = s / SUBSTEPS;
      for (let k = 0; k < 2; k++) {
        const m = mallets[k], pl = plan[k];
        m.x = lerp(pl.sx, pl.ex, f);
        m.y = lerp(pl.sy, pl.ey, f);
      }

      for (const p of pucks) {
        if (!p.active) continue;
        p.x += p.vx * h;
        p.y += p.vy * h;
        for (let k = 0; k < 2; k++) {
          const imp = collideMallet(p, mallets[k]);
          if (imp > hits[k]) hits[k] = imp;
        }
      }

      for (let i = 0; i < pucks.length; i++) {
        for (let j = i + 1; j < pucks.length; j++) {
          if (!pucks[i].active || !pucks[j].active) continue;
          const imp = collidePucks(pucks[i], pucks[j]);
          if (imp > puckImp) {
            puckImp = imp;
            cx = (pucks[i].x + pucks[j].x) / 2;
            cy = (pucks[i].y + pucks[j].y) / 2;
          }
        }
      }

      for (const p of pucks) {
        if (!p.active) continue;
        const w = collideWalls(p);
        if (w > wallImp) { wallImp = w; wx = p.x; wy = p.y; }
        resolvePin(p, mallets[0]);
        resolvePin(p, mallets[1]);

        const sp = Math.hypot(p.vx, p.vy);
        if (sp > MAX_PUCK) { p.vx *= MAX_PUCK / sp; p.vy *= MAX_PUCK / sp; }

        if (p.y < 0 || p.y > H) {
          p.active = false;
          goals.push([p.y < 0 ? 0 : 1, p]);
        }
      }
    }

    const k = Math.exp(-DAMPING * dt);
    for (const p of pucks) {
      if (!p.active) continue;
      p.vx *= k;
      p.vy *= k;
      if (!Number.isFinite(p.x + p.y + p.vx + p.vy)) placePuck(p, -1);
    }

    for (let i = 0; i < 2; i++) if (hits[i] > 50) onMalletHit(mallets[i], hits[i]);
    if (wallImp > 90) onWallHit(wx, wy, wallImp);
    if (puckImp > 90) onPuckHit(cx, cy, puckImp);
    for (const [scorer, p] of goals) onGoal(scorer, p);
  }

  function onMalletHit(m, imp) {
    const k = clamp(imp / 1800, 0, 1);
    m.glow = Math.max(m.glow, 0.35 + k * 0.65);
    if (m.hitCool > 0) return;
    m.hitCool = 0.06;
    const col = COLORS[m.i];
    const dir = Math.atan2(m.hy - m.y, m.hx - m.x);
    spawn(m.hx, m.hy, col.rgb, 6 + Math.round(k * 18), 260 + k * 700, 0.45, 3, { dir, spread: 1.1, spark: true });
    spawn(m.hx, m.hy, '255,255,255', 3 + Math.round(k * 6), 200 + k * 300, 0.3, 2.2, { dir, spread: 0.8, spark: true });
    if (k > 0.35) ripple(m.hx, m.hy, col.rgb, 10, 50 + k * 50, 0.35, 3);
    game.shake = Math.max(game.shake, k * 5);
    Sound.hit(k);
    if (!m.ai) vibrate(Math.round(6 + k * 18));
  }

  function onWallHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, PUCK_RGB, 6, 30 + k * 40, 0.4, 2.5);
    if (k > 0.2) spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 350, 0.35, 2.4, { spark: true });
    Sound.wall(k);
  }

  function onPuckHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, '255,255,255', 8, 40 + k * 40, 0.35, 3);
    spawn(x, y, '255,255,255', Math.round(4 + k * 10), 200 + k * 400, 0.35, 2.4, { spark: true });
    spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 300, 0.4, 2.4, { spark: true });
    Sound.clack(k);
  }

  function onGoal(scorer, p) {
    const col = COLORS[scorer];
    const gx = clamp(p.x, GOAL_L + 10, GOAL_R - 10);
    const gy = scorer === 0 ? 0 : H;
    p.active = false;
    p.visible = false;

    const dir = scorer === 0 ? Math.PI / 2 : -Math.PI / 2;
    spawn(gx, gy, col.rgb, 70, 1100, 1.1, 4, { dir, spread: 1.25, spark: true });
    spawn(gx, gy, PUCK_RGB, 30, 700, 0.9, 3.5, { dir, spread: 1.4 });
    spawn(gx, gy, '255,255,255', 20, 500, 0.6, 2.5, { dir, spread: 1.5, spark: true });
    ripple(gx, gy, col.rgb, 20, 300, 0.8, 8);
    ripple(gx, gy, '255,255,255', 10, 180, 0.5, 3);
    game.flash = 1;
    game.flashRgb = col.rgb;
    game.shake = 16;

    if (game.state === 'demo') {
      game.timer = 1.1;
      return;
    }

    game.score[scorer]++;
    game.pulse[scorer] = 1;
    game.lastScorer = scorer;
    Sound.goal(settings.mode === 'pvp' || scorer === 0);
    vibrate([40, 40, 80]);

    if (game.frenzy) {
      // İki toplu bölümde oyun durmaz: yenen pak kısa süre sonra geri gelir.
      banner('GOL!', col.rgb, 1.1, 150);
      p.respawn = 0.8;
      p.respawnSide = 1 - scorer;
      return;
    }

    banner('GOL!', col.rgb, 1.5, 150);
    game.state = 'goal';
    game.timer = 1.6;
  }

  // ---------------------------------------------------------------------------
  // Yapay zekâ
  // ---------------------------------------------------------------------------
  function foldX(x) {
    const lo = PUCK_R, span = W - PUCK_R * 2;
    let t = (x - lo) % (2 * span);
    if (t < 0) t += 2 * span;
    return t <= span ? lo + t : lo + 2 * span - t;
  }

  // İki top varken kalemize en çok tehdit oluşturan paka odaklan.
  function aiTarget(m) {
    let best = null, bestScore = Infinity;
    for (const p of pucks) {
      if (!p.active) continue;
      const ly = m.bottom ? H - p.y : p.y;
      const lvy = m.bottom ? -p.vy : p.vy;
      const score = ly + (lvy < 0 ? lvy * 0.3 : 0);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // Hesaplar raketin kendi yarısı üstteymiş gibi yapılır; alttaki AI için y aynalanır.
  function aiThink(m) {
    const L = m.level;
    const flip = m.bottom;
    const Y = (v) => (flip ? H - v : v);
    const P = aiTarget(m);
    const px = P ? P.x : W / 2, py = P ? Y(P.y) : H / 2;
    const pvx = P ? P.vx : 0, pvy = P ? (flip ? -P.vy : P.vy) : 0;
    const mx = m.x, my = Y(m.y);
    const guardY = 92;
    const limitY = H / 2 - CENTER_GAP;
    let tx, ty, mode, charge = false;

    const noise = rand(-1, 1) * L.noise;
    const inOurHalf = py < H / 2 + PUCK_R * 0.5;

    if (!P) {
      mode = 'idle';
      tx = W / 2;
      ty = guardY;
    } else if (!inOurHalf || (pvy > 260 && py > my)) {
      // Savunma: pak rakip yarıda ya da bizden uzaklaşıyor
      mode = 'defend';
      if (pvy < -40) {
        const t = (py - guardY) / -pvy;
        const hitX = foldX(px + pvx * t) + noise;
        tx = W / 2 + clamp(hitX - W / 2, -GOAL_W * 0.75, GOAL_W * 0.75);
        ty = guardY;
      } else {
        tx = W / 2 + (px - W / 2) * 0.4;
        ty = guardY + 30;
      }
    } else {
      const lead = Math.min(L.predict, Math.hypot(px - mx, py - my) / L.speed);
      const qx = foldX(px + pvx * lead);
      const qy = clamp(py + pvy * lead, PUCK_R, H / 2 + PUCK_R);

      if (P.stuck > 1.4) {
        // Pak uzun süredir yavaş: doğrudan üzerine git
        mode = 'poke';
        tx = qx;
        ty = qy - 6;
        charge = true;
      } else if (pvy < -380 && py > my - 6) {
        // Hızla kalemize geliyor: yolunu kes, yakınsa karşı vuruş yap
        mode = 'block';
        const t = (py - guardY) / -pvy;
        tx = foldX(px + pvx * t) + noise;
        ty = guardY;
        if (L.counter && Math.hypot(px - mx, py - my) < MIN_D * 2.2) {
          tx = px;
          ty = py;
          charge = true;
        }
      } else if (qy < my - 6) {
        // Pak arkamızda: yanından dolan
        mode = 'around';
        let side = mx < qx ? -1 : 1;
        let sx = qx + side * (MIN_D + 10);
        if (sx < MALLET_R || sx > W - MALLET_R) { side = -side; sx = qx + side * (MIN_D + 10); }
        tx = sx;
        ty = Math.abs(mx - sx) > 20 ? Math.max(my, qy) : qy - MIN_D * 0.7;
      } else {
        // Hücum: pakın arkasına geç, sonra kaleye doğru vur
        mode = 'attack';
        if (m.aiMode !== 'attack') {
          const spread = GOAL_W * 0.3 + L.aimErr * 150;
          m.aimX = W / 2 + rand(-spread, spread);
          if (Math.random() < L.bank) m.aimX = Math.random() < 0.5 ? -W / 2 : W * 1.5; // bant vuruşu
        }
        let ux = m.aimX - qx, uy = H + 60 - qy;
        const ul = Math.hypot(ux, uy) || 1;
        ux /= ul;
        uy /= ul;
        const setX = clamp(qx - ux * (MIN_D + 10), MALLET_R, W - MALLET_R);
        const setY = clamp(qy - uy * (MIN_D + 10), MALLET_R, limitY);
        const rx = mx - qx, ry = my - qy;
        const along = rx * ux + ry * uy;
        const perp = Math.abs(-rx * uy + ry * ux);
        const atSetup = Math.hypot(mx - setX, my - setY) < 12;
        if ((along < -MIN_D * 0.6 && perp < MIN_D * 0.45) || atSetup) {
          tx = qx + ux * MIN_D * 1.2;
          ty = qy + uy * MIN_D * 1.2;
          charge = true;
        } else {
          tx = setX;
          ty = setY;
        }
      }
    }

    m.aiMode = mode;
    m.charge = charge;
    m.aiTx = clamp(tx, MALLET_R, W - MALLET_R);
    m.aiTy = Y(clamp(ty, MALLET_R, limitY));
  }

  function aiMove(m, dt) {
    const L = m.level;
    const dx = m.aiTx - m.x, dy = m.aiTy - m.y;
    const d = Math.hypot(dx, dy);
    const maxV = L.speed * (m.charge ? L.strike : 1);
    let dvx = 0, dvy = 0;
    if (d > 0.5) {
      const sp = Math.min(maxV, d * 9);
      dvx = (dx / d) * sp;
      dvy = (dy / d) * sp;
    }
    let ax = dvx - m.avx, ay = dvy - m.avy;
    const al = Math.hypot(ax, ay), maxA = L.accel * dt;
    if (al > maxA) { ax *= maxA / al; ay *= maxA / al; }
    m.avx += ax;
    m.avy += ay;
    return [m.x + m.avx * dt, m.y + m.avy * dt];
  }

  // ---------------------------------------------------------------------------
  // Girdi
  // ---------------------------------------------------------------------------
  const keys = new Set();
  const pointerOwner = new Map();
  let lastInputTouch = false;

  function toField(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * LW - B,
      y: ((e.clientY - r.top) / r.height) * LH - B,
    };
  }

  function inputActive() {
    return game.state === 'play' || game.state === 'countdown' || game.state === 'goal';
  }

  function setTarget(idx, p) {
    const m = mallets[idx];
    if (m.ai) return;
    [m.tx, m.ty] = clampPos(m, p.x, p.y);
  }

  stage.addEventListener('pointerdown', (e) => {
    if (!inputActive()) return;
    e.preventDefault();
    lastInputTouch = e.pointerType !== 'mouse';
    Sound.init();
    const p = toField(e);
    const idx = settings.mode === 'pvp' && e.pointerType !== 'mouse' && p.y < H / 2 ? 1 : 0;
    pointerOwner.set(e.pointerId, idx);
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    setTarget(idx, p);
  });

  window.addEventListener('pointermove', (e) => {
    if (!inputActive()) return;
    let idx = pointerOwner.get(e.pointerId);
    if (idx === undefined) {
      if (e.pointerType !== 'mouse') return;
      idx = 0;
    }
    if (e.pointerType === 'mouse') lastInputTouch = false;
    setTarget(idx, toField(e));
  });

  const release = (e) => pointerOwner.delete(e.pointerId);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  // iOS: kaydırma / yakınlaştırma hareketlerini engelle
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest || !e.target.closest('.overlay')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  const KEY_MOVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      togglePause();
      return;
    }
    if (e.code === 'KeyM') {
      toggleSound();
      return;
    }
    if ((e.code === 'Enter' || e.code === 'Space') && menuEl.classList.contains('show')) {
      e.preventDefault();
      startMatch();
      return;
    }
    if (KEY_MOVE.includes(e.code)) {
      e.preventDefault();
      keys.add(e.code);
      lastInputTouch = false;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  function applyKeyboard(m, dt) {
    let dx = 0, dy = 0;
    const arrows = m.i === 0;
    const wasd = m.i === 1 || settings.mode === 'ai';
    if (arrows) {
      if (keys.has('ArrowLeft')) dx--;
      if (keys.has('ArrowRight')) dx++;
      if (keys.has('ArrowUp')) dy--;
      if (keys.has('ArrowDown')) dy++;
    }
    if (wasd) {
      if (keys.has('KeyA')) dx--;
      if (keys.has('KeyD')) dx++;
      if (keys.has('KeyW')) dy--;
      if (keys.has('KeyS')) dy++;
    }
    if (!dx && !dy) return;
    const l = Math.hypot(dx, dy), sp = 1050;
    [m.tx, m.ty] = clampPos(m, m.tx + (dx / l) * sp * dt, m.ty + (dy / l) * sp * dt);
  }

  // ---------------------------------------------------------------------------
  // Akış
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const menuEl = $('menu'), pauseEl = $('pauseMenu'), overEl = $('overMenu');
  const pauseBtn = $('pauseBtn'), soundBtn = $('soundBtn'), fsBtn = $('fsBtn');

  const clockEl = $('clock'), clockTime = $('clockTime'), clockTag = $('clockTag');
  let clockShown = '';

  function showOverlay(el) {
    [menuEl, pauseEl, overEl].forEach((o) => o.classList.toggle('show', o === el));
    const inGame = !el;
    pauseBtn.classList.toggle('hidden', !inGame);
    document.body.classList.toggle('playing', inGame);
  }

  function launchPuck(p, speed) {
    const a = rand(0.35, Math.PI - 0.35) * (Math.random() < 0.5 ? 1 : -1);
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
  }

  function startDemo() {
    game.state = 'demo';
    mallets.forEach((m) => {
      m.ai = true;
      m.level = AI_LEVELS.medium;
      resetMallet(m);
    });
    pucks.length = 1;
    const p = pucks[0];
    placePuck(p, -1);
    p.active = true;
    p.visible = true;
    launchPuck(p, 600);
    game.score = [0, 0];
    game.banner = null;
    clockEl.classList.add('hidden');
    showOverlay(menuEl);
  }

  function startMatch() {
    Sound.init();
    game.score = [0, 0];
    game.pulse = [0, 0];
    game.clock = MATCH_TIME;
    game.frenzy = false;
    pucks.length = 1;
    mallets.forEach(resetMallet);
    mallets[0].ai = false;
    mallets[1].ai = settings.mode === 'ai';
    mallets[1].level = AI_LEVELS[settings.difficulty] || AI_LEVELS.medium;
    pointerOwner.clear();
    particles.length = 0;
    ripples.length = 0;
    clockEl.classList.remove('hidden');
    updateClock();
    showOverlay(null);
    serve(Math.random() < 0.5 ? 0 : 1);
  }

  function serve(side) {
    const p = pucks[0];
    placePuck(p, side);
    p.active = false;
    p.visible = true;
    game.state = 'countdown';
    game.count = 3;
    game.timer = 0.55;
    banner('3', '155,107,255', 0.55, 160);
    Sound.beep(false);
  }

  // 45. saniye: ikinci top ortadan oyuna girer.
  function startFrenzy() {
    game.frenzy = true;
    const p = makePuck();
    pucks.push(p);
    placePuck(p, -1);
    p.visible = true;
    p.blink = 1.0;
    p.launch = 450;
    banner('2. TOP!', PUCK_RGB, 1.6, 120);
    ripple(p.x, p.y, PUCK_RGB, 20, 260, 0.9, 7);
    ripple(p.x, p.y, '255,255,255', 10, 160, 0.6, 3);
    spawn(p.x, p.y, PUCK_RGB, 40, 800, 0.9, 3.5, { spark: true });
    game.flash = 0.7;
    game.flashRgb = PUCK_RGB;
    game.shake = 8;
    Sound.frenzy();
    vibrate([30, 30, 30, 30, 60]);
  }

  function updateClock() {
    const left = Math.max(0, Math.ceil(game.clock));
    const elapsed = MATCH_TIME - game.clock;
    const soon = !game.frenzy && elapsed >= SECOND_PUCK_AT - 5;
    const key = left + (game.frenzy ? 'f' : soon ? 's' : '');
    if (key === clockShown) return;
    clockShown = key;
    clockTime.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    clockEl.classList.toggle('frenzy', game.frenzy);
    clockEl.classList.toggle('soon', soon);
    clockEl.classList.toggle('final', left <= 10);
    clockTag.textContent = game.frenzy ? '2 TOP' : soon ? '2. TOP GELİYOR' : '';
  }

  function updatePucks(dt) {
    for (const p of pucks) {
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          placePuck(p, p.respawnSide);
          p.visible = true;
          p.blink = 0.9;
        }
      } else if (p.blink > 0) {
        p.blink -= dt;
        if (p.blink <= 0) {
          p.active = true;
          if (p.launch) launchPuck(p, p.launch);
          p.launch = null;
          Sound.beep(true);
        }
      }
      // Takılı pak algılama (AI için)
      if (p.active && Math.hypot(p.vx, p.vy) < 40) p.stuck += dt;
      else p.stuck = 0;
    }
  }

  function update(dt) {
    game.time += dt;
    updateEffects(dt);
    const st = game.state;
    if (st === 'paused' || st === 'over') return;

    if (st === 'countdown') {
      game.timer -= dt;
      if (game.timer <= 0) {
        game.count--;
        if (game.count > 0) {
          game.timer = 0.55;
          banner(String(game.count), '155,107,255', 0.55, 160);
          Sound.beep(false);
        } else {
          game.state = 'play';
          pucks[0].active = true;
          banner('BAŞLA!', PUCK_RGB, 0.7, 96);
          Sound.beep(true);
        }
      }
    } else if (st === 'goal') {
      game.timer -= dt;
      if (game.timer <= 0) serve(1 - game.lastScorer);
    } else if (st === 'play') {
      // Süre yalnızca oyun akarken işler
      const before = Math.ceil(game.clock);
      game.clock -= dt;
      const now = Math.ceil(game.clock);
      if (!game.frenzy && MATCH_TIME - game.clock >= SECOND_PUCK_AT) startFrenzy();
      if (now !== before && now <= 10 && now > 0) Sound.tick(now <= 3);
      if (game.clock <= 0) {
        game.clock = 0;
        updateClock();
        endMatch();
        return;
      }
      updatePucks(dt);
    } else if (st === 'demo') {
      const p = pucks[0];
      if (!p.active) {
        game.timer -= dt;
        if (game.timer <= 0) {
          placePuck(p, -1);
          p.active = true;
          p.visible = true;
          launchPuck(p, 500);
        }
      }
      updatePucks(dt);
    }

    if (st !== 'demo') updateClock();
    stepPhysics(dt);
  }

  function endMatch() {
    game.state = 'over';
    pucks.forEach((p) => { p.active = false; });
    const [a, b] = game.score;
    const draw = a === b;
    const w = a > b ? 0 : 1;
    const pvp = settings.mode === 'pvp';
    const win = !draw && (pvp || w === 0);
    const title = $('resultTitle');
    if (draw) {
      title.className = 'title';
      title.textContent = 'BERABERE';
      $('resultIcon').textContent = '🤝';
    } else {
      title.className = 'title ' + (pvp ? (w === 0 ? 'win' : 'pink') : win ? 'win' : 'lose');
      title.textContent = pvp ? `${COLORS[w].name} KAZANDI!` : win ? 'KAZANDIN!' : 'KAYBETTİN';
      $('resultIcon').textContent = win ? '🏆' : '💔';
    }
    $('finalP1').textContent = a;
    $('finalP2').textContent = b;
    const diffName = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[settings.difficulty];
    $('resultSub').textContent = draw
      ? 'Süre bitti, kimse üstün gelemedi. Rövanş?'
      : pvp
        ? 'Rövanş?'
        : win
          ? (settings.difficulty === 'hard' ? 'Efsane! Zor yapay zekâyı yendin.' : `${diffName} seviyeyi geçtin. Bir üst seviyeyi dene!`)
          : 'Bir dahaki sefere! Tekrar dene.';

    banner('SÜRE BİTTİ!', '255,255,255', 1.3, 84);
    Sound.buzzer();
    // Konfeti
    const rgb = draw ? '155,107,255' : COLORS[w].rgb;
    for (let i = 0; i < 6; i++) {
      spawn(rand(40, W - 40), rand(H * 0.2, H * 0.8), i % 2 ? rgb : PUCK_RGB, 22, 700, 1.8, 4, { gravity: 500 });
    }
    game.flash = 0.8;
    game.flashRgb = rgb;
    setTimeout(() => Sound.finale(win || draw), 500);
    vibrate(win ? [60, 50, 60, 50, 140] : 200);
    setTimeout(() => showOverlay(overEl), 1300);
  }

  function togglePause() {
    if (game.state === 'paused') {
      resume();
    } else if (inputActive()) {
      game.resumeState = game.state;
      game.state = 'paused';
      keys.clear();
      showOverlay(pauseEl);
    }
  }

  function resume() {
    if (game.state !== 'paused') return;
    game.state = game.resumeState;
    showOverlay(null);
    last = performance.now();
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    store.set('sound', settings.sound);
    soundBtn.classList.toggle('muted', !settings.sound);
    if (settings.sound) Sound.init();
  }

  // Menü seçimleri
  function syncMenu() {
    document.querySelectorAll('.seg').forEach((seg) => {
      const key = seg.dataset.group;
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', String(settings[key]) === b.dataset.value);
      });
    });
    $('diffField').classList.toggle('disabled', settings.mode === 'pvp');
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    $('hint').innerHTML = settings.mode === 'pvp'
      ? (touch
        ? 'Telefonu masaya koyun: <b class="c">alt yarı</b> ve <b class="p">üst yarı</b> kendi raketini parmağıyla sürükler.'
        : '<b class="c">Mavi</b>: fare veya ok tuşları · <b class="p">Pembe</b>: W A S D<br>Dokunmatik ekranda iki parmakla da oynanır.')
      : (touch
        ? 'Raketi parmağınla sürükle, pakı rakibin kalesine gönder!'
        : 'Raketi <b>fare</b> (veya ok tuşları) ile yönet. <b>Esc</b> duraklatır, <b>M</b> sesi kapatır.');
  }

  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const key = seg.dataset.group;
      settings[key] = b.dataset.value;
      store.set(key, settings[key]);
      syncMenu();
    });
  });

  $('startBtn').addEventListener('click', startMatch);
  $('resumeBtn').addEventListener('click', resume);
  $('restartBtn').addEventListener('click', startMatch);
  $('quitBtn').addEventListener('click', startDemo);
  $('againBtn').addEventListener('click', startMatch);
  $('menuBtn').addEventListener('click', startDemo);
  pauseBtn.addEventListener('click', togglePause);
  soundBtn.addEventListener('click', toggleSound);
  soundBtn.classList.toggle('muted', !settings.sound);

  const fsSupported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (fsSupported) {
    fsBtn.classList.remove('hidden');
    fsBtn.addEventListener('click', () => {
      const el = document.documentElement;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = req && req.call(el);
        if (p && p.catch) p.catch(() => {});
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && inputActive()) togglePause();
  });

  // ---------------------------------------------------------------------------
  // Çizim
  // ---------------------------------------------------------------------------
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let ox = 0, oy = 0;
    if (game.shake > 0.3 && !reduceMotion) {
      ox = rand(-1, 1) * game.shake;
      oy = rand(-1, 1) * game.shake;
    }
    ctx.setTransform(S, 0, 0, S, ox * S, oy * S);
    ctx.drawImage(tableLayer, 0, 0, LW, LH);
    ctx.translate(B, B);

    drawScores();
    drawRipples();
    drawPucks();
    drawMallets();
    drawParticles();

    if (game.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${game.flashRgb},${game.flash * 0.28})`;
      ctx.fillRect(-B, -B, LW, LH);
      ctx.globalCompositeOperation = 'source-over';
    }
    drawBanner();
  }

  function drawScores() {
    if (game.state === 'demo') return;
    const pvp = settings.mode === 'pvp';
    const labels = pvp ? [COLORS[0].name, COLORS[1].name] : ['SEN', 'CPU'];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) {
      const p = game.pulse[i];
      const col = COLORS[i];
      ctx.save();
      ctx.translate(W / 2, i === 0 ? H * 0.75 : H * 0.25);
      if (i === 1 && pvp) ctx.rotate(Math.PI);
      const sc = 1 + p * p * 0.35;
      ctx.scale(sc, sc);
      ctx.font = `italic 900 170px ${FONT}`;
      ctx.fillStyle = `rgba(${col.rgb},${0.1 + p * 0.55})`;
      ctx.fillText(String(game.score[i]), 0, 0);
      ctx.font = `800 18px ${FONT}`;
      ctx.fillStyle = `rgba(${col.rgb},${0.28 + p * 0.5})`;
      ctx.fillText(labels[i], 0, 100);
      ctx.restore();
    }
  }

  function drawRipples() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of ripples) {
      const t = r.t / r.dur;
      const e = 1 - (1 - t) * (1 - t);
      ctx.strokeStyle = `rgba(${r.rgb},${(1 - t) * 0.8})`;
      ctx.lineWidth = r.w * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPucks() {
    for (const p of pucks) drawPuck(p);
  }

  function drawPuck(p) {
    const tr = p.trail;
    const n = tr.length / 2;
    if (n > 1) {
      const sp = Math.hypot(p.vx, p.vy);
      const heat = clamp((sp - 600) / 1500, 0, 1);
      const rgb = `${255},${Math.round(lerp(226, 110, heat))},${Math.round(lerp(110, 60, heat))}`;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / n;
        ctx.fillStyle = `rgba(${rgb},${t * t * 0.28})`;
        ctx.beginPath();
        ctx.arc(tr[i * 2], tr[i * 2 + 1], PUCK_R * (0.35 + 0.65 * t), 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!p.visible) return;
    if (!p.active && game.state !== 'over') {
      // Oyuna girmeyi bekleyen pak yanıp söner
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.time * 14);
      ctx.drawImage(puckSprite, p.x - PS / 2, p.y - PS / 2, PS, PS);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(puckSprite, p.x - PS / 2, p.y - PS / 2, PS, PS);
    }
  }

  function drawMallets() {
    for (const m of mallets) {
      if (m.glow > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = m.glow;
        const s = MS * (1 + (1 - m.glow) * 0.35);
        ctx.drawImage(glowSprites[m.i], m.x - s / 2, m.y - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.drawImage(malletSprites[m.i], m.x - MS / 2, m.y - MS / 2, MS, MS);
    }
  }

  function drawParticles() {
    if (!particles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.spark) {
        ctx.strokeStyle = `rgba(${p.rgb},${a})`;
        ctx.lineWidth = p.size * (0.4 + 0.6 * a);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(${p.rgb},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBanner() {
    const b = game.banner;
    if (!b) return;
    const t = b.t / b.dur;
    const pop = t < 0.18 ? 1.7 - (t / 0.18) * 0.7 : 1;
    const alpha = t > 0.7 ? (1 - t) / 0.3 : Math.min(1, t / 0.08);
    if (settings.mode === 'pvp' && game.state !== 'demo') {
      textGlow(b.text, W / 2, H / 2 + 150, b.size * 0.8, b.rgb, alpha, pop, false);
      textGlow(b.text, W / 2, H / 2 - 150, b.size * 0.8, b.rgb, alpha, pop, true);
    } else {
      textGlow(b.text, W / 2, H / 2, b.size, b.rgb, alpha, pop, false);
    }
  }

  function textGlow(text, x, y, size, rgb, alpha, scale, flip) {
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 900 ${size}px ${FONT}`;
    ctx.shadowColor = `rgba(${rgb},1)`;
    ctx.shadowBlur = size * 0.35 * S;
    ctx.fillStyle = `rgba(${rgb},1)`;
    ctx.fillText(text, 0, 0);
    ctx.shadowBlur = size * 0.12 * S;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Döngü
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30);
    last = now;
    if (dt > 0) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  let resizeRaf = 0;
  const onResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(resize);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

  syncMenu();
  resize();
  startDemo();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Test ve hata ayıklama için
  window.__airHockey = { game, pucks, mallets, settings, AI_LEVELS, step: update };
})();
