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
  // Skiller: süreler ve bekleme süreleri saniye, delta kale genişliğine eklenir
  const SKILLS = {
    grow:   { dur: 5, cd: 16, delta: 120, name: 'DEV KALE',    label: 'Dev Kale',    rgb: '255,190,60' },
    shrink: { dur: 5, cd: 16, delta: -92, name: 'KALE KİLİDİ', label: 'Kale Kilidi', rgb: '190,245,255' },
  };

  const COLORS = [
    { main: '#19e6ff', light: '#c4faff', dark: '#064a74', rgb: '25,230,255', name: 'MAVİ', label: 'Mavi' },
    { main: '#ff3d9a', light: '#ffd0e6', dark: '#6e0a3c', rgb: '255,61,154', name: 'PEMBE', label: 'Pembe' },
  ];
  const PUCK_RGB = '255,226,110';
  const FONT = '"Exo 2", system-ui, sans-serif';

  const AI_LEVELS = {
    easy:   { speed: 540,  accel: 3000,  think: 0.22,  predict: 0.1,  aimErr: 1.0,  noise: 70, strike: 1.0,  bank: 0,    counter: false, skillSmart: 0.25, skillRandom: 0.03 },
    medium: { speed: 880,  accel: 6000,  think: 0.1,   predict: 0.22, aimErr: 0.55, noise: 30, strike: 1.15, bank: 0.15, counter: true,  skillSmart: 0.6,  skillRandom: 0.008 },
    hard:   { speed: 1380, accel: 11000, think: 0.035, predict: 0.36, aimErr: 0.2,  noise: 6,  strike: 1.3,  bank: 0.3,  counter: true,  skillSmart: 0.95, skillRandom: 0 },
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
    volume: clamp(Number(store.get('volume', 1)) || 0, 0, 1),
  };

  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------------
  // Ses (Web Audio ile sentezlenir, dosya gerekmez)
  // ---------------------------------------------------------------------------
  const Sound = {
    ctx: null, bus: null, rev: null, noiseBuf: null, last: {},
    init() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();

      // Ana hat: sesler → bus → sıkıştırıcı → kazanç → sınırlayıcı → hoparlör
      this.bus = c.createGain();
      this.bus.gain.value = 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 12;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      const makeup = c.createGain();
      makeup.gain.value = 1.6;
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -3;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      this.bus.connect(comp);
      comp.connect(makeup);
      makeup.connect(limiter);
      // Oyuncunun ses seviyesi: sınırlayıcıdan sonra, en sonda uygulanır
      this.master = c.createGain();
      this.master.gain.value = this.level();
      limiter.connect(this.master);
      this.master.connect(c.destination);

      // Yankı (oda hissi): üretilmiş dürtü yanıtıyla evrişim
      const len = Math.floor(c.sampleRate * 1.3);
      const ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
      const conv = c.createConvolver();
      conv.buffer = ir;
      this.rev = c.createGain();
      this.rev.gain.value = 0.5;
      this.rev.connect(conv);
      conv.connect(this.bus);

      const nlen = Math.floor(c.sampleRate * 1.5);
      const buf = c.createBuffer(1, nlen, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < nlen; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    },
    // Kaydırıcı değeri kulağa doğrusal gelsin diye karesi alınır (%50 ≈ yarı yükseklik hissi)
    level() {
      return settings.sound ? settings.volume * settings.volume : 0;
    },
    applyVolume() {
      if (!this.master) return;
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.level(), t, 0.03);
    },
    // Kaydırırken seviyeyi duyurmak için kısa örnek vuruş
    preview() {
      if (!this.ctx || !settings.sound || settings.volume <= 0) return;
      const t = this.ctx.currentTime;
      if (this.lastPreview !== undefined && t - this.lastPreview < 0.12) return;
      this.lastPreview = t;
      this.tone({ f0: 300, f1: 70, dur: 0.14, vol: 1 });
      this.tone({ f0: 1000, f1: 400, dur: 0.08, type: 'triangle', vol: 0.55 });
      this.noise({ dur: 0.035, vol: 0.8, type: 'highpass', freq: 2800, q: 0.7 });
    },
    ok(name, gap) {
      if (!this.ctx || !settings.sound || settings.volume <= 0 || game.state === 'demo') return false;
      const t = this.ctx.currentTime;
      if (this.last[name] !== undefined && t - this.last[name] < gap) return false;
      this.last[name] = t;
      return true;
    },
    // Masadaki x konumuna göre sağ/sol (stereo) yerleşim
    route(node, pan, rev) {
      const c = this.ctx;
      let out = node;
      if (pan && c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        node.connect(p);
        out = p;
      }
      out.connect(this.bus);
      if (rev) {
        const s = c.createGain();
        s.gain.value = rev;
        out.connect(s);
        s.connect(this.rev);
      }
    },
    env(g, t, vol, attack, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    tone({ f0, f1 = 0, dur, type = 'sine', vol, delay = 0, attack = 0.004, pan = 0, rev = 0, lp = 0, detune = 0 }) {
      const c = this.ctx, t = c.currentTime + delay;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g, t, vol, attack, dur);
      let node = o;
      if (lp) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lp;
        o.connect(f);
        node = f;
      }
      node.connect(g);
      this.route(g, pan, rev);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    noise({ dur, vol, type = 'bandpass', freq, freqTo = 0, q = 1, delay = 0, attack = 0.002, pan = 0, rev = 0 }) {
      const c = this.ctx, t = c.currentTime + delay;
      const s = c.createBufferSource();
      s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
      f.Q.value = q;
      const g = c.createGain();
      this.env(g, t, vol, attack, dur);
      s.connect(f);
      f.connect(g);
      this.route(g, pan, rev);
      s.start(t, Math.random() * 0.5);
      s.stop(t + dur + 0.05);
    },
    panOf(x) {
      return x === undefined ? 0 : ((x / W) * 2 - 1) * 0.75;
    },

    // Raket vuruşu: gövde "tok" + tınılı çarpma + keskin tık; sert vuruşta alt bas ve yankı
    hit(k, x) {
      if (!this.ok('hit', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 240 + k * 140, f1: 70, dur: 0.14, vol: 0.85 + k * 0.6, pan });
      this.tone({ f0: 760 + k * 520, f1: 320, dur: 0.08, type: 'triangle', vol: 0.42 + k * 0.45, pan });
      this.noise({ dur: 0.035, vol: 0.55 + k * 0.6, type: 'highpass', freq: 2800, q: 0.7, pan });
      if (k > 0.55) {
        this.tone({ f0: 110, f1: 42, dur: 0.24, vol: 0.8 * k, pan: pan * 0.5, rev: 0.25 });
        this.noise({ dur: 0.12, vol: 0.25 * k, freq: 1600, freqTo: 400, q: 0.8, pan, rev: 0.3 });
      }
    },
    // Duvar sekmesi: kısa bas vuruşu + tahta tıkırtısı
    wall(k, x) {
      if (!this.ok('wall', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 170 + k * 80, f1: 65, dur: 0.11, vol: 0.6 + k * 0.55, pan });
      this.noise({ dur: 0.06, vol: 0.35 + k * 0.5, freq: 950, q: 1.2, pan });
      this.tone({ f0: 1250 + k * 400, f1: 700, dur: 0.035, type: 'square', vol: 0.05 + k * 0.08, pan, lp: 3500 });
    },
    // İki pakın çarpışması: metalik "çak"
    clack(k, x) {
      if (!this.ok('clack', 0.04)) return;
      const pan = this.panOf(x);
      this.tone({ f0: 1850, f1: 1300, dur: 0.06, type: 'triangle', vol: 0.4 + k * 0.45, pan });
      this.tone({ f0: 2630, f1: 1900, dur: 0.05, type: 'triangle', vol: 0.25 + k * 0.3, pan });
      this.noise({ dur: 0.035, vol: 0.45 + k * 0.45, type: 'highpass', freq: 4500, pan });
    },
    // Gol: bas patlaması + süpürülen patlama gürültüsü + tezahürat + arpej (yankılı)
    goal(good, x) {
      if (!this.ok('goal', 0.3)) return;
      const pan = this.panOf(x) * 0.6;
      this.tone({ f0: 140, f1: 32, dur: 0.75, vol: 1, pan });
      this.noise({ dur: 1.0, vol: 0.7, type: 'lowpass', freq: 5000, freqTo: 180, q: 0.8, pan, rev: 0.35 });
      if (good) {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((n, i) => {
          const last = i === notes.length - 1;
          const d = last ? 0.7 : 0.26;
          this.tone({ f0: n, dur: d, type: 'sawtooth', vol: 0.13, delay: 0.05 + i * 0.085, lp: 3200, detune: -8, rev: 0.4 });
          this.tone({ f0: n, dur: d, type: 'sawtooth', vol: 0.13, delay: 0.05 + i * 0.085, lp: 3200, detune: 8, rev: 0.4 });
          this.tone({ f0: n * 2, dur: d * 0.8, type: 'triangle', vol: 0.09, delay: 0.05 + i * 0.085, rev: 0.4 });
        });
        // Tezahürat: yükselip sönen kalabalık uğultusu
        this.noise({ dur: 1.6, vol: 0.32, freq: 1100, q: 0.6, delay: 0.1, attack: 0.25, rev: 0.5 });
        this.noise({ dur: 1.4, vol: 0.18, freq: 2600, q: 0.9, delay: 0.15, attack: 0.3, rev: 0.5 });
      } else {
        [392, 369.99, 349.23, 293.66].forEach((n, i) => {
          const last = i === 3;
          this.tone({ f0: n, f1: last ? n * 0.94 : 0, dur: last ? 0.6 : 0.2, type: 'sawtooth', vol: 0.14, delay: 0.1 + i * 0.16, lp: 1400, rev: 0.3 });
        });
      }
    },
    beep(hi) {
      if (!this.ok(hi ? 'beepHi' : 'beep', 0.1)) return;
      if (hi) {
        this.tone({ f0: 1046.5, dur: 0.4, vol: 0.4, rev: 0.3 });
        this.tone({ f0: 1567.98, dur: 0.4, type: 'triangle', vol: 0.2, rev: 0.3 });
        this.tone({ f0: 523.25, dur: 0.3, type: 'square', vol: 0.1, lp: 2000 });
        this.noise({ dur: 0.25, vol: 0.2, type: 'highpass', freq: 3000, freqTo: 8000 });
      } else {
        this.tone({ f0: 659.25, dur: 0.16, vol: 0.65 });
        this.tone({ f0: 1318.5, dur: 0.1, type: 'triangle', vol: 0.22 });
        this.tone({ f0: 329.63, dur: 0.12, type: 'square', vol: 0.08, lp: 1500 });
      }
    },
    tick(urgent) {
      if (!this.ok('tick', 0.3)) return;
      this.tone({ f0: urgent ? 1400 : 1000, dur: 0.08, type: 'square', vol: urgent ? 0.32 : 0.2, lp: 4000 });
      if (urgent) this.tone({ f0: 180, f1: 90, dur: 0.12, vol: 0.6 });
    },
    // İkinci top: siren + yükselen süpürme + vuruş + akor
    frenzy() {
      if (!this.ok('frenzy', 1)) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(1100, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(500, t + 0.5);
      o.frequency.exponentialRampToValueAtTime(1400, t + 0.75);
      this.env(g, t, 0.14, 0.02, 0.8);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      o.connect(f);
      f.connect(g);
      this.route(g, 0, 0.3);
      o.start(t);
      o.stop(t + 0.85);
      this.noise({ dur: 0.75, vol: 0.35, type: 'highpass', freq: 400, freqTo: 7000, attack: 0.6 });
      this.tone({ f0: 150, f1: 38, dur: 0.6, vol: 0.9, delay: 0.72 });
      this.noise({ dur: 0.6, vol: 0.45, type: 'lowpass', freq: 4000, freqTo: 200, delay: 0.72, rev: 0.4 });
      [659.25, 830.61, 987.77, 1318.5].forEach((n, i) => {
        this.tone({ f0: n, dur: 0.5, type: 'sawtooth', vol: 0.09, delay: 0.72 + i * 0.03, lp: 3500, rev: 0.45 });
      });
    },
    // Dev Kale: yükselen süpürme + akor; Kale Kilidi: metalik kilit + kalkan uğultusu
    skill(key) {
      if (!this.ok('skill', 0.15)) return;
      if (key === 'grow') {
        this.tone({ f0: 160, f1: 760, dur: 0.45, type: 'sawtooth', vol: 0.22, lp: 2200, rev: 0.3 });
        this.tone({ f0: 320, f1: 1520, dur: 0.4, type: 'triangle', vol: 0.12, rev: 0.3 });
        this.noise({ dur: 0.45, vol: 0.28, freq: 500, freqTo: 3500, q: 0.8, attack: 0.2 });
        this.tone({ f0: 659.25, dur: 0.35, type: 'triangle', vol: 0.18, delay: 0.38, rev: 0.4 });
        this.tone({ f0: 987.77, dur: 0.35, type: 'triangle', vol: 0.14, delay: 0.42, rev: 0.4 });
        this.tone({ f0: 120, f1: 50, dur: 0.3, vol: 0.5, delay: 0.38 });
      } else {
        this.tone({ f0: 1400, f1: 850, dur: 0.07, type: 'square', vol: 0.2, lp: 3200 });
        this.tone({ f0: 2100, dur: 0.18, type: 'triangle', vol: 0.18, rev: 0.25 });
        this.noise({ dur: 0.05, vol: 0.5, type: 'highpass', freq: 3000 });
        this.tone({ f0: 900, f1: 600, dur: 0.06, type: 'square', vol: 0.15, delay: 0.09, lp: 3000 });
        this.tone({ f0: 110, dur: 0.6, vol: 0.45, delay: 0.08, attack: 0.03, rev: 0.2 });
        this.tone({ f0: 220, dur: 0.6, type: 'triangle', vol: 0.12, delay: 0.08, attack: 0.03, rev: 0.3 });
      }
    },
    ready() {
      if (!this.ok('ready', 0.3)) return;
      this.tone({ f0: 1318.5, dur: 0.12, type: 'triangle', vol: 0.2 });
      this.tone({ f0: 1760, dur: 0.18, type: 'triangle', vol: 0.16, delay: 0.07, rev: 0.25 });
    },
    denied() {
      if (!this.ok('denied', 0.25)) return;
      this.tone({ f0: 170, f1: 110, dur: 0.14, type: 'square', vol: 0.2, lp: 900 });
    },
    buzzer() {
      if (!this.ok('buzzer', 1)) return;
      this.tone({ f0: 155.56, dur: 1.1, type: 'sawtooth', vol: 0.3, attack: 0.02, lp: 1800, rev: 0.3 });
      this.tone({ f0: 233.08, dur: 1.1, type: 'square', vol: 0.14, attack: 0.02, lp: 1600, rev: 0.3 });
      this.tone({ f0: 77.78, dur: 1.1, vol: 0.5, attack: 0.02 });
    },
    finale(win) {
      if (!this.ctx || !settings.sound || settings.volume <= 0) return;
      const seq = win
        ? [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5]
        : [392, 369.99, 349.23, 329.63, 261.63];
      seq.forEach((n, i) => {
        const long = i === seq.length - 1;
        const d = long ? 1.1 : 0.2;
        const at = i * 0.13;
        this.tone({ f0: n, dur: d, type: win ? 'square' : 'sawtooth', vol: win ? 0.11 : 0.09, delay: at, lp: win ? 4000 : 1500, rev: 0.45 });
        this.tone({ f0: n / 2, dur: d, type: 'triangle', vol: 0.16, delay: at, rev: 0.3 });
      });
      const end = (seq.length - 1) * 0.13;
      if (win) {
        this.tone({ f0: 130, f1: 40, dur: 0.8, vol: 0.9, delay: end });
        this.noise({ dur: 2.2, vol: 0.35, freq: 1200, q: 0.6, delay: end, attack: 0.3, rev: 0.5 });
        [1318.5, 1567.98, 2093].forEach((n, i) => this.tone({ f0: n, dur: 1.0, type: 'triangle', vol: 0.08, delay: end + 0.05 + i * 0.04, rev: 0.6 }));
      } else {
        this.tone({ f0: 98, f1: 60, dur: 1.2, type: 'sawtooth', vol: 0.18, delay: end, lp: 600, rev: 0.3 });
      }
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
  // Opak tuval: tarayıcı saydamlık karışımı yapmak zorunda kalmaz (köşeleri CSS yuvarlatır).
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('stage');
  let S = 1; // mantıksal birim başına cihaz pikseli
  const textCache = new Map();

  // Uyarlanabilir kalite: kareler yetişmiyorsa çözünürlüğü kademeli düşür.
  const deviceDpr = window.devicePixelRatio || 1;
  const quality = {
    levels: [Math.min(deviceDpr, 2), 1.5, 1.25, 1].filter((v, i, a) => i === 0 || (v < a[0] && v < a[i - 1])),
    level: 0,
    lite: false,          // en düşük çözünürlükte de yetişmiyorsa efektleri azalt
    acc: 0,
    n: 0,
    cooldown: 0,
  };

  function trackFrame(ms) {
    if (!(game.state === 'play' || game.state === 'countdown' || game.state === 'goal')) {
      quality.acc = quality.n = 0;
      return;
    }
    if (ms > 250) return; // sekme değişimi vb.
    if (quality.cooldown > 0) { quality.cooldown--; return; }
    quality.acc += ms;
    quality.n++;
    if (quality.n < 90) return;
    const avg = quality.acc / quality.n;
    quality.acc = quality.n = 0;
    if (avg <= 22) return;
    if (quality.level < quality.levels.length - 1 && (quality.levels[quality.level + 1] >= 1.25 || avg > 40)) {
      quality.level++;
      quality.cooldown = 60;
      resize();
    } else if (!quality.lite) {
      quality.lite = true;
    }
  }
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
    const dpr = quality.levels[quality.level];
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.style.borderRadius = Math.round(44 * scale) + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    S = canvas.width / LW;
    textCache.clear();
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
    g.fillStyle = '#05060f'; // opak tuvalin köşeleri (CSS ile yuvarlatılır)
    g.fillRect(0, 0, LW, LH);

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

  // Kaleler: 0 = alt (Mavi'nin kalesi, y = H), 1 = üst (Pembe'nin kalesi, y = 0).
  // grow / shrink: etkinin kalan süresi; w: ekranda ve fizikte kullanılan (yumuşakça değişen) genişlik.
  const goals = [{ w: GOAL_W, grow: 0, shrink: 0 }, { w: GOAL_W, grow: 0, shrink: 0 }];

  function goalTarget(g) {
    return GOAL_W + (g.grow > 0 ? SKILLS.grow.delta : 0) + (g.shrink > 0 ? SKILLS.shrink.delta : 0);
  }

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
    if (quality.lite) count = Math.ceil(count * 0.5);
    const max = quality.lite ? 180 : 360;
    const col = `rgb(${rgb})`;
    for (let i = 0; i < count; i++) {
      if (particles.length >= max) break;
      const a = opts.dir !== undefined ? opts.dir + rand(-opts.spread, opts.spread) : rand(0, TAU);
      const sp = speed * rand(0.25, 1);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: life * rand(0.6, 1), max: life,
        size: size * rand(0.5, 1),
        col, spark: !!opts.spark, g: opts.gravity || 0,
      });
    }
  }

  function ripple(x, y, rgb, r0, r1, dur, w) {
    ripples.push({ x, y, col: `rgb(${rgb})`, r0, r1, dur, w, t: 0 });
  }

  function banner(text, rgb, dur, size) {
    game.banner = { text, rgb, dur, size, t: 0 };
  }

  function updateEffects(dt) {
    const k = Math.exp(-2.6 * dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        // Sırayı korumaya gerek yok: sondakiyle yer değiştirip çıkar (splice'tan çok daha ucuz)
        particles[i] = particles[particles.length - 1];
        particles.pop();
        continue;
      }
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
        if (sp > 1300 && !quality.lite && Math.random() < 0.7) {
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
    const tHalf = goals[1].w / 2, bHalf = goals[0].w / 2;
    if (p.y < PUCK_R && Math.abs(p.x - W / 2) >= tHalf) {
      p.y = PUCK_R;
      if (p.vy < 0) { imp = Math.max(imp, -p.vy); p.vy = -p.vy * WALL_E; }
    } else if (p.y > H - PUCK_R && Math.abs(p.x - W / 2) >= bHalf) {
      p.y = H - PUCK_R;
      if (p.vy > 0) { imp = Math.max(imp, p.vy); p.vy = -p.vy * WALL_E; }
    }
    imp = Math.max(imp,
      collidePost(p, W / 2 - tHalf, 0), collidePost(p, W / 2 + tHalf, 0),
      collidePost(p, W / 2 - bHalf, H), collidePost(p, W / 2 + bHalf, H));
    return imp;
  }

  // Kale direği: nokta çarpışması
  function collidePost(p, qx, qy) {
    const dx = p.x - qx, dy = p.y - qy, d2 = dx * dx + dy * dy;
    if (d2 >= PUCK_R * PUCK_R || d2 < 1e-6) return 0;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    p.x = qx + nx * PUCK_R;
    p.y = qy + ny * PUCK_R;
    const vn = p.vx * nx + p.vy * ny;
    if (vn >= 0) return 0;
    p.vx -= (1 + WALL_E) * vn * nx;
    p.vy -= (1 + WALL_E) * vn * ny;
    return -vn;
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

  // `remaining`: bu karede bundan sonra kalan fizik adımı sayısı (insan raketi hedefe eşit adımlarla gider).
  function stepPhysics(dt, remaining = 0) {
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
        ex = m.x + (m.tx - m.x) / (remaining + 1);
        ey = m.y + (m.ty - m.y) / (remaining + 1);
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
    Sound.hit(k, m.hx);
    if (!m.ai) vibrate(Math.round(6 + k * 18));
  }

  function onWallHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, PUCK_RGB, 6, 30 + k * 40, 0.4, 2.5);
    if (k > 0.2) spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 350, 0.35, 2.4, { spark: true });
    Sound.wall(k, x);
  }

  function onPuckHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, '255,255,255', 8, 40 + k * 40, 0.35, 3);
    spawn(x, y, '255,255,255', Math.round(4 + k * 10), 200 + k * 400, 0.35, 2.4, { spark: true });
    spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 300, 0.4, 2.4, { spark: true });
    Sound.clack(k, x);
  }

  function onGoal(scorer, p) {
    const col = COLORS[scorer];
    const gi = scorer === 0 ? 1 : 0; // golün girdiği kale
    const half = goals[gi].w / 2;
    const gx = clamp(p.x, W / 2 - half + 10, W / 2 + half - 10);
    const gy = scorer === 0 ? 0 : H;
    goals[gi].grow = 0; // Dev Kale golle tükenir
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
    Sound.goal(settings.mode === 'pvp' || scorer === 0, gx);
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
  // Skiller
  // ---------------------------------------------------------------------------
  const SKILL_KEYS = ['grow', 'shrink'];
  // Oyuncu başına kalan bekleme süreleri (0 = hazır)
  const skills = [{ grow: 0, shrink: 0, aiTimer: 1 }, { grow: 0, shrink: 0, aiTimer: 1 }];
  const floaters = [];

  function resetSkills() {
    for (const sk of skills) {
      sk.grow = sk.shrink = 0;
      sk.aiTimer = 1;
    }
    for (const g of goals) {
      g.grow = g.shrink = 0;
      g.w = GOAL_W;
    }
    floaters.length = 0;
  }

  // grow rakibin kalesini, shrink oyuncunun kendi kalesini etkiler
  function skillGoal(p, key) {
    return key === 'grow' ? 1 - p : p;
  }

  function useSkill(p, key) {
    const st = game.state;
    if (!(st === 'play' || st === 'demo') || skills[p][key] > 0) {
      if (!mallets[p].ai && st === 'play') Sound.denied();
      return false;
    }
    const sk = SKILLS[key];
    const gi = skillGoal(p, key);
    skills[p][key] = sk.cd;
    goals[gi][key] = sk.dur;
    const gy = gi === 1 ? 0 : H;
    ripple(W / 2, gy, sk.rgb, 20, 240, 0.7, 6);
    spawn(W / 2, gy, sk.rgb, 34, 650, 0.8, 3, { dir: gi === 1 ? Math.PI / 2 : -Math.PI / 2, spread: 1.3, spark: true });
    floaters.push({ text: sk.name + '!', gi, rgb: sk.rgb, t: 0, dur: 1.3 });
    Sound.skill(key);
    if (!mallets[p].ai) vibrate(25);
    skillUI.dirty = true;
    return true;
  }

  function updateSkills(dt) {
    for (let p = 0; p < 2; p++) {
      for (const key of SKILL_KEYS) {
        if (skills[p][key] > 0) {
          skills[p][key] -= dt;
          if (skills[p][key] <= 0) {
            skills[p][key] = 0;
            if (!mallets[p].ai && game.state === 'play') Sound.ready();
          }
        }
      }
      if (mallets[p].ai) {
        skills[p].aiTimer -= dt;
        if (skills[p].aiTimer <= 0) {
          skills[p].aiTimer = 0.4;
          aiSkills(p);
        }
      }
    }
    for (const g of goals) {
      g.grow = Math.max(0, g.grow - dt);
      g.shrink = Math.max(0, g.shrink - dt);
    }
  }

  // Yapay zekâ: kalesine hızlı top geliyorsa kilitler, rakip kaleye şut gidiyorsa büyütür.
  function aiSkills(p) {
    const L = mallets[p].level, sk = skills[p];
    const flip = mallets[p].bottom;
    let threat = false, attack = false;
    for (const q of pucks) {
      if (!q.active) continue;
      const ly = flip ? H - q.y : q.y;
      const lvy = flip ? -q.vy : q.vy;
      if (lvy < -650 && ly < H * 0.6) {
        const hx = foldX(q.x + q.vx * (ly / -lvy));
        if (Math.abs(hx - W / 2) < goals[p].w / 2 + 40) threat = true;
      }
      if (lvy > 650 && ly > H * 0.35) {
        const hx = foldX(q.x + q.vx * ((H - ly) / lvy));
        if (Math.abs(hx - W / 2) < goals[1 - p].w / 2 + 110) attack = true;
      }
    }
    if (threat && sk.shrink <= 0 && Math.random() < L.skillSmart) useSkill(p, 'shrink');
    else if (attack && sk.grow <= 0 && Math.random() < L.skillSmart) useSkill(p, 'grow');
    else if (L.skillRandom && Math.random() < L.skillRandom) useSkill(p, Math.random() < 0.5 ? 'grow' : 'shrink');
  }

  function updateGoals(dt) {
    const k = 1 - Math.exp(-9 * dt);
    for (const g of goals) g.w += (goalTarget(g) - g.w) * k;
    for (let i = floaters.length - 1; i >= 0; i--) {
      floaters[i].t += dt;
      if (floaters[i].t >= floaters[i].dur) floaters.splice(i, 1);
    }
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
        const ownW = goals[m.bottom ? 0 : 1].w;
        tx = W / 2 + clamp(hitX - W / 2, -ownW * 0.75, ownW * 0.75);
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
          const spread = goals[m.bottom ? 1 : 0].w * 0.3 + L.aimErr * 150;
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
    if (!e.target.closest || !e.target.closest('.overlay, .vol-pop')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  const KEY_MOVE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !volPop.classList.contains('hidden')) {
      closeVolume();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      togglePause();
      return;
    }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'Equal' || e.code === 'NumpadAdd') {
      if (e.target && e.target.id === 'volRange') return; // kaydırıcı kendi tuşlarını işler
      const up = e.code === 'Equal' || e.code === 'NumpadAdd';
      const base = settings.sound ? settings.volume : 0;
      setVolume(Math.round((base + (up ? 0.1 : -0.1)) * 10) / 10, true);
      toast(settings.sound && settings.volume > 0 ? `Ses: %${Math.round(settings.volume * 100)}` : 'Ses kapalı');
      return;
    }
    if (e.code === 'KeyM') {
      toggleSound();
      toast(settings.sound ? `Ses açık (%${Math.round(settings.volume * 100)})` : 'Ses kapalı');
      return;
    }
    if ((e.code === 'Enter' || e.code === 'Space') && menuEl.classList.contains('show')) {
      e.preventDefault();
      startMatch();
      return;
    }
    const sk = skillKey(e.code);
    if (sk) {
      if (!e.repeat && inputActive() && !mallets[sk[0]].ai) {
        e.preventDefault();
        lastInputTouch = false;
        useSkill(sk[0], sk[1]);
      }
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
    [menuEl, pauseEl, overEl, cardEl].forEach((o) => o.classList.toggle('show', o === el));
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
    resetSkills();
    const p = pucks[0];
    placePuck(p, -1);
    p.active = true;
    p.visible = true;
    launchPuck(p, 600);
    game.score = [0, 0];
    game.banner = null;
    clockEl.classList.add('hidden');
    showSkillBars(false);
    showOverlay(menuEl);
  }

  function startMatch() {
    Sound.init();
    game.score = [0, 0];
    game.pulse = [0, 0];
    game.clock = MATCH_TIME;
    game.frenzy = false;
    pucks.length = 1;
    resetSkills();
    mallets.forEach(resetMallet);
    mallets[0].ai = false;
    mallets[1].ai = settings.mode === 'ai';
    mallets[1].level = AI_LEVELS[settings.difficulty] || AI_LEVELS.medium;
    pointerOwner.clear();
    particles.length = 0;
    ripples.length = 0;
    clockEl.classList.remove('hidden');
    updateClock();
    showSkillBars(true);
    showOverlay(null);
    if (!store.get('skillsSeen', false)) {
      store.set('skillsSeen', true);
      const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      setTimeout(() => toast(touch
        ? 'Skiller hazır! Alttaki düğmelerle kullan.'
        : 'Skiller hazır! 1 ve 2 tuşlarıyla ya da düğmelerle kullan.'), 1800);
    }
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
    updateGoals(dt);
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
      updateSkills(dt);
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
      updateSkills(dt);
    }

    if (st !== 'demo') updateClock();
    // Kare hızı düşse de oyun gerçek zamanlı aksın: fiziği en fazla 1/60 sn'lik adımlarla çalıştır.
    const n = Math.max(1, Math.ceil(dt * 60 - 1e-6));
    for (let i = 0; i < n; i++) stepPhysics(dt / n, n - 1 - i);
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

    prepareShare({ a, b, draw, w, win, pvp, difficulty: settings.difficulty });
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

  // ---------------------------------------------------------------------------
  // Paylaşım
  // ---------------------------------------------------------------------------
  const cardEl = $('cardMenu'), toastEl = $('toast');
  const DIFF_NAMES = { easy: 'kolay', medium: 'orta', hard: 'zor' };
  const share = { blob: null, url: '', result: null };
  let toastTimer = 0;
  let downloadsApi = null; // claude.ai'de yayınlandığında izinli dosya kaydetme

  if (window.claude && typeof window.claude.use === 'function') {
    window.claude.use('downloads').then((d) => {
      downloadsApi = d;
      updateSaveUI();
    }).catch(() => {});
  }

  function canSave() {
    return !!downloadsApi || !isFramed();
  }

  function updateSaveUI() {
    $('cardSave').classList.toggle('hidden', !share.blob || !canSave());
    $('cardHint').textContent = canSave()
      ? 'Görseli kaydedip istediğin yerde paylaşabilirsin.'
      : 'Kaydetmek için görsele basılı tut veya sağ tıkla.';
  }

  function isFramed() {
    try { return window.self !== window.top; } catch (e) { return true; }
  }

  // Paylaşılacak oyun adresi: kendi sitesinde sayfanın adresi, gömülü görünümde (varsa) çerçeveyi açan sayfa.
  function shareLink() {
    if (isFramed()) {
      return /^https:\/\/claude\.ai\/(code\/)?artifact\//.test(document.referrer) ? document.referrer : '';
    }
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname)) return '';
    return location.origin + location.pathname;
  }

  function shareText() {
    const r = share.result;
    const s = `${r.a}-${r.b}`;
    let line;
    if (r.pvp) {
      const hi = Math.max(r.a, r.b), lo = Math.min(r.a, r.b);
      line = r.draw
        ? `Neon Air Hockey'de ${s} berabere kaldık!`
        : `Neon Air Hockey'de ${COLORS[r.w].label}, ${COLORS[1 - r.w].label} rakibini ${hi}-${lo} yendi!`;
    } else {
      const d = DIFF_NAMES[r.difficulty];
      line = r.draw
        ? `Neon Air Hockey'de ${d} seviyedeki yapay zekâyla ${s} berabere kaldım!`
        : r.win
          ? `Neon Air Hockey'de ${d} seviyedeki yapay zekâyı ${s} yendim! 🏆`
          : `Neon Air Hockey'de ${d} seviyedeki yapay zekâya ${s} yenildim, rövanş lazım!`;
    }
    return `🏒 ${line} Sen de dene! #NeonAirHockey`;
  }

  function fullText() {
    return share.url ? `${shareText()} ${share.url}` : shareText();
  }

  function prepareShare(result) {
    share.result = result;
    share.url = shareLink();
    const t = encodeURIComponent(shareText());
    const u = encodeURIComponent(share.url);
    const all = encodeURIComponent(fullText());
    $('shareX').href = `https://twitter.com/intent/tweet?text=${t}${share.url ? `&url=${u}` : ''}`;
    $('shareWa').href = `https://wa.me/?text=${all}`;
    $('shareTg').href = share.url
      ? `https://t.me/share/url?url=${u}&text=${t}`
      : `https://t.me/share/url?url=${all}`;
    // Facebook yalnızca bir bağlantı paylaşabilir
    $('shareFb').classList.toggle('hidden', !share.url);
    if (share.url) $('shareFb').href = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`;
    // Gömülü görünümde tarayıcı paylaşım menüsü engellidir; orada düğmeyi gösterme.
    const canNative = !!navigator.share && !isFramed();
    $('shareNative').classList.toggle('hidden', !canNative);

    share.blob = null;
    updateSaveUI();
    const img = $('cardImg'), thumb = $('cardThumb');
    const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(() => {
      const c = drawCard(result);
      c.toBlob((blob) => {
        if (!blob) return;
        if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        share.blob = blob;
        const url = URL.createObjectURL(blob);
        img.src = url;
        thumb.src = url;
        const canFile = canNative && !!(navigator.canShare && navigator.canShare({ files: [cardFile()] }));
        $('cardShare').classList.toggle('hidden', !canFile);
        updateSaveUI();
      }, 'image/jpeg', 0.9);
    });
  }

  function cardFile() {
    return new File([share.blob || new Blob()], 'neon-air-hockey-skor.jpg', { type: 'image/jpeg' });
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // Tıklama anında çağrılmalı (pano izni kullanıcı etkileşimi ister).
  function copyText(text, okMsg) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? okMsg : 'Kopyalanamadı. Metin: ' + text);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
    } else {
      fallback();
    }
  }

  function nativeShare(withImage) {
    const data = { title: 'Neon Air Hockey', text: shareText() };
    if (share.url) data.url = share.url;
    if (withImage && share.blob) {
      const file = cardFile();
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Bazı uygulamalar dosyayla birlikte url alanını yok sayar; bağlantıyı metne ekle.
        data.files = [file];
        data.text = fullText();
        delete data.url;
      }
    }
    if (!navigator.share) {
      copyText(fullText(), 'Paylaşım metni panoya kopyalandı.');
      return;
    }
    navigator.share(data).catch((e) => {
      if (e && e.name === 'AbortError') return;
      copyText(fullText(), 'Paylaşım menüsü açılamadı; metin panoya kopyalandı.');
    });
  }

  function saveCard() {
    if (!share.blob) return;
    if (downloadsApi) {
      downloadsApi.save({ filename: 'neon-air-hockey-skor.jpg', data: share.blob })
        .then(() => toast('Skor kartı kaydedildi.'))
        .catch((e) => {
          const code = e && e.code;
          if (code === 'declined') return;
          if (code === 'rate_limited') toast('Kaydetme penceresi zaten açık.');
          else toast('Görsel kaydedilemedi; görsele basılı tutarak kaydedebilirsin.');
        });
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(share.blob);
    a.download = 'neon-air-hockey-skor.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Skor kartı indirildi.');
  }

  $('shareNative').addEventListener('click', () => nativeShare(true));
  $('shareCopy').addEventListener('click', () => copyText(fullText(), 'Paylaşım metni panoya kopyalandı.'));
  $('cardBtn').addEventListener('click', () => showOverlay(cardEl));
  $('cardClose').addEventListener('click', () => showOverlay(overEl));
  $('cardShare').addEventListener('click', () => nativeShare(true));
  $('cardSave').addEventListener('click', saveCard);

  // 1080×1350 skor kartı (Instagram, X ve WhatsApp için uygun oran)
  function drawCard(r) {
    const CW = 1080, CH = 1350;
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const g = c.getContext('2d');
    const spacing = (v) => { if ('letterSpacing' in g) g.letterSpacing = v; };

    // Zemin
    g.fillStyle = '#05060f';
    g.fillRect(0, 0, CW, CH);
    [[180, 160, `rgba(${COLORS[1].rgb},0.38)`], [900, 1200, `rgba(${COLORS[0].rgb},0.32)`], [540, 700, 'rgba(90,60,200,0.25)']].forEach(([x, y, col]) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, 700);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, CW, CH);
    });

    // Perspektif ızgara (çerçevenin içinde)
    g.save();
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.clip();
    g.strokeStyle = 'rgba(155,107,255,0.22)';
    g.lineWidth = 2;
    const hy = 980, vx = CW / 2;
    for (let i = -12; i <= 12; i++) {
      g.beginPath();
      g.moveTo(vx + i * 30, hy);
      g.lineTo(vx + i * 260, CH);
      g.stroke();
    }
    for (let k = 1; k < 9; k++) {
      const y = hy + Math.pow(k / 8, 2) * (CH - hy);
      g.globalAlpha = k / 9;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CW, y);
      g.stroke();
    }
    g.restore();

    // Neon çerçeve
    const edge = g.createLinearGradient(0, 0, 0, CH);
    edge.addColorStop(0, COLORS[1].main);
    edge.addColorStop(0.5, '#9b6bff');
    edge.addColorStop(1, COLORS[0].main);
    g.shadowColor = 'rgba(155,107,255,0.9)';
    g.shadowBlur = 30;
    g.strokeStyle = edge;
    g.lineWidth = 7;
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    rr(g, 48, 48, CW - 96, CH - 96, 56);
    g.stroke();

    // Kale ağızları
    [[48, COLORS[1]], [CH - 48, COLORS[0]]].forEach(([y, col]) => {
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.shadowBlur = 24;
      g.strokeStyle = col.light;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(CW / 2 - 150, y);
      g.lineTo(CW / 2 + 150, y);
      g.stroke();
    });
    g.shadowBlur = 0;

    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Logo
    spacing('26px');
    g.font = `italic 900 40px ${FONT}`;
    g.shadowColor = COLORS[0].main;
    g.shadowBlur = 24;
    g.fillStyle = '#c9fbff';
    g.fillText('NEON', CW / 2 + 13, 170);
    spacing('0px');
    g.font = `italic 900 108px ${FONT}`;
    const lg = g.createLinearGradient(170, 0, 910, 0);
    lg.addColorStop(0, COLORS[0].main);
    lg.addColorStop(0.5, '#9b6bff');
    lg.addColorStop(1, COLORS[1].main);
    g.shadowColor = 'rgba(155,107,255,0.8)';
    g.shadowBlur = 30;
    g.fillStyle = lg;
    g.fillText('AIR HOCKEY', CW / 2, 262);

    // Sonuç başlığı
    const titleRgb = r.draw ? '155,107,255' : r.pvp ? COLORS[r.w].rgb : r.win ? COLORS[0].rgb : COLORS[1].rgb;
    const title = r.draw ? 'BERABERE' : r.pvp ? `${COLORS[r.w].name} KAZANDI!` : r.win ? 'KAZANDIM!' : 'KAYBETTİM';
    g.font = `italic 900 ${title.length > 12 ? 92 : 108}px ${FONT}`;
    g.shadowColor = `rgba(${titleRgb},1)`;
    g.shadowBlur = 40;
    g.fillStyle = `rgba(${titleRgb},1)`;
    g.fillText(title, CW / 2, 450);
    g.shadowBlur = 14;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.fillText(title, CW / 2, 450);

    // Orta çizgi ve pak
    g.shadowBlur = 20;
    g.shadowColor = 'rgba(175,130,255,0.9)';
    g.strokeStyle = 'rgba(215,195,255,0.45)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(48, 700);
    g.lineTo(CW - 48, 700);
    g.stroke();
    g.beginPath();
    g.arc(CW / 2, 700, 84, 0, TAU);
    g.stroke();
    g.shadowColor = `rgba(${PUCK_RGB},1)`;
    g.shadowBlur = 40;
    g.fillStyle = '#141729';
    g.beginPath();
    g.arc(CW / 2, 700, 44, 0, TAU);
    g.fill();
    g.strokeStyle = '#fff1b0';
    g.lineWidth = 8;
    g.stroke();

    // Skor
    g.font = `italic 900 300px ${FONT}`;
    [[r.a, 0, CW / 2 - 250], [r.b, 1, CW / 2 + 250]].forEach(([v, i, x]) => {
      const col = COLORS[i];
      g.shadowColor = `rgba(${col.rgb},1)`;
      g.shadowBlur = 50;
      g.fillStyle = col.main;
      g.fillText(String(v), x, 712);
      g.shadowBlur = 0;
      g.fillStyle = `rgba(255,255,255,0.18)`;
      g.fillText(String(v), x, 712);
    });

    // Oyuncu etiketleri
    const labels = r.pvp ? [COLORS[0].name, COLORS[1].name] : ['BEN', `CPU · ${DIFF_NAMES[r.difficulty].toLocaleUpperCase('tr')}`];
    spacing('6px');
    g.font = `800 36px ${FONT}`;
    g.shadowBlur = 16;
    labels.forEach((t, i) => {
      g.shadowColor = `rgba(${COLORS[i].rgb},0.9)`;
      g.fillStyle = COLORS[i].light;
      g.fillText(t, CW / 2 + (i ? 250 : -250), 900);
    });

    // Maç bilgisi
    spacing('3px');
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(200,205,240,0.75)';
    const info = `60 SN MAÇ  ·  45. SN'DE 2. TOP  ·  ${r.pvp ? 'İKİ OYUNCU' : 'TEK OYUNCU'}`;
    let fs = 32;
    do { g.font = `700 ${fs}px ${FONT}`; fs -= 1; } while (g.measureText(info).width > CW - 200 && fs > 18);
    g.fillText(info, CW / 2, 1010);

    // Alt bilgi
    spacing('0px');
    const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    g.font = `600 30px ${FONT}`;
    g.fillStyle = 'rgba(200,205,240,0.6)';
    g.fillText(date, CW / 2, 1150);
    g.font = `italic 900 46px ${FONT}`;
    g.shadowColor = `rgba(${PUCK_RGB},0.9)`;
    g.shadowBlur = 20;
    g.fillStyle = '#fff6c4';
    g.fillText('SEN DE DENE!', CW / 2, 1222);
    return c;
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

  // ---------------------------------------------------------------------------
  // Ses seviyesi
  // ---------------------------------------------------------------------------
  const volPop = $('volPop'), volRange = $('volRange'), volPct = $('volPct'), muteBtn = $('muteBtn');

  function syncVolumeUI() {
    const pct = Math.round(settings.volume * 100);
    const on = settings.sound && pct > 0;
    volRange.value = String(pct);
    volRange.style.setProperty('--v', pct + '%');
    volRange.setAttribute('aria-valuetext', on ? `%${pct}` : 'Kapalı');
    volPct.textContent = on ? `%${pct}` : 'Kapalı';
    volPop.classList.toggle('off', !on);
    soundBtn.classList.toggle('muted', !on);
    soundBtn.classList.toggle('low', on && pct < 45);
    muteBtn.classList.toggle('muted', !on);
    muteBtn.setAttribute('aria-label', on ? 'Sesi kapat' : 'Sesi aç');
    muteBtn.title = on ? 'Sesi kapat (M)' : 'Sesi aç (M)';
  }

  function setVolume(v, preview) {
    settings.volume = clamp(v, 0, 1);
    // Kaydırıcıyı sıfırdan yukarı çekmek sesi yeniden açar
    if (settings.volume > 0 && !settings.sound) {
      settings.sound = true;
      store.set('sound', true);
    }
    store.set('volume', settings.volume);
    Sound.init();
    Sound.applyVolume();
    syncVolumeUI();
    if (preview) Sound.preview();
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    if (settings.sound && settings.volume <= 0) {
      settings.volume = 0.5;
      store.set('volume', settings.volume);
    }
    store.set('sound', settings.sound);
    if (settings.sound) Sound.init();
    Sound.applyVolume();
    syncVolumeUI();
  }

  function openVolume() {
    volPop.classList.remove('hidden');
    soundBtn.setAttribute('aria-expanded', 'true');
    syncVolumeUI();
  }

  function closeVolume() {
    volPop.classList.add('hidden');
    soundBtn.setAttribute('aria-expanded', 'false');
  }

  volRange.addEventListener('input', () => setVolume(Number(volRange.value) / 100, true));
  muteBtn.addEventListener('click', () => {
    toggleSound();
    if (settings.sound) Sound.preview();
  });
  // Panel dışına dokununca kapat (oyun girdisini engellemeden)
  document.addEventListener('pointerdown', (e) => {
    if (volPop.classList.contains('hidden')) return;
    if (e.target.closest && (e.target.closest('#volPop') || e.target.closest('#soundBtn'))) return;
    closeVolume();
  }, true);

  // ---------------------------------------------------------------------------
  // Skill düğmeleri
  // ---------------------------------------------------------------------------
  const skillBars = [$('skillBar0'), $('skillBar1')];
  const skillUI = { dirty: true };

  skillBars.forEach((bar, p) => {
    bar.querySelectorAll('.skill-btn').forEach((btn) => {
      const key = btn.dataset.skill;
      // Basar basmaz çalışsın (raketi süren diğer parmakla aynı anda da)
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        lastInputTouch = e.pointerType !== 'mouse';
        Sound.init();
        useSkill(p, key);
      });
      // Klavyeyle odaklanıp Enter/Boşluk
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) useSkill(p, key);
      });
    });
  });

  function showSkillBars(on) {
    const pvp = settings.mode === 'pvp';
    skillBars[0].classList.toggle('hidden', !on);
    skillBars[1].classList.toggle('hidden', !on || !pvp);
    document.body.classList.toggle('skills', on);
    document.body.classList.toggle('pvp', on && pvp);
    skillUI.dirty = true;
    resize();
  }

  // DOM yalnızca görünen bir şey değiştiğinde güncellenir
  function updateSkillUI() {
    const playing = game.state === 'play';
    for (let p = 0; p < 2; p++) {
      const bar = skillBars[p];
      if (bar.classList.contains('hidden')) continue;
      for (const btn of bar.children) {
        const key = btn.dataset.skill, sk = SKILLS[key];
        const cd = skills[p][key], left = goals[skillGoal(p, key)][key];
        let state, sub, fill;
        if (left > 0 && cd > 0) {
          state = 'active';
          sub = `Aktif · ${Math.ceil(left)} sn`;
          fill = left / sk.dur;
        } else if (cd > 0) {
          state = 'cooling';
          sub = `Hazır: ${Math.ceil(cd)} sn`;
          fill = 1 - cd / sk.cd;
        } else {
          state = playing ? 'ready' : 'wait';
          sub = key === 'grow' ? 'Rakip kale büyür' : 'Kalen küçülür';
          fill = 1;
        }
        const f = Math.round(fill * 40) / 40;
        const sig = `${state}|${sub}|${f}`;
        if (btn._sig === sig && !skillUI.dirty) continue;
        btn._sig = sig;
        for (const c of ['ready', 'active', 'cooling', 'wait']) btn.classList.toggle(c, c === state);
        btn.style.setProperty('--fill', String(f));
        btn.querySelector('small').textContent = sub;
      }
    }
    skillUI.dirty = false;
  }

  function skillKey(code) {
    const pvp = settings.mode === 'pvp';
    switch (code) {
      case 'Digit1': case 'Numpad1': case 'KeyK': return [0, 'grow'];
      case 'Digit2': case 'Numpad2': case 'KeyL': return [0, 'shrink'];
      case 'KeyQ': return [pvp ? 1 : 0, 'grow'];
      case 'KeyE': return [pvp ? 1 : 0, 'shrink'];
      default: return null;
    }
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
        ? 'Telefonu masaya koyun: <b class="c">alt yarı</b> ve <b class="p">üst yarı</b> kendi raketini parmağıyla sürükler, skiller kendi tarafındaki düğmelerde.'
        : '<b class="c">Mavi</b>: fare veya ok tuşları, skiller <b>1</b>/<b>2</b> · <b class="p">Pembe</b>: W A S D, skiller <b>Q</b>/<b>E</b><br>Dokunmatik ekranda iki parmakla da oynanır.')
      : (touch
        ? 'Raketi parmağınla sürükle, skilleri alttaki düğmelerle kullan!'
        : 'Raketi <b>fare</b> (veya ok tuşları) ile yönet, skiller <b>1</b>/<b>2</b>. <b>Esc</b> duraklatır, <b>M</b> sesi kapatır, <b>−</b>/<b>+</b> ses seviyesini değiştirir.');
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
  soundBtn.addEventListener('click', () => {
    Sound.init();
    if (volPop.classList.contains('hidden')) openVolume();
    else closeVolume();
  });
  syncVolumeUI();

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
  // Yazılar bir kez (parıltısıyla) ayrı bir tuvale çizilir, her karede yalnızca kopyalanır.
  function textSprite(text, font, size, rgb, glow) {
    const key = `${text}|${font}|${rgb}|${glow ? 1 : 0}`;
    let sp = textCache.get(key);
    if (sp) return sp;
    if (textCache.size > 60) textCache.clear();
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const pad = glow ? size * 0.55 : size * 0.12;
    const w = m.measureText(text).width + pad * 2, h = size * 1.25 + pad * 2;
    const [c, g] = makeLayer(w, h);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (glow) {
      g.shadowColor = `rgba(${rgb},1)`;
      g.shadowBlur = size * 0.35 * S;
      g.fillStyle = `rgba(${rgb},1)`;
      g.fillText(text, w / 2, h / 2);
      g.shadowBlur = size * 0.12 * S;
      g.fillStyle = 'rgba(255,255,255,0.92)';
    } else {
      g.fillStyle = `rgb(${rgb})`;
    }
    g.fillText(text, w / 2, h / 2);
    sp = { c, w, h };
    textCache.set(key, sp);
    return sp;
  }

  function drawSprite(sp, x, y) {
    ctx.drawImage(sp.c, x - sp.w / 2, y - sp.h / 2, sp.w, sp.h);
  }

  // Kaleler: sabit kısımlar (ağız, çizgi, direkler) genişlik ya da durum değişince bir kez çizilip
  // saklanır; her karede yalnızca skill animasyonları (nabız, oklar, kalkan, etiket) çizilir.
  const goalSprites = [null, null];
  const GOAL_SPRITE_H = B + 14;

  function goalLine(c, x0, x1, y) {
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  }

  function goalSprite(i) {
    const g = goals[i], col = COLORS[i], top = i === 1;
    const grow = g.grow > 0, shrink = g.shrink > 0;
    const w = Math.round(g.w * 2) / 2;
    const key = `${w}|${grow}|${shrink}|${S}`;
    const cached = goalSprites[i];
    if (cached && cached.key === key) return cached;

    const y0 = top ? -B : H - 14; // görselin masadaki üst kenarı
    const [c, gc] = makeLayer(W, GOAL_SPRITE_H);
    gc.translate(0, -y0);
    const half = w / 2, L = W / 2 - half, Rx = W / 2 + half;
    const sy = top ? -B + 5 : H - 2, ly = top ? 0 : H;

    rr(gc, L, sy, w, B - 3, 6);
    gc.fillStyle = '#02030a';
    gc.fill();
    const gr = gc.createLinearGradient(0, sy, 0, sy + B - 3);
    gr.addColorStop(top ? 0 : 1, '#000');
    gr.addColorStop(top ? 1 : 0, `rgba(${col.rgb},0.35)`);
    gc.fillStyle = gr;
    gc.fill();

    const lineRgb = grow ? SKILLS.grow.rgb : shrink ? SKILLS.shrink.rgb : col.rgb;
    gc.lineCap = 'round';
    gc.strokeStyle = `rgba(${lineRgb},0.3)`;
    gc.lineWidth = 12;
    goalLine(gc, L + 4, Rx - 4, ly);
    gc.strokeStyle = grow ? '#ffe7a3' : shrink ? '#ffffff' : col.light;
    gc.lineWidth = 3;
    goalLine(gc, L + 4, Rx - 4, ly);

    gc.fillStyle = shrink ? `rgb(${SKILLS.shrink.rgb})` : '#fff';
    const pr = shrink ? 6.5 : 4.5;
    for (const x of [L, Rx]) {
      gc.beginPath();
      gc.arc(x, ly, pr, 0, TAU);
      gc.fill();
    }
    const sp = { c, key, y: y0 };
    goalSprites[i] = sp;
    return sp;
  }

  function drawGoals() {
    const pvp = settings.mode === 'pvp' && game.state !== 'demo';
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 10);
    for (let i = 0; i < 2; i++) {
      const g = goals[i];
      const sp = goalSprite(i);
      ctx.drawImage(sp.c, 0, sp.y, W, GOAL_SPRITE_H);
      const grow = g.grow > 0, shrink = g.shrink > 0;
      if (!grow && !shrink) continue;

      const top = i === 1;
      const half = g.w / 2, L = W / 2 - half, Rx = W / 2 + half, ly = top ? 0 : H;
      ctx.lineCap = 'round';

      // Nabız gibi atan ek parıltı
      ctx.strokeStyle = `rgb(${grow ? SKILLS.grow.rgb : SKILLS.shrink.rgb})`;
      ctx.globalAlpha = 0.35 * pulse;
      ctx.lineWidth = 14;
      goalLine(ctx, L + 4, Rx - 4, ly);

      // Kale Kilidi: kalenin önünde kesikli kalkan yayı
      if (shrink) {
        ctx.globalAlpha = 0.3 + 0.3 * pulse;
        ctx.strokeStyle = `rgb(${SKILLS.shrink.rgb})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(W / 2, ly, half + 18, top ? 0 : Math.PI, top ? Math.PI : TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Dev Kale: direklerin dışında dışa bakan oklar
      if (grow) {
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.fillStyle = `rgb(${SKILLS.grow.rgb})`;
        const oy = top ? 9 : H - 9, o = 6 + pulse * 5;
        for (const [x, d] of [[L - o, -1], [Rx + o, 1]]) {
          ctx.beginPath();
          ctx.moveTo(x + d * 9, oy);
          ctx.lineTo(x, oy - 6);
          ctx.lineTo(x, oy + 6);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // Kalan süre etiketleri
      let row = 0;
      for (const key of SKILL_KEYS) {
        if (g[key] <= 0) continue;
        const sk = SKILLS[key];
        const label = textSprite(`${sk.name}  ${Math.ceil(g[key])}`, `800 15px ${FONT}`, 15, sk.rgb, false);
        const y = top ? 36 + row * 20 : H - 36 - row * 20;
        ctx.save();
        ctx.translate(W / 2, y);
        if (top && pvp) ctx.rotate(Math.PI);
        ctx.globalAlpha = 0.9;
        drawSprite(label, 0, 0);
        ctx.restore();
        row++;
      }
    }
  }

  // Skill kullanıldığında kalenin önünden yükselen yazı
  function drawFloaters() {
    const pvp = settings.mode === 'pvp' && game.state !== 'demo';
    for (const f of floaters) {
      const t = f.t / f.dur;
      const top = f.gi === 1;
      const rise = 40 * t;
      const y = top ? 120 + rise : H - 120 - rise;
      const pop = t < 0.15 ? 1.5 - (t / 0.15) * 0.5 : 1;
      const alpha = t > 0.65 ? (1 - t) / 0.35 : 1;
      textGlow(f.text, W / 2, y, 46, f.rgb, alpha, pop, top && pvp);
    }
  }

  function render() {
    let ox = 0, oy = 0;
    if (game.shake > 0.3 && !reduceMotion) {
      ox = rand(-1, 1) * game.shake;
      oy = rand(-1, 1) * game.shake;
      // Sarsıntıda kenarlarda eski kare kalmasın
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05060f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(S, 0, 0, S, ox * S, oy * S);
    ctx.drawImage(tableLayer, 0, 0, LW, LH);
    ctx.translate(B, B);

    drawGoals();
    drawScores();
    drawRipples();
    drawPucks();
    drawMallets();
    drawParticles();

    if (game.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = game.flash * 0.28;
      ctx.fillStyle = `rgb(${game.flashRgb})`;
      ctx.fillRect(-B, -B, LW, LH);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    drawFloaters();
    drawBanner();
  }

  function drawScores() {
    if (game.state === 'demo') return;
    const pvp = settings.mode === 'pvp';
    const labels = pvp ? [COLORS[0].name, COLORS[1].name] : ['SEN', 'CPU'];
    for (let i = 0; i < 2; i++) {
      const p = game.pulse[i];
      const col = COLORS[i];
      const num = textSprite(String(game.score[i]), `italic 900 170px ${FONT}`, 170, col.rgb, false);
      const lab = textSprite(labels[i], `800 18px ${FONT}`, 18, col.rgb, false);
      ctx.save();
      ctx.translate(W / 2, i === 0 ? H * 0.75 : H * 0.25);
      if (i === 1 && pvp) ctx.rotate(Math.PI);
      const sc = 1 + p * p * 0.35;
      ctx.scale(sc, sc);
      ctx.globalAlpha = 0.1 + p * 0.55;
      drawSprite(num, 0, 0);
      ctx.globalAlpha = 0.28 + p * 0.5;
      drawSprite(lab, 0, 100);
      ctx.restore();
    }
  }

  function drawRipples() {
    if (!ripples.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const r of ripples) {
      const t = r.t / r.dur;
      const e = 1 - (1 - t) * (1 - t);
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.col;
      ctx.lineWidth = r.w * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, e), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgb(255,${Math.round(lerp(226, 110, heat))},${Math.round(lerp(110, 60, heat))})`;
      // Her ikinci noktayı çiz: aynı görünüm, yarı maliyet
      for (let i = n % 2; i < n; i += 2) {
        const t = (i + 1) / n;
        ctx.globalAlpha = t * t * 0.3;
        ctx.beginPath();
        ctx.arc(tr[i * 2], tr[i * 2 + 1], PUCK_R * (0.35 + 0.65 * t), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
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
    let cur = '';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      if (p.col !== cur) {
        cur = p.col;
        ctx.fillStyle = cur;
        ctx.strokeStyle = cur;
      }
      if (p.spark) {
        ctx.lineWidth = p.size * (0.4 + 0.6 * a);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      } else {
        const r = p.size * (0.4 + 0.6 * a);
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
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
    const sp = textSprite(text, `italic 900 ${size}px ${FONT}`, size, rgb, true);
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    ctx.scale(scale, scale);
    ctx.globalAlpha = clamp(alpha, 0, 1);
    drawSprite(sp, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Döngü
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const raw = now - last;
    const dt = Math.min(Math.max(raw / 1000, 0), 0.1);
    last = now;
    trackFrame(raw);
    if (dt > 0) update(dt);
    // Duraklatılmışken ekranda değişen bir şey yok: çizme (pil ve ısınma için)
    if (game.state !== 'paused') render();
    if (game.state !== 'demo') updateSkillUI();
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

  // Yazı tipi geç yüklenirse önbellekteki yazıları yeni yazı tipiyle yeniden üret
  if (document.fonts) {
    if (document.fonts.ready) document.fonts.ready.then(() => textCache.clear());
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => textCache.clear());
  }

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
  window.__airHockey = { game, pucks, mallets, settings, AI_LEVELS, quality, Sound, goals, skills, useSkill, step: update };
})();
