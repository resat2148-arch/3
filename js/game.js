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
  // Skiller: etki süresi saniye, delta kale genişliğine eklenir
  const SKILLS = {
    grow:   { dur: 5, delta: 120, name: 'DEV KALE',    label: 'Dev Kale',    rgb: '255,190,60' },
    shrink: { dur: 5, delta: -92, name: 'KALE KİLİDİ', label: 'Kale Kilidi', rgb: '190,245,255' },
  };

  const COLORS = [
    { main: '#19e6ff', light: '#c4faff', dark: '#064a74', rgb: '25,230,255', name: 'MAVİ', label: 'Mavi' },
    { main: '#ff3d9a', light: '#ffd0e6', dark: '#6e0a3c', rgb: '255,61,154', name: 'PEMBE', label: 'Pembe' },
  ];
  const PUCK_RGB = '255,226,110';
  const FONT = '"Exo 2", system-ui, sans-serif';

  const AI_LEVELS = {
    easy:   { speed: 540,  accel: 3000,  think: 0.22,  predict: 0.1,  aimErr: 1.0,  noise: 70, strike: 1.0,  bank: 0,    counter: false, skillSmart: 0.25, skillRandom: 0.01 },
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
    theme: ['water', 'ice', 'lava'].includes(store.get('theme', 'neon')) ? store.get('theme', 'neon') : 'neon',
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
      this.ambient(settings.theme);
    },
    // Temaya göre döngüsel ambiyans: su → havuz uğultusu; buz → arena uğultusu + diskin kayma sesi
    ambient(theme) {
      if (!this.ctx || this.ambTheme === theme) return;
      const c = this.ctx, t = c.currentTime;
      if (this.amb) {
        for (const n of this.amb.stop) n.stop(t + 0.8);
        this.amb.out.gain.cancelScheduledValues(t);
        this.amb.out.gain.setTargetAtTime(0, t, 0.15);
        this.amb = null;
        this.scrapeNode = null;
      }
      this.ambTheme = theme;
      if (theme !== 'water' && theme !== 'ice' && theme !== 'lava') return;
      const loop = () => {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        return src;
      };
      // Eski Safari'de connect() zincirlenemez: düğümleri tek tek bağla
      const chain = (...nodes) => {
        for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
      };
      const filt = (type, f, q, gain) => {
        const n = c.createBiquadFilter();
        n.type = type;
        n.frequency.value = f;
        n.Q.value = q;
        if (gain !== undefined) n.gain.value = gain;
        return n;
      };
      const out = c.createGain();
      out.gain.value = 1;
      out.connect(this.bus);
      const stop = [];
      if (theme === 'water') {
        const src = loop();
        const g = c.createGain();
        g.gain.value = 0.07;
        // Yavaş dalgalanma (dalgaların kıyıya vurması hissi)
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.23;
        const lfoGain = c.createGain();
        lfoGain.gain.value = 0.03;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        chain(src, filt('lowpass', 520, 0.4), filt('peaking', 260, 1, 5), g, out);
        src.start();
        lfo.start();
        stop.push(src, lfo);
      } else if (theme === 'lava') {
        // Yerin derinlerinden gelen gürleme, yavaşça kabarıp inen
        const rum = loop();
        const rg = c.createGain();
        rg.gain.value = 0.09;
        const lfo = c.createOscillator();
        lfo.frequency.value = 0.13;
        const lg = c.createGain();
        lg.gain.value = 0.04;
        lfo.connect(lg);
        lg.connect(rg.gain);
        chain(rum, filt('lowpass', 95, 0.8), filt('peaking', 55, 1.2, 6), rg, out);
        // Uzaktan gelen ateş hışırtısı
        const fire = loop();
        const fg = c.createGain();
        fg.gain.value = 0.012;
        chain(fire, filt('bandpass', 2400, 0.5), fg, out);
        rum.start();
        fire.start();
        lfo.start();
        stop.push(rum, fire, lfo);
      } else {
        // Soğuk arena uğultusu
        const hum = loop();
        const hg = c.createGain();
        hg.gain.value = 0.045;
        chain(hum, filt('lowpass', 170, 0.6), hg, out);
        hum.start();
        // Diskin buzda kayma sesi: kazancı hıza göre setScrape ile değişir
        const sc = loop();
        const sg = c.createGain();
        sg.gain.value = 0;
        chain(sc, filt('bandpass', 3400, 0.7), filt('highshelf', 6000, 0.7, -6), sg, out);
        sc.start();
        this.scrapeNode = sg;
        stop.push(hum, sc);
      }
      this.amb = { out, stop };
    },
    setScrape(level) {
      if (this.scrapeNode) this.scrapeNode.gain.setTargetAtTime(level, this.ctx.currentTime, 0.06);
    },
    // Buhar tıslaması: sıcak kabuğa değen darbe
    sizzle(k, x) {
      if (!this.ok('sizzle', 0.05)) return;
      const pan = this.panOf(x);
      this.noise({ dur: 0.18 + k * 0.4, vol: 0.12 + k * 0.3, type: 'highpass', freq: 3800, attack: 0.01, pan, rev: 0.2 });
      this.noise({ dur: 0.1 + k * 0.2, vol: 0.06 + k * 0.15, freq: 7000, freqTo: 4000, q: 0.8, pan });
    },
    // Kabuk kırılıp lav fışkırır: kaya çatırtısı + boğuk patlama + buhar
    eruption(e, x) {
      if (!this.ok('eruption', 0.08)) return;
      e = clamp(e, 0, 1.3);
      const pan = this.panOf(x);
      this.tone({ f0: 110 + e * 30, f1: 36, dur: 0.45 + e * 0.35, vol: 0.5 + e * 0.4, pan: pan * 0.5, rev: 0.3 });
      this.noise({ dur: 0.5 + e * 0.5, vol: 0.3 + e * 0.35, type: 'lowpass', freq: 1400, freqTo: 120, q: 0.7, pan, rev: 0.35 });
      const n = 5 + Math.round(e * 10);
      for (let i = 0; i < n; i++) {
        const t = 0.01 + Math.pow(Math.random(), 1.6) * (0.15 + e * 0.25);
        this.noise({ dur: 0.008 + Math.random() * 0.02, vol: 0.15 + e * 0.3 * Math.random(), freq: 700 + Math.random() * 1500, q: 1.5, delay: t, pan });
      }
      this.noise({ dur: 0.5 + e * 0.6, vol: 0.1 + e * 0.18, type: 'highpass', freq: 4200, delay: 0.08, attack: 0.08, pan, rev: 0.3 });
    },
    // Lav kabarcığı patlaması
    bloop(x) {
      if (!this.ok('bloop', 0.3)) return;
      const f = 90 + Math.random() * 70;
      this.tone({ f0: f * 1.6, f1: f, dur: 0.14, vol: 0.12, pan: this.panOf(x) * 0.6, rev: 0.2 });
      this.noise({ dur: 0.06, vol: 0.05, type: 'lowpass', freq: 500, delay: 0.1 });
    },
    // Buz çatlaması: tok vuruşun ardından cam kırılmasını andıran ince çıtırtılar; güçlü
    // çatlakta donmuş göllere özgü, perdesi hızla inen yayılım çınlaması ("pıuv")
    crackle(e, x) {
      if (!this.ok('crackle', 0.06)) return;
      e = clamp(e, 0, 1.2);
      const pan = this.panOf(x);
      const n = 8 + Math.round(e * 22);
      for (let i = 0; i < n; i++) {
        // Çatlak yayıldıkça önce sık, sonra seyrek çıtırtılar
        const t = 0.025 + Math.pow(Math.random(), 1.8) * (0.18 + e * 0.35);
        const p = clamp(pan + (Math.random() - 0.5) * 0.35, -1, 1);
        this.noise({ dur: 0.004 + Math.random() * 0.01, vol: 0.12 + e * 0.32 * Math.random(), type: 'highpass', freq: 2500 + Math.random() * 4500, delay: t, pan: p });
        if (Math.random() < 0.45) {
          const f = 2200 + Math.random() * 4200;
          this.tone({ f0: f, f1: f * 0.92, dur: 0.02 + Math.random() * 0.05, vol: 0.05 + e * 0.07, delay: t, pan: p, rev: 0.25 });
        }
      }
      // Buz levhasının kırılma çatırtısı
      this.noise({ dur: 0.06 + e * 0.08, vol: 0.22 + e * 0.35, freq: 1800, freqTo: 900, q: 1.4, delay: 0.02, pan });
      if (e > 0.6) {
        this.tone({ f0: 2600, f1: 260, dur: 0.35 + e * 0.2, vol: 0.09 + e * 0.06, delay: 0.05, pan, rev: 0.45 });
        this.tone({ f0: 1900, f1: 190, dur: 0.4 + e * 0.2, type: 'triangle', vol: 0.05, delay: 0.09, pan, rev: 0.5 });
      }
    },
    // Su sıçraması: süpürülen gürültü + yükselen kabarcık sesleri (kabarcık yükseldikçe perdesi artar)
    splash(k, x) {
      if (!this.ok('splash', 0.05)) return;
      const pan = this.panOf(x);
      this.noise({ dur: 0.16 + k * 0.28, vol: 0.2 + k * 0.5, freq: 1500 + k * 900, freqTo: 320, q: 0.9, pan, rev: 0.25 });
      this.noise({ dur: 0.08, vol: 0.12 + k * 0.25, type: 'highpass', freq: 5000, pan });
      const nb = 2 + Math.round(k * 4);
      for (let i = 0; i < nb; i++) {
        const f = 380 + Math.random() * 760;
        this.tone({ f0: f, f1: f * 1.9, dur: 0.045 + Math.random() * 0.05, vol: 0.06 + k * 0.1, delay: 0.03 + Math.random() * 0.2, pan, rev: 0.15 });
      }
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
  // Saydam tuval: su temasında oyun alanının altından WebGL su katmanı görünür.
  const ctx = canvas.getContext('2d', { alpha: true });
  const waterCanvas = document.getElementById('water');
  const isWater = () => settings.theme === 'water';
  const isIce = () => settings.theme === 'ice';
  const isLava = () => settings.theme === 'lava';
  const stage = document.getElementById('stage');
  let S = 1; // mantıksal birim başına cihaz pikseli
  let cssScale = 1, boardShaken = false;
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
    cssScale = scale;
    textCache.clear();
    const board = canvas.parentElement;
    board.style.width = cssW + 'px';
    board.style.height = cssH + 'px';
    if (isWater()) {
      // Su yumuşak bir yüzey: daha düşük çözünürlükte çizmek görüntüyü bozmaz, çok hızlandırır
      const wd = Math.min(dpr, 1.5) * (quality.lite ? 0.75 : 1);
      Water.resize(cssW, cssH, wd, Math.round(44 * scale));
    }
    buildTable();
    buildSprites();
    if (isWater()) Water.render();
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

  // Lav teması: volkanik kaya kenar, kararmış bazalt kabuk, kabuğun çatlak ağı (sabit hafif
  // parıltı dahil) ve ısıya dayanıklı soluk saha çizgileri.
  function buildLavaTable(g) {
    rr(g, 0, 0, LW, LH, 44);
    const rock = g.createLinearGradient(0, 0, LW, LH);
    rock.addColorStop(0, '#3a302b');
    rock.addColorStop(0.5, '#1c1714');
    rock.addColorStop(1, '#2e2520');
    g.fillStyle = rock;
    g.fill();
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    for (let i = 0; i < 700; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.25)';
      g.fillRect(rnd() * LW, rnd() * LH, 1.4, 1.4);
    }
    g.restore();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.6)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    // Kenardan sızan kor
    g.save();
    g.shadowColor = 'rgba(255, 90, 20, 0.9)';
    g.shadowBlur = 14 * S;
    rr(g, B - 2, B - 2, W + 4, H + 4, 28);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 110, 30, 0.75)';
    g.stroke();
    g.restore();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();
    // Bazalt kabuk plakaları ve dikişleri
    g.drawImage(Lava.crust, 0, 0, W, H);
    // Isıya dayanıklı soluk saha çizgileri
    g.lineCap = 'round';
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#e8d8c8', 5, 0.5, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#e8d8c8', 4, 0.45, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    [['#ff6aa6', 0, 0, Math.PI], ['#4cc8f5', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      paint(colr, 5, 0.6, () => g.arc(W / 2, y, 118, a0, a1));
    });
    // Sabit hafif lav parıltısı (hafif modda tek parıltı budur)
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3;
    g.drawImage(Lava.glow, 0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Kenarlarda koyu kabuk
    const E = 26;
    const edge = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gr;
    };
    g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
  }

  // Lav teması pakı: içi kızgın, kenarı parlayan obsidyen disk (koyu kabuk üzerinde seçilir)
  function buildLavaPuck(c, g, r) {
    const halo = g.createRadialGradient(0, 0, r * 0.8, 0, 0, r + PS_PAD * 0.7);
    halo.addColorStop(0, 'rgba(255, 140, 40, 0.5)');
    halo.addColorStop(1, 'rgba(255, 90, 20, 0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, r + PS_PAD * 0.7, 0, TAU);
    g.fill();
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#4a3a34');
    body.addColorStop(1, '#0c0706');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.shadowColor = 'rgba(255, 120, 30, 1)';
    g.shadowBlur = 10 * S;
    g.strokeStyle = '#ffb347';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, r - 2, 0, TAU);
    g.stroke();
    // Yüzeydeki kızgın damarlar
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(255, 170, 60, 0.9)';
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.1); g.lineTo(-r * 0.1, r * 0.05); g.lineTo(r * 0.15, -r * 0.3);
    g.moveTo(-r * 0.1, r * 0.05); g.lineTo(r * 0.2, r * 0.45);
    g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255, 255, 255, 0.2)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.11, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Buz teması: saha kenarı (beyaz bant + sarı tekme şeridi), derin buzul gölü, buzun içinde
  // donmuş kabarcıklar ve eski çatlaklar, buz altı çizgileri, kırağı, kenarda kar, ışık parlaması.
  function buildIceTable(g) {
    // Kenar bantları
    rr(g, 0, 0, LW, LH, 44);
    const bd = g.createLinearGradient(0, 0, LW, LH);
    bd.addColorStop(0, '#f4f8fb');
    bd.addColorStop(0.5, '#cfdbe4');
    bd.addColorStop(1, '#eaf1f6');
    g.fillStyle = bd;
    g.fill();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.stroke();
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.6)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });
    // Tekme şeridi
    rr(g, B - 6, B - 6, W + 12, H + 12, 31);
    g.fillStyle = '#e9b93c';
    g.fill();
    rr(g, B - 3, B - 3, W + 6, H + 6, 28);
    g.fillStyle = '#2a5f86';
    g.fill();

    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.clip();

    // Derin göl: ortada aydınlık turkuaz, kenarlara doğru koyu derinlik
    const deep = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.72);
    deep.addColorStop(0, '#1b8aa6');
    deep.addColorStop(0.45, '#0c5a77');
    deep.addColorStop(1, '#03263c');
    g.fillStyle = deep;
    g.fillRect(0, 0, W, H);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Göl tabanı: koyu taş gölgeleri ve açık su lekeleri
    for (let i = 0; i < 26; i++) {
      const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const light = rnd() < 0.4;
      gr.addColorStop(0, light ? 'rgba(90, 210, 230, 0.12)' : 'rgba(0, 20, 35, 0.16)');
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Derinde donmuş küçük kabarcıklar (bulanık, mavimsi)
    g.shadowColor = 'rgba(180, 235, 255, 0.6)';
    g.shadowBlur = 4 * S;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = rnd() * H, r = 1 + rnd() * 3;
      g.fillStyle = `rgba(190, 235, 250, ${0.08 + rnd() * 0.14})`;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.shadowBlur = 0;

    // Buzun içinde kalmış eski çatlaklar
    Ice.staticFractures(g);

    // Buz altına boyanmış çizgiler (hafif bulanık, buzun içinden görünür)
    g.lineCap = 'round';
    g.shadowBlur = 5 * S;
    const paint = (color, width, alpha, fn) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.lineWidth = width;
      g.beginPath();
      fn();
      g.stroke();
      g.globalAlpha = 1;
    };
    paint('#d8283e', 6, 0.6, () => { g.moveTo(0, H / 2); g.lineTo(W, H / 2); });
    paint('#2a6fd6', 4, 0.55, () => g.arc(W / 2, H / 2, 80, 0, TAU));
    paint('#2a6fd6', 3, 0.45, () => {
      [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => { g.moveTo(x + 34, y); g.arc(x, y, 34, 0, TAU); });
    });
    g.globalAlpha = 0.7;
    g.fillStyle = '#2a6fd6';
    g.beginPath();
    g.arc(W / 2, H / 2, 7, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    [['#d6407c', 0, 0, Math.PI], ['#1f97d8', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
      g.globalAlpha = 0.1;
      g.fillStyle = colr;
      g.beginPath();
      g.arc(W / 2, y, 118, a0, a1);
      g.fill();
      paint(colr, 4, 0.55, () => g.arc(W / 2, y, 118, a0, a1));
    });
    g.shadowBlur = 0;

    // Yarı saydam buz gövdesi
    g.fillStyle = 'rgba(170, 225, 240, 0.12)';
    g.fillRect(0, 0, W, H);

    // Buza hapsolmuş kabarcık kümeleri (farklı derinliklerde üst üste yassı diskler)
    for (let s = 0; s < 11; s++) {
      const bx = 30 + rnd() * (W - 60), by = 40 + rnd() * (H - 80);
      const ang = rnd() * TAU, count = 3 + ((rnd() * 4) | 0);
      for (let i = count - 1; i >= 0; i--) {
        const x = bx + Math.cos(ang) * i * 4, y = by + Math.sin(ang) * i * 4;
        const r = (5 + rnd() * 7) * (1 - i * 0.12);
        const deepK = i / count;
        g.fillStyle = `rgba(${Math.round(225 - deepK * 40)}, 248, 255, ${0.12 + (1 - deepK) * 0.16})`;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.82, ang, 0, TAU);
        g.fill();
        g.lineWidth = 0.8;
        g.strokeStyle = `rgba(255, 255, 255, ${0.2 + (1 - deepK) * 0.3})`;
        g.stroke();
        g.fillStyle = `rgba(255, 255, 255, ${0.25 + (1 - deepK) * 0.35})`;
        g.beginPath();
        g.ellipse(x - r * 0.35, y - r * 0.35, r * 0.28, r * 0.14, -0.7, 0, TAU);
        g.fill();
      }
    }

    // Yüzey kırağısı: ince tozlanma ve eski kullanım çizikleri
    g.fillStyle = 'rgba(255, 255, 255, 0.09)';
    for (let i = 0; i < 1600; i++) g.fillRect(rnd() * W, rnd() * H, 0.9, 0.9);
    g.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, l = 20 + rnd() * 70;
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + 0.3) * l * 0.5, y + Math.sin(a + 0.3) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    }
    g.stroke();

    // Bantların dibinde biriken kar
    const E = 24;
    const snow = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(245, 252, 255, 0.5)');
      gr.addColorStop(0.35, 'rgba(235, 248, 255, 0.18)');
      gr.addColorStop(1, 'rgba(235, 248, 255, 0)');
      return gr;
    };
    g.fillStyle = snow(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = snow(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = snow(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = snow(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 500; i++) {
      const side = (rnd() * 4) | 0, d = Math.pow(rnd(), 2) * 16;
      const t = rnd();
      const x = side === 0 ? d : side === 1 ? W - d : t * W;
      const y = side === 2 ? d : side === 3 ? H - d : t * H;
      g.fillRect(x, y, 1.2, 1.2);
    }

    // Arena ışıklarının buzdaki parlaması
    const sheen = g.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.36, 'rgba(255, 255, 255, 0.07)');
    sheen.addColorStop(0.46, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)');
    sheen.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, W, H);
    [[W * 0.26, H * 0.2], [W * 0.74, H * 0.8]].forEach(([x, y]) => {
      g.save();
      g.translate(x, y);
      g.scale(1, 0.55);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      gr.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      gr.addColorStop(1, 'rgba(255, 255, 255, 0)');
      g.fillStyle = gr;
      g.fillRect(-120, -120, 240, 240);
      g.restore();
    });
    g.restore();

    // Buz kenarı
    g.save();
    g.translate(B, B);
    rr(g, 0, 0, W, H, 26);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(230, 250, 255, 0.7)';
    g.stroke();
    g.restore();
  }

  // Buz teması pakı: klasik siyah kauçuk hokey diski
  function buildIcePuck(c, g, r) {
    g.save();
    g.shadowColor = 'rgba(0, 20, 40, 0.55)';
    g.shadowBlur = 8 * S;
    g.shadowOffsetX = 3 * S;
    g.shadowOffsetY = 5 * S;
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(0, 0, r - 1, 0, TAU);
    g.fill();
    g.restore();
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#4a4f5a');
    body.addColorStop(0.6, '#1b1d22');
    body.addColorStop(1, '#07080a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    // Kenardaki tırtıklı doku
    g.setLineDash([2, 2]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    g.beginPath();
    g.arc(0, 0, r - 1.5, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.34, r * 0.12, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // Su teması: havuz kenarı (taş kaplama + su hattı fayans bandı); oyun alanı saydam bırakılır,
  // altından WebGL su katmanı görünür. WebGL yoksa taban durağan olarak çizilir.
  function buildPoolTable(g) {
    // Kaplama taşı
    rr(g, 0, 0, LW, LH, 44);
    const st = g.createLinearGradient(0, 0, LW, LH);
    st.addColorStop(0, '#eef2f5');
    st.addColorStop(0.5, '#c9d2da');
    st.addColorStop(1, '#e3e8ed');
    g.fillStyle = st;
    g.fill();
    // Taş derzleri
    g.save();
    rr(g, 0, 0, LW, LH, 44);
    g.clip();
    g.strokeStyle = 'rgba(90, 105, 120, 0.25)';
    g.lineWidth = 1;
    for (let x = 36; x < LW; x += 36) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, B - 7); g.moveTo(x, LH - B + 7); g.lineTo(x, LH); g.stroke();
    }
    for (let y = 36; y < LH; y += 36) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(B - 7, y); g.moveTo(LW - B + 7, y); g.lineTo(LW, y); g.stroke();
    }
    g.restore();
    rr(g, 1.5, 1.5, LW - 3, LH - 3, 43);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    g.stroke();

    // Kale uçlarında takım renginde şerit
    [[COLORS[1], 4], [COLORS[0], LH - 8]].forEach(([col, y]) => {
      g.fillStyle = `rgba(${col.rgb}, 0.55)`;
      rr(g, LW / 2 - 150, y, 300, 4, 2);
      g.fill();
    });

    // Su hattı: koyu mavi fayans bandı
    rr(g, B - 7, B - 7, W + 14, H + 14, 32);
    g.fillStyle = '#0d4f7c';
    g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    g.lineWidth = 1;
    g.stroke();

    g.save();
    g.translate(B, B);
    if (Water.ok) {
      // Oyun alanını sil: su altta görünür
      g.globalCompositeOperation = 'destination-out';
      rr(g, 0, 0, W, H, 26);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    } else {
      rr(g, 0, 0, W, H, 26);
      g.save();
      g.clip();
      g.drawImage(Water.floor, 0, 0, W, H);
      g.fillStyle = 'rgba(4, 60, 96, 0.38)';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
    // Duvarın suya düşen gölgesi ve suyun kenara değdiği ince parlak çizgi
    g.save();
    rr(g, 0, 0, W, H, 26);
    g.clip();
    const E = 18;
    const side = (x0, y0, x1, y1) => {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(0, 20, 35, 0.35)');
      gr.addColorStop(1, 'rgba(0, 20, 35, 0)');
      return gr;
    };
    g.fillStyle = side(0, 0, E, 0); g.fillRect(0, 0, E, H);
    g.fillStyle = side(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
    g.fillStyle = side(0, 0, 0, E); g.fillRect(0, 0, W, E);
    g.fillStyle = side(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
    g.restore();
    rr(g, 0, 0, W, H, 26);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(210, 240, 255, 0.55)';
    g.stroke();
    g.restore();
  }

  // Statik masa katmanı: yalnızca boyut değiştiğinde yeniden çizilir.
  function buildTable() {
    const [c, g] = makeLayer(LW, LH);
    tableLayer = c;
    g.fillStyle = '#05060f'; // opak tuvalin köşeleri (CSS ile yuvarlatılır)
    g.fillRect(0, 0, LW, LH);
    if (isWater()) {
      buildPoolTable(g);
      return;
    }
    if (isIce()) {
      buildIceTable(g);
      Ice.attach(c, g);
      return;
    }
    if (isLava()) {
      buildLavaTable(g);
      Lava.attach(c, g);
      return;
    }

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
    malletSprites = COLORS.map((col) => buildMallet(col, settings.theme));
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
    puckSprite = buildPuck(settings.theme);
  }

  // neon: parlak hale + gölge; su: hale yok, suyla temas çizgisi (menisküs); buz: yalnızca gölge
  function buildMallet(col, style = 'neon') {
    const [c, g] = makeLayer(MS, MS);
    const R = MALLET_R;
    g.translate(MS / 2, MS / 2);

    if (style === 'water') {
      meniscus(g, R);
    } else {
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

    if (style === 'neon') {
      // Hale
      const halo = g.createRadialGradient(0, 0, R * 0.85, 0, 0, R + MS_PAD);
      halo.addColorStop(0, `rgba(${col.rgb},0.5)`);
      halo.addColorStop(1, `rgba(${col.rgb},0)`);
      g.fillStyle = halo;
      g.beginPath();
      g.arc(0, 0, R + MS_PAD, 0, TAU);
      g.fill();
    }
    }

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

  // Suya oturan nesnenin çevresindeki ince karanlık/aydınlık halka
  function meniscus(g, R) {
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0, 25, 45, 0.35)';
    g.beginPath();
    g.arc(0, 0, R + 3.5, 0, TAU);
    g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(225, 245, 255, 0.55)';
    g.beginPath();
    g.arc(0, 0, R + 1.5, 0, TAU);
    g.stroke();
  }

  function buildPuck(style = 'neon') {
    const [c, g] = makeLayer(PS, PS);
    const r = PUCK_R;
    g.translate(PS / 2, PS / 2);

    if (style === 'water') return buildWaterPuck(c, g, r);
    if (style === 'ice') return buildIcePuck(c, g, r);
    if (style === 'lava') return buildLavaPuck(c, g, r);

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

  // Su teması pakı: suda yüzen, parlak turuncu kauçuk disk (mavi su üzerinde iyi seçilir)
  function buildWaterPuck(c, g, r) {
    meniscus(g, r);
    const body = g.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    body.addColorStop(0, '#ffb066');
    body.addColorStop(0.55, '#ff6a1a');
    body.addColorStop(1, '#a8360a');
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath();
    g.arc(0, 0, r * 0.6, 0, TAU);
    g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.45)';
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.45, r * 0.34, r * 0.13, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  // ---------------------------------------------------------------------------
  // Su Stadyumu: gerçek zamanlı su yüzeyi
  // Fizik: yükseklik alanında dalga denklemi (duvarlardan yansır, zamanla söner).
  // Etkileşim: raket ve paklar suyun hacmini iter (önde çukur, arkada kabarma → baş dalgası
  // ve iz); çarpışmalar sıçrama, hızlı hareket köpük üretir.
  // Görüntü (WebGL): havuz tabanı ışığın kırılmasıyla görünür; yüzey eğriliğinden kostikler,
  // Fresnel yansıması, projektör pırıltıları, nesnelerin tabana düşen gölgeleri ve köpük.
  // ---------------------------------------------------------------------------
  const Water = (() => {
    const NX = 108, NY = 180;          // ızgara: hücre = 5 oyun birimi
    const CELL = W / NX;
    const N = NX * NY;
    const STEP = 1 / 150;              // simülasyon adımı (sn)
    const SPEED = 0.62;                // dalga hızı katsayısı (< 2 kararlı)
    const DAMP = 0.9985;               // adım başına sönümleme (dalgalar birkaç saniye yaşar)
    const VISC = 0.05;                 // viskozite: kısa dalgaları yumuşatır, sırtlar yuvarlaklaşır
    const h = new Float32Array(N), v = new Float32Array(N), foam = new Float32Array(N);
    const avgBuf = new Float32Array(N);
    const pix = new Uint8ClampedArray(N * 4);
    const pixU8 = new Uint8Array(pix.buffer);
    const bodies = new Map();
    const objs = new Float32Array(16); // gölgeler için en fazla 4 nesne: x, y, yarıçap, güç
    let acc = 0, time = 0, dirty = true;
    let gl = null, canvas = null, prog = null, simTex = null, floorTex = null, U = null;
    let ok = false, tried = false;
    let floor = null;

    const VS = `
      attribute vec2 aPos;
      attribute vec2 aUv;
      varying vec2 vUv;
      void main() { vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      varying vec2 vUv;
      uniform sampler2D uSim;
      uniform sampler2D uFloor;
      uniform vec2 uSize;
      uniform float uTime;
      uniform float uLite;
      uniform vec4 uObj[4];

      const float DEPTH = 60.0;                  // su derinliği (oyun birimi)
      const float SLOPE = 3.0;                   // simülasyon eğimi → yüzey normali
      const vec3 DEEP = vec3(0.0, 0.30, 0.46);   // derin su rengi (soğurma)

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      // Hareketli hücre deseni: F2 - F1 sınırları, ince dalgacıkların taban üzerinde
      // topladığı ışık çizgilerine (kostik) benzer.
      float cells(vec2 p, float t) {
        vec2 ip = floor(p), fp = fract(p);
        float f1 = 8.0, f2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            float a = hash(ip + g), b = hash(ip + g + 17.7);
            vec2 o = 0.5 + 0.4 * vec2(sin(t * (0.8 + a) + 6.2831 * a), cos(t * (0.7 + b) + 6.2831 * b));
            float d = length(g + o - fp);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
          }
        }
        return 1.0 - smoothstep(0.02, 0.2, f2 - f1);
      }

      // Havuz sirkülasyonunun oluşturduğu çok küçük dalgacıklar (yüzey eğimine katkı)
      vec2 ripples(vec2 p, float t) {
        vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.55, 0.83), d3 = vec2(0.15, -0.99), d4 = vec2(-0.96, -0.28);
        vec2 g = d1 * cos(dot(p, d1) * 0.23 + t * 1.7);
        g += d2 * cos(dot(p, d2) * 0.37 + t * 2.3) * 0.7;
        g += d3 * cos(dot(p, d3) * 0.61 + t * 2.9) * 0.45;
        g += d4 * cos(dot(p, d4) * 0.97 + t * 3.8) * 0.3;
        return g * 0.012;
      }

      void main() {
        vec2 p = vUv * uSize;
        vec4 s = texture2D(uSim, vUv);
        vec2 grad = (s.rg - 0.5) * SLOPE + ripples(p, uTime);
        vec3 N = normalize(vec3(grad.x, 1.0, grad.y));
        vec3 I = vec3(0.0, -1.0, 0.0);

        // Kırılma: taban, dalga eğimine göre kaymış görünür (hava → su, n = 1.33)
        vec3 T = refract(I, N, 0.7519);
        vec2 off = T.xz / max(-T.y, 0.3) * DEPTH;
        vec2 fp = p + off;
        vec2 fuv = fp / uSize;
        vec2 disp = off / uSize * 0.035; // renk ayrışması (hafif dispersiyon)
        vec3 floorCol = vec3(
          texture2D(uFloor, fuv + disp).r,
          texture2D(uFloor, fuv).g,
          texture2D(uFloor, fuv - disp).b);

        // Kostikler: dışbükey yüzey ışığı tabanda toplar (simülasyondan) + ince dalgacık deseni
        float focus = (texture2D(uSim, fuv).b - 0.5) * 3.2;
        float c = cells(fp / 34.0 + grad * 3.0, uTime * 0.8) * 0.6;
        if (uLite < 0.5) c += cells(fp / 21.0 - grad * 4.0 + 5.1, uTime * 1.15) * 0.4;
        floorCol *= 0.8 + clamp(focus, -0.55, 1.6) * 0.7 + c * 0.24;

        // Yüzen nesnelerin tabana düşen yumuşak gölgeleri
        float sh = 1.0;
        for (int k = 0; k < 4; k++) {
          vec4 o = uObj[k];
          float d = length(fp - o.xy - vec2(9.0, 15.0)) / max(o.z, 1.0);
          sh *= 1.0 - o.w * 0.42 * (1.0 - smoothstep(0.7, 1.55, d));
        }
        floorCol *= sh;

        // Derinlik boyunca ışık soğurması
        vec3 col = mix(DEEP, floorCol, 0.66);

        // Fresnel: eğik yüzeyler stadyum çatısını yansıtır
        vec3 Rf = reflect(I, N);
        float fres = 0.02 + 0.98 * pow(1.0 - clamp(N.y, 0.0, 1.0), 5.0);
        vec3 env = mix(vec3(0.02, 0.04, 0.08), vec3(0.09, 0.13, 0.19), clamp(Rf.y, 0.0, 1.0));
        col = mix(col, env, clamp(fres * 1.4, 0.0, 1.0));

        // Dört köşe projektörünün dalga yamaçlarındaki pırıltısı
        vec3 L1 = normalize(vec3(-0.42, 1.0, -0.58)), L2 = normalize(vec3(0.42, 1.0, -0.58));
        vec3 L3 = normalize(vec3(-0.42, 1.0, 0.58)), L4 = normalize(vec3(0.42, 1.0, 0.58));
        float sp = pow(max(dot(Rf, L1), 0.0), 700.0) + pow(max(dot(Rf, L2), 0.0), 700.0)
                 + pow(max(dot(Rf, L3), 0.0), 700.0) + pow(max(dot(Rf, L4), 0.0), 700.0);
        float sheen = pow(max(dot(Rf, L1), 0.0), 40.0) + pow(max(dot(Rf, L4), 0.0), 40.0);
        col += vec3(1.0, 0.97, 0.9) * (sp * 2.6 + sheen * 0.05);

        // Köpük: kabarcık dokusuyla
        float fo = s.a;
        if (uLite < 0.5) fo *= 0.55 + 0.45 * cells(p / 5.0, uTime * 2.0);
        col = mix(col, vec3(0.94, 0.98, 1.0), clamp(fo, 0.0, 0.92));

        gl_FragColor = vec4(col, 1.0);
      }`;

    // Havuz tabanı: mozaik fayanslar ve tabana boyanmış saha çizgileri
    function buildFloor() {
      const k = 1.25;
      const c = document.createElement('canvas');
      c.width = Math.round(W * k);
      c.height = Math.round(H * k);
      const g = c.getContext('2d');
      g.scale(k, k);
      g.fillStyle = '#6fb4c9'; // derz
      g.fillRect(0, 0, W, H);
      const T = 18, gap = 1.3;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < H; y += T) {
        for (let x = 0; x < W; x += T) {
          const l = 74 + rnd() * 7, s = 62 + rnd() * 12;
          g.fillStyle = `hsl(${188 + rnd() * 6}, ${s}%, ${l}%)`;
          g.fillRect(x + gap / 2, y + gap / 2, T - gap, T - gap);
        }
      }
      // Boyalı çizgiler
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(12, 52, 96, 0.85)';
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, 80, 0, TAU);
      g.stroke();
      g.fillStyle = 'rgba(12, 52, 96, 0.85)';
      g.beginPath();
      g.arc(W / 2, H / 2, 10, 0, TAU);
      g.fill();
      [[0, H / 4], [W, H / 4], [0, (H * 3) / 4], [W, (H * 3) / 4]].forEach(([x, y]) => {
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, y, 34, 0, TAU);
        g.stroke();
      });
      [['#b8285e', 0, 0, Math.PI], ['#0d6fb3', H, Math.PI, TAU]].forEach(([colr, y, a0, a1]) => {
        g.globalAlpha = 0.22;
        g.fillStyle = colr;
        g.beginPath();
        g.arc(W / 2, y, 118, a0, a1);
        g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = colr;
        g.lineWidth = 7;
        g.beginPath();
        g.arc(W / 2, y, 118, a0, a1);
        g.stroke();
        g.globalAlpha = 1;
      });
      // Duvar diplerinde ortam gölgesi
      const edge = (x0, y0, x1, y1) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(0, 30, 50, 0.45)');
        gr.addColorStop(1, 'rgba(0, 30, 50, 0)');
        return gr;
      };
      const E = 40;
      g.fillStyle = edge(0, 0, E, 0); g.fillRect(0, 0, E, H);
      g.fillStyle = edge(W, 0, W - E, 0); g.fillRect(W - E, 0, E, H);
      g.fillStyle = edge(0, 0, 0, E); g.fillRect(0, 0, W, E);
      g.fillStyle = edge(0, H, 0, H - E); g.fillRect(0, H - E, W, E);
      return c;
    }

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }

    function setupGL() {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
      gl.useProgram(prog);

      // Yalnızca oyun alanını kaplayan dörtgen (kenar 2B katmanda çizilir)
      const x0 = (B / LW) * 2 - 1, x1 = ((B + W) / LW) * 2 - 1;
      const yT = 1 - (B / LH) * 2, yB = 1 - ((B + H) / LH) * 2;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x0, yT, 0, 0, x1, yT, 1, 0, x0, yB, 0, 1, x1, yB, 1, 1,
      ]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos'), aUv = gl.getAttribLocation(prog, 'aUv');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(aUv);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

      const tex = (unit) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      simTex = tex(0);
      encode();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NX, NY, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixU8);
      floorTex = tex(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, floor);

      U = {};
      for (const n of ['uSim', 'uFloor', 'uSize', 'uTime', 'uLite', 'uObj']) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform1i(U.uSim, 0);
      gl.uniform1i(U.uFloor, 1);
      gl.uniform2f(U.uSize, W, H);
      gl.clearColor(0.02, 0.05, 0.09, 1);
      dirty = true;
    }

    function init(el) {
      if (tried) return ok;
      tried = true;
      canvas = el;
      floor = buildFloor();
      try {
        const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' };
        gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
        if (!gl) return false;
        setupGL();
        ok = true;
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ok = false; });
        canvas.addEventListener('webglcontextrestored', () => {
          try { setupGL(); ok = true; } catch (err) { ok = false; }
        });
      } catch (err) {
        ok = false;
      }
      return ok;
    }

    function resize(cssW, cssH, dpr, radius) {
      if (!canvas) return;
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.style.borderRadius = radius + 'px';
      if (!ok) return;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // Yumuşak (kosinüs) tümsek ekler; amt < 0 çukur açar
    function stamp(cx, cy, r, amt) {
      const gx = cx / CELL - 0.5, gy = cy / CELL - 0.5, gr = r / CELL;
      const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(NX - 1, Math.ceil(gx + gr));
      const y0 = Math.max(0, Math.floor(gy - gr)), y1 = Math.min(NY - 1, Math.ceil(gy + gr));
      const inv = 1 / gr;
      for (let y = y0; y <= y1; y++) {
        const dy = y - gy;
        for (let x = x0; x <= x1; x++) {
          const dx = x - gx;
          const t = Math.sqrt(dx * dx + dy * dy) * inv;
          if (t < 1) h[y * NX + x] += amt * (0.5 + 0.5 * Math.cos(Math.PI * t));
        }
      }
    }

    function addFoam(cx, cy, r, amt) {
      const gx = cx / CELL - 0.5, gy = cy / CELL - 0.5, gr = r / CELL;
      const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(NX - 1, Math.ceil(gx + gr));
      const y0 = Math.max(0, Math.floor(gy - gr)), y1 = Math.min(NY - 1, Math.ceil(gy + gr));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = Math.hypot(x - gx, y - gy) / gr;
          if (t < 1) {
            const i = y * NX + x;
            foam[i] = Math.min(1, foam[i] + amt * (1 - t));
          }
        }
      }
    }

    // Çarpışma / gol sıçraması: çukur + halka dalgası + köpük
    function splash(x, y, k) {
      if (!tried) return;
      k = clamp(k, 0, 2);
      stamp(x, y, 12 + k * 16, -(0.2 + k * 0.8));
      addFoam(x, y, 14 + k * 14, 0.25 + k * 0.6);
    }

    function simStep() {
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
        for (let x = 0; x < NX; x++) {
          const i = row + x;
          const l = x > 0 ? h[i - 1] : h[i];
          const r = x < NX - 1 ? h[i + 1] : h[i];
          const avg = (l + r + h[up + x] + h[dn + x]) * 0.25;
          avgBuf[i] = avg;
          v[i] = (v[i] + (avg - h[i]) * SPEED) * DAMP;
        }
      }
      for (let i = 0; i < N; i++) {
        h[i] = (h[i] + v[i] + (avgBuf[i] - h[i]) * VISC) * 0.99995;
        foam[i] *= 0.991;
      }
    }

    // Yükseklik alanı → doku: R/G yüzey eğimi, B eğrilik (kostik), A köpük
    function encode() {
      for (let y = 0; y < NY; y++) {
        const row = y * NX;
        const up = y > 0 ? row - NX : row, dn = y < NY - 1 ? row + NX : row;
        for (let x = 0; x < NX; x++) {
          const i = row + x, j = i * 4;
          const c = h[i];
          const l = x > 0 ? h[i - 1] : c, r = x < NX - 1 ? h[i + 1] : c;
          const u = h[up + x], d = h[dn + x];
          pix[j] = 128 + (l - r) * 170;
          pix[j + 1] = 128 + (u - d) * 170;
          pix[j + 2] = 128 - (l + r + u + d - 4 * c) * 420;
          pix[j + 3] = foam[i] * 255;
        }
      }
      dirty = true;
    }

    // list: { id, x, y, r, depth } — o karedeki yüzen nesneler
    function update(dt, list, lite) {
      if (!tried) return;
      time += dt;
      acc = Math.min(acc + dt, STEP * 8);
      const n = Math.min(lite ? 2 : 4, Math.floor(acc / STEP));
      if (!n) return;
      acc -= n * STEP;

      // Kaybolan nesnelerin çukuru kapanır; yeni gelenler suya oturur
      for (const [id, b] of bodies) {
        if (!list.some((o) => o.id === id)) {
          stamp(b.x, b.y, b.r, b.depth);
          bodies.delete(id);
        }
      }
      for (const o of list) {
        let b = bodies.get(o.id);
        if (!b) {
          b = { x: o.x, y: o.y, r: o.r, depth: o.depth, sx: o.x, sy: o.y };
          bodies.set(o.id, b);
          stamp(o.x, o.y, o.r, -o.depth);
        }
        b.sx = b.x;
        b.sy = b.y;
      }

      for (let s = 1; s <= n; s++) {
        const f = s / n;
        for (const o of list) {
          const b = bodies.get(o.id);
          const nx = b.sx + (o.x - b.sx) * f, ny = b.sy + (o.y - b.sy) * f;
          const dist = Math.hypot(nx - b.x, ny - b.y);
          if (dist > 0.01) {
            // Hacim korunur: eski yerde su geri dolar, yeni yerde çukur açılır
            stamp(b.x, b.y, o.r, o.depth);
            stamp(nx, ny, o.r, -o.depth);
            const speed = dist / STEP;
            if (speed > 550) addFoam(nx, ny, o.r * 0.9, Math.min(0.25, (speed - 550) / 9000));
            b.x = nx;
            b.y = ny;
          }
        }
        // Havuz sirkülasyonundan küçük rastgele damlalar (yüzey hiç tamamen durmaz)
        if (Math.random() < 0.35) stamp(Math.random() * W, Math.random() * H, 6 + Math.random() * 8, (Math.random() - 0.5) * 0.05);
        simStep();
      }
      encode();
    }

    function render() {
      if (!ok) return;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, simTex);
      if (dirty) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NX, NY, gl.RGBA, gl.UNSIGNED_BYTE, pixU8);
        dirty = false;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, floorTex);
      gl.uniform1f(U.uTime, time);
      gl.uniform1f(U.uLite, quality.lite ? 1 : 0);
      gl.uniform4fv(U.uObj, objs);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function setObjects(list) {
      objs.fill(0);
      for (let k = 0; k < Math.min(4, list.length); k++) {
        const o = list[k];
        objs[k * 4] = o.x;
        objs[k * 4 + 1] = o.y;
        objs[k * 4 + 2] = o.r;
        objs[k * 4 + 3] = 1;
      }
    }

    function reset() {
      h.fill(0);
      v.fill(0);
      foam.fill(0);
      bodies.clear();
      encode();
    }

    function stats() {
      let mx = 0, bad = 0, mv = 0;
      for (let i = 0; i < N; i++) {
        const a = Math.abs(h[i]);
        if (!Number.isFinite(h[i])) bad++;
        else if (a > mx) mx = a;
        const b = Math.abs(v[i]);
        if (b > mv) mv = b;
      }
      return { maxH: +mx.toFixed(3), maxV: +mv.toFixed(3), bad, bodies: bodies.size };
    }

    return {
      init, resize, update, render, splash, setObjects, reset, stats,
      get ok() { return ok; },
      get floor() { return floor || (floor = buildFloor()); },
    };
  })();

  // ---------------------------------------------------------------------------
  // Buz Stadyumu: çatlayan dinamik buz
  // - Kalıcı iz katmanı: kayan disk ince çizikler, raket keçesi hafif sürtme izi bırakır.
  // - Sert şut / şiddetli duvar çarpması: çarpma noktasından dallanarak büyüyen çatlaklar
  //   (güçlü darbede halka çatlaklar); izler zamanla yavaşça "yeniden donar".
  // - Buzun altında süzülen ışık lekeleri ve yükselen silik kabarcıklar.
  // ---------------------------------------------------------------------------
  const Ice = (() => {
    const MK = 1.5; // iz katmanı çözünürlüğü (piksel / oyun birimi)
    let marks = null, mg = null, bubbleSprite = null, glowSprite = null;
    // Masa katmanı: izler ayrıca doğrudan buraya da çizilir (her karede tek kopya yeterli olur);
    // base = izsiz buz, yalnızca "yeniden donma" solmasında masa katmanını yeniden kurmak için.
    let tg = null, base = null;
    const targets = [];
    const cracks = [];
    const bubbles = [];
    const trails = new Map();
    let fadeT = 0, time = 0, scrapeLevel = 0;

    // Köşeleri yuvarlatılmış oyun alanının içinde mi
    function inField(x, y, pad = 3) {
      const R = 26;
      if (x < pad || y < pad || x > W - pad || y > H - pad) return false;
      const cx = clamp(x, R, W - R), cy = clamp(y, R, H - R);
      return Math.hypot(x - cx, y - cy) <= R - pad;
    }

    function newBubble(anyAge) {
      return {
        x: rand(24, W - 24), y: rand(24, H - 24), depth: rand(0.35, 1), r: rand(2.5, 7.5),
        vx: rand(-5, 5), vy: rand(-5, 5), ph: rand(0, TAU), age: anyAge ? rand(0, 9) : 0, life: rand(7, 15),
      };
    }

    function init() {
      if (marks) return;
      marks = document.createElement('canvas');
      marks.width = Math.round(W * MK);
      marks.height = Math.round(H * MK);
      mg = marks.getContext('2d');
      mg.setTransform(MK, 0, 0, MK, 0, 0);
      mg.lineCap = 'round';
      mg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg);

      bubbleSprite = document.createElement('canvas');
      bubbleSprite.width = bubbleSprite.height = 64;
      const b = bubbleSprite.getContext('2d');
      const gr = b.createRadialGradient(32, 32, 8, 32, 32, 30);
      gr.addColorStop(0, 'rgba(200, 240, 255, 0.04)');
      gr.addColorStop(0.72, 'rgba(210, 245, 255, 0.16)');
      gr.addColorStop(0.9, 'rgba(235, 252, 255, 0.55)');
      gr.addColorStop(1, 'rgba(235, 252, 255, 0)');
      b.fillStyle = gr;
      b.beginPath();
      b.arc(32, 32, 30, 0, TAU);
      b.fill();
      b.fillStyle = 'rgba(255, 255, 255, 0.75)';
      b.beginPath();
      b.ellipse(23, 22, 7, 3.5, -0.7, 0, TAU);
      b.fill();

      glowSprite = document.createElement('canvas');
      glowSprite.width = glowSprite.height = 128;
      const g2 = glowSprite.getContext('2d');
      const gg = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
      gg.addColorStop(0, 'rgba(120, 235, 255, 0.6)');
      gg.addColorStop(1, 'rgba(120, 235, 255, 0)');
      g2.fillStyle = gg;
      g2.fillRect(0, 0, 128, 128);

      for (let i = 0; i < 26; i++) bubbles.push(newBubble(true));
    }

    // Masa katmanını bağla: izsiz halini sakla, mevcut izleri üzerine işle
    function attach(layer, g) {
      init();
      base = document.createElement('canvas');
      base.width = layer.width;
      base.height = layer.height;
      base.getContext('2d').drawImage(layer, 0, 0);
      tg = g;
      tg.setTransform(S, 0, 0, S, B * S, B * S);
      tg.lineCap = 'round';
      tg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg, tg);
      compose();
    }

    function compose() {
      if (!tg || !base) return;
      tg.save();
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'copy';
      tg.drawImage(base, 0, 0);
      tg.restore();
      tg.drawImage(marks, 0, 0, W, H);
    }

    function reset() {
      init();
      mg.save();
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.clearRect(0, 0, marks.width, marks.height);
      mg.restore();
      cracks.length = 0;
      trails.clear();
      compose();
    }

    // Dallanan kırık çizgileri üretir; t = çatlağın o noktaya ulaştığı mesafe (büyüme animasyonu)
    function genSegs(x, y, e, dir, spread) {
      const segs = [];
      const full = spread >= TAU - 0.01;
      // Buz gevrek kırılır: düz parçalar, arada keskin kırılma açıları, seyrek dallanma
      const n = Math.round(3 + e * 3 + Math.random());
      const baseLen = 35 + e * 160, baseW = 0.8 + e * 1.0;
      const grow = (sx, sy, a, len, w, dist, lvl) => {
        let x0 = sx, y0 = sy, rem = len;
        while (rem > 0 && segs.length < 700) {
          const sl = 7 + Math.random() * 11;
          a += (Math.random() - 0.5) * 0.28;
          if (Math.random() < 0.18) a += (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.3);
          const x1 = x0 + Math.cos(a) * sl, y1 = y0 + Math.sin(a) * sl;
          if (!inField(x1, y1)) break;
          dist += sl;
          rem -= sl;
          segs.push({ x0, y0, x1, y1, w: w * (0.3 + 0.7 * Math.max(0, rem / len)), t: dist });
          x0 = x1;
          y0 = y1;
          if (lvl < 2 && rem > 20 && Math.random() < 0.08) {
            grow(x0, y0, a + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.55), rem * (0.3 + Math.random() * 0.3), w * 0.65, dist, lvl + 1);
          }
        }
      };
      for (let i = 0; i < n; i++) {
        const a = full ? (i / n) * TAU + (Math.random() - 0.5) * 0.6 : dir + (Math.random() - 0.5) * spread;
        grow(x, y, a, baseLen * (0.55 + Math.random() * 0.6), baseW, 0, 0);
      }
      // Güçlü darbede örümcek ağı gibi halka çatlaklar
      if (e > 0.55) {
        const rings = e > 0.9 ? 2 : 1;
        for (let k = 0; k < rings; k++) {
          const rr = (12 + e * 16) * (k + 1) * (0.85 + Math.random() * 0.3);
          const a0 = full ? 0 : dir - spread / 2, a1 = full ? TAU : dir + spread / 2;
          let a = a0 + Math.random() * 0.5;
          let px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          while (a < a1) {
            a += 0.18 + Math.random() * 0.22;
            const r2 = rr * (0.92 + Math.random() * 0.16);
            const nx = x + Math.cos(a) * r2, ny = y + Math.sin(a) * r2;
            if (Math.random() < 0.8 && inField(px, py) && inField(nx, ny)) {
              segs.push({ x0: px, y0: py, x1: nx, y1: ny, w: baseW * 0.55, t: rr + 30 + Math.random() * 20 });
            }
            px = nx;
            py = ny;
          }
        }
      }
      segs.sort((p, q) => p.t - q.t);
      return segs;
    }

    function line(g, x0, y0, x1, y1) {
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
    }

    // Çatlak: derinde koyu kırılma gölgesi + ışığı dağıtan buzlu hale + parlak beyaz çekirdek
    function drawSeg(g, s, alpha = 1) {
      g.strokeStyle = `rgba(0, 38, 66, ${0.3 * alpha})`;
      g.lineWidth = s.w + 1.2;
      line(g, s.x0 + 0.8, s.y0 + 1.2, s.x1 + 0.8, s.y1 + 1.2);
      g.strokeStyle = `rgba(215, 245, 255, ${0.14 * alpha})`;
      g.lineWidth = s.w * 4;
      line(g, s.x0, s.y0, s.x1, s.y1);
      g.strokeStyle = `rgba(255, 255, 255, ${0.9 * alpha})`;
      g.lineWidth = s.w;
      line(g, s.x0, s.y0, s.x1, s.y1);
    }

    // Darbe noktasında ezilip beyazlaşmış buz
    function bruise(x, y, r, a) {
      for (const g of targets) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(255, 255, 255, ${a})`);
        gr.addColorStop(0.5, `rgba(235, 250, 255, ${a * 0.45})`);
        gr.addColorStop(1, 'rgba(235, 250, 255, 0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
      }
    }

    function crack(x, y, e, dir = 0, spread = TAU) {
      init();
      e = clamp(e, 0.1, 1.2);
      x = clamp(x, 4, W - 4);
      y = clamp(y, 4, H - 4);
      const segs = genSegs(x, y, e, dir, spread);
      const maxT = segs.length ? segs[segs.length - 1].t : 1;
      cracks.push({ segs, i: 0, age: 0, dur: 0.16 + e * 0.22, maxT, e });
      bruise(x, y, 5 + e * 12, 0.35 + e * 0.35);
      if (cracks.length > 8) finish(cracks.shift());
    }

    function finish(c) {
      while (c.i < c.segs.length) {
        const sg = c.segs[c.i++];
        for (const g of targets) drawSeg(g, sg);
      }
    }

    // Kayma izleri: disk tabanının buzda açtığı ince paralel çizikler
    function scratch(id, x, y, r, speed, puck) {
      let tr = trails.get(id);
      if (!tr) {
        trails.set(id, { x, y, offs: [rand(-0.7, 0.7), rand(-0.7, 0.7), rand(-0.7, 0.7)] });
        return;
      }
      const dx = x - tr.x, dy = y - tr.y, d = Math.hypot(dx, dy);
      if (d > 160) { tr.x = x; tr.y = y; return; } // yeniden doğma / ışınlanma
      if (d < 0.6) return;
      const nx = -dy / d, ny = dx / d;
      if (Math.random() < 0.05) tr.offs[(Math.random() * 3) | 0] = rand(-0.7, 0.7);
      if (puck && speed > 170) {
        const col = `rgba(255, 255, 255, ${clamp(0.04 + speed / 7000, 0.04, 0.27).toFixed(3)})`;
        const lines = speed > 1100 && !quality.lite ? 3 : 2;
        for (const g of targets) {
          g.strokeStyle = col;
          g.lineWidth = 0.6;
          g.beginPath();
          for (let k = 0; k < lines; k++) {
            const o = tr.offs[k] * r;
            g.moveTo(tr.x + nx * o, tr.y + ny * o);
            g.lineTo(x + nx * o, y + ny * o);
          }
          g.stroke();
        }
      } else if (!puck && speed > 500) {
        const col = `rgba(235, 248, 255, ${Math.min(0.05, speed / 60000).toFixed(3)})`;
        for (const g of targets) {
          g.strokeStyle = col;
          g.lineWidth = r * 0.5;
          line(g, tr.x, tr.y, x, y);
        }
      }
      tr.x = x;
      tr.y = y;
    }

    function update(dt) {
      if (!marks) return;
      time += dt;

      // Çatlakların büyümesi (çatlak ucu hızla ilerler, uçlarda buz kristali pırıltısı)
      for (let k = cracks.length - 1; k >= 0; k--) {
        const c = cracks[k];
        c.age += dt;
        const upto = Math.min(1, c.age / c.dur) * c.maxT;
        let drawn = 0;
        while (c.i < c.segs.length && c.segs[c.i].t <= upto) {
          const s = c.segs[c.i++];
          for (const g of targets) drawSeg(g, s);
          if (++drawn % 14 === 0 && Math.random() < 0.6) spawn(s.x1, s.y1, '235,250,255', 1, 90, 0.35, 1.8);
        }
        if (c.i >= c.segs.length) cracks.splice(k, 1);
      }

      // Kayma izleri
      let sp = 0;
      for (let i = 0; i < pucks.length; i++) {
        const p = pucks[i];
        if (!p.active) { trails.delete('p' + i); continue; }
        const v = Math.hypot(p.vx, p.vy);
        sp += Math.min(v, 2000);
        scratch('p' + i, p.x, p.y, PUCK_R, v, true);
      }
      for (let i = 0; i < 2; i++) {
        const m = mallets[i];
        scratch('m' + i, m.x, m.y, MALLET_R, Math.hypot(m.vx, m.vy), false);
      }
      // Diskin buzda kayma sesi hıza göre
      const lvl = game.state === 'play' ? Math.min(0.07, (sp / 2000) * 0.05) : 0;
      if (Math.abs(lvl - scrapeLevel) > 0.003) {
        scrapeLevel = lvl;
        Sound.setScrape(lvl);
      }

      // Yeniden donma: izler yavaşça silinir
      fadeT += dt;
      if (fadeT > 1.5) {
        fadeT = 0;
        mg.save();
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.globalCompositeOperation = 'destination-out';
        mg.fillStyle = 'rgba(0, 0, 0, 0.035)';
        mg.fillRect(0, 0, marks.width, marks.height);
        mg.restore();
        compose();
      }

      // Buz altındaki kabarcıklar: yavaşça yükselir, akıntıyla süzülür
      const n = quality.lite ? 16 : bubbles.length;
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        b.age += dt;
        const k = 1.2 - b.depth;
        b.x += (b.vx + Math.sin(time * 0.7 + b.ph) * 3) * dt * k;
        b.y += (b.vy + Math.cos(time * 0.6 + b.ph) * 3) * dt * k;
        b.depth = Math.max(0.05, b.depth - dt * 0.03);
        if (b.age > b.life || !inField(b.x, b.y, 12)) bubbles[i] = newBubble(false);
      }
    }

    function drawUnder(c) {
      if (!marks) return;
      // Buzun altında süzülen ışık lekeleri (saha içinde kalacak boyutta: kırpma maskesi gerekmez)
      if (!quality.lite) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.1;
        const x = W / 2 + 70 * Math.sin(time * 0.05);
        const y = H * (0.5 + 0.28 * Math.cos(time * 0.04));
        c.drawImage(glowSprite, x - 150, y - 150, 300, 300);
        c.globalCompositeOperation = 'source-over';
      }
      const n = quality.lite ? 16 : bubbles.length;
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        const fade = Math.min(1, b.age / 1.5, (b.life - b.age) / 1.5);
        c.globalAlpha = Math.max(0, (0.1 + (1 - b.depth) * 0.3) * fade);
        const s = b.r * 2 * (1.6 - b.depth * 0.8);
        c.drawImage(bubbleSprite, b.x - s / 2, b.y - s / 2, s, s);
      }
      c.globalAlpha = 1;
    }

    // Masa katmanına, buzun içinde kalmış eski (iyileşmiş) silik çatlakları çizer
    function staticFractures(g) {
      for (let i = 0; i < 5; i++) {
        const segs = genSegs(rand(60, W - 60), rand(80, H - 80), rand(0.3, 0.8), 0, TAU);
        for (const s of segs) drawSeg(g, s, 0.12);
      }
    }

    return { init, reset, attach, crack, update, drawUnder, staticFractures, genSegs, bruise: (x, y, r, a) => { init(); bruise(x, y, r, a); } };
  })();

  // ---------------------------------------------------------------------------
  // Lav Stadyumu: kırılan bazalt kabuk ve altından akan lav
  // - Kalıcı katman (masa katmanı + izler): kabuk, is lekeleri, yeni kırıkların koyu kenarları.
  // - Parıltı katmanı: kabuğun çatlak ağından sızan lav, nabız gibi parlar ve titreşir.
  // - Isı katmanı: kayan diskin kızdırdığı iz ve yeni kırıklardan fışkıran lav; soğudukça
  //   turuncudan koyu kırmızıya döner ve kabuk yeniden bağlar.
  // ---------------------------------------------------------------------------
  const Lava = (() => {
    const MK = 1.5;   // kalıcı iz katmanı (piksel / birim)
    const GK = 0.5;   // parıltı ve ısı katmanları: düşük çözünürlük (büyütülünce doğal bulanıklık)
    let marks = null, mg = null, glow = null, heat = null, hg = null, tg = null, base = null;
    const targets = [];
    let crustImg = null, seamPts = null;
    const hot = [];      // soğumakta olan yeni kırıklar
    const growing = [];  // büyüyen kırıklar
    const embers = [];
    const trails = new Map();
    let time = 0, coolT = 0, fadeT = 0, bubbleT = 1, hotT = 0;
    // Isı katmanında son birkaç saniyede boyanan bölge (hafif modda yalnızca burası çizilir)
    const hb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, t: 0 };
    function touch(x0, y0, x1, y1, pad) {
      hb.x0 = Math.min(hb.x0, Math.min(x0, x1) - pad);
      hb.y0 = Math.min(hb.y0, Math.min(y0, y1) - pad);
      hb.x1 = Math.max(hb.x1, Math.max(x0, x1) + pad);
      hb.y1 = Math.max(hb.y1, Math.max(y0, y1) + pad);
      hb.t = 3.5;
    }

    function newEmber() {
      return { x: rand(10, W - 10), y: rand(10, H - 10), vx: rand(-14, 14), vy: rand(-22, -6), life: rand(2, 5), age: 0, s: rand(1, 2.4), ph: rand(0, TAU) };
    }

    function init() {
      if (marks) return;
      const mk = (k) => {
        const c = document.createElement('canvas');
        c.width = Math.round(W * k);
        c.height = Math.round(H * k);
        const g = c.getContext('2d');
        g.setTransform(k, 0, 0, k, 0, 0);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        return [c, g];
      };
      [marks, mg] = mk(MK);
      let gg;
      [glow, gg] = mk(GK);
      [heat, hg] = mk(GK);
      targets.length = 0;
      targets.push(mg);

      buildCrust(gg);
      for (let i = 0; i < 24; i++) embers.push(newEmber());
    }

    // Kabuk: düzensiz çokgen plakalar (bükülmüş Voronoi hücreleri); plakalar arasındaki
    // dikişlerden lav görünür. Piksel piksel bir kez hesaplanır.
    function buildCrust(gg) {
      const cols = 6, rows = 10, cw = W / cols, ch = H / rows;
      const seeds = [];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          seeds.push([(i + 0.15 + Math.random() * 0.7) * cw, (j + 0.15 + Math.random() * 0.7) * ch, Math.random()]);
        }
      }
      // (x, y) için en yakın iki plaka merkezine uzaklık farkı: dikişe olan mesafenin ölçüsü
      const cell = (x, y) => {
        // Kenarları düzensizleştiren bükme
        const wx = x + Math.sin(y * 0.045) * 7 + Math.sin(y * 0.13 + x * 0.05) * 3;
        const wy = y + Math.sin(x * 0.05) * 7 + Math.cos(x * 0.12 - y * 0.04) * 3;
        const ci = clamp(Math.floor(wx / cw), 0, cols - 1), cj = clamp(Math.floor(wy / ch), 0, rows - 1);
        let d1 = 1e9, d2 = 1e9, k1 = 0;
        for (let j = Math.max(0, cj - 1); j <= Math.min(rows - 1, cj + 1); j++) {
          for (let i = Math.max(0, ci - 1); i <= Math.min(cols - 1, ci + 1); i++) {
            const sd = seeds[j * cols + i];
            const d = Math.hypot(wx - sd[0], wy - sd[1]);
            if (d < d1) { d2 = d1; d1 = d; k1 = j * cols + i; } else if (d < d2) d2 = d;
          }
        }
        return [d2 - d1, seeds[k1][2]];
      };

      // Kabuk dokusu (1 piksel / birim)
      const cc = document.createElement('canvas');
      cc.width = W;
      cc.height = H;
      const cx = cc.getContext('2d');
      const img = cx.createImageData(W, H);
      const d = img.data;
      seamPts = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const [m, tone] = cell(x, y);
          const n = Math.random();
          let r, gC, b;
          if (m < 2.2) {
            // Dikişin kızgın özü
            const k = 1 - m / 2.2;
            r = 140 + 85 * k; gC = 36 + 50 * k * k; b = 10;
            if (m < 0.8 && Math.random() < 0.004) seamPts.push([x, y]);
          } else if (m < 6) {
            // Dikişin kararmış kenarı
            const k = (m - 2.2) / 3.8;
            r = 40 + 30 * k; gC = 14 + 14 * k; b = 8 + 8 * k;
          } else {
            // Plaka: kendi tonu, kenara doğru koyulaşan kabartma, pürüzlü yüzey
            const lift = Math.min(1, (m - 6) / 30);
            const base = 34 + tone * 18 + lift * 16;
            r = base + 8 + n * 10; gC = base * 0.72 + n * 7; b = base * 0.6 + n * 6;
          }
          const i = (y * W + x) * 4;
          d[i] = r; d[i + 1] = gC; d[i + 2] = b; d[i + 3] = 255;
        }
      }
      cx.putImageData(img, 0, 0);
      crustImg = cc;

      // Parıltı katmanı: dikişlerden sızan lav (düşük çözünürlük, doğal bulanık)
      const gw = glow.width, gh = glow.height;
      const gi = gg.createImageData(gw, gh);
      const gd = gi.data;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const [m] = cell(x / GK, y / GK);
          const a = Math.max(0, 1 - m / 9);
          const i = (y * gw + x) * 4;
          gd[i] = 255; gd[i + 1] = 90 + 110 * a * a; gd[i + 2] = 20 + 40 * a * a * a; gd[i + 3] = 255 * a * a;
        }
      }
      gg.putImageData(gi, 0, 0);
    }

    function segLine(g, s) {
      g.beginPath();
      g.moveTo(s.x0, s.y0);
      g.lineTo(s.x1, s.y1);
      g.stroke();
    }

    // Kabuk çatlağı: masa katmanında koyu kızıl yarık + ince turuncu öz
    function crustSeg(g, s, a = 1) {
      g.strokeStyle = `rgba(28, 6, 2, ${0.9 * a})`;
      g.lineWidth = s.w + 3;
      segLine(g, s);
      g.strokeStyle = `rgba(122, 28, 6, ${a})`;
      g.lineWidth = s.w + 1;
      segLine(g, s);
      g.strokeStyle = `rgba(170, 45, 10, ${0.45 * a})`;
      g.lineWidth = s.w * 0.5;
      segLine(g, s);
    }

    // Yeni kırıktan fışkıran sıcak lav (ısı katmanına)
    function lavaSeg(s, a) {
      touch(s.x0, s.y0, s.x1, s.y1, s.w * 3 + 6);
      hg.strokeStyle = `rgba(255, 110, 20, ${a})`;
      hg.lineWidth = s.w * 4 + 4;
      segLine(hg, s);
      hg.strokeStyle = `rgba(255, 235, 150, ${a})`;
      hg.lineWidth = s.w * 1.4 + 1;
      segLine(hg, s);
    }

    function pool(x, y, r, a) {
      touch(x, y, x, y, r + 2);
      const gr = hg.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255, 245, 190, ${a})`);
      gr.addColorStop(0.35, `rgba(255, 150, 40, ${a * 0.8})`);
      gr.addColorStop(1, 'rgba(255, 60, 0, 0)');
      hg.fillStyle = gr;
      hg.beginPath();
      hg.arc(x, y, r, 0, TAU);
      hg.fill();
    }

    function attach(layer, g) {
      init();
      base = document.createElement('canvas');
      base.width = layer.width;
      base.height = layer.height;
      base.getContext('2d').drawImage(layer, 0, 0);
      tg = g;
      tg.setTransform(S, 0, 0, S, B * S, B * S);
      tg.lineCap = 'round';
      tg.lineJoin = 'round';
      targets.length = 0;
      targets.push(mg, tg);
      compose();
    }

    function compose() {
      if (!tg || !base) return;
      tg.save();
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.globalCompositeOperation = 'copy';
      tg.drawImage(base, 0, 0);
      tg.restore();
      tg.drawImage(marks, 0, 0, W, H);
    }

    function clear(g, c) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.restore();
    }

    function reset() {
      init();
      clear(mg, marks);
      clear(hg, heat);
      hot.length = 0;
      growing.length = 0;
      trails.clear();
      compose();
    }

    // Kabuk kırılır: çatlak büyür, altından lav fışkırır
    function breakCrust(x, y, e, dir = 0, spread = TAU) {
      init();
      e = clamp(e, 0.1, 1.2);
      x = clamp(x, 4, W - 4);
      y = clamp(y, 4, H - 4);
      const segs = Ice.genSegs(x, y, e * 0.7, dir, spread);
      const maxT = segs.length ? segs[segs.length - 1].t : 1;
      const c = { segs, i: 0, age: 0, dur: 0.14 + e * 0.2, maxT, heatAge: 0, life: 4 + e * 4 };
      growing.push(c);
      hot.push(c);
      if (hot.length > 8) hot.shift();
      pool(x, y, 12 + e * 26, 0.9);
      for (const g of targets) {
        g.fillStyle = `rgba(20, 6, 2, ${0.4 + e * 0.3})`;
        g.beginPath();
        g.arc(x, y, 5 + e * 9, 0, TAU);
        g.fill();
      }
    }

    // Kayan disk kabuğu kızdırır ve is bırakır
    function slide(id, x, y, r, speed, puck) {
      let tr = trails.get(id);
      if (!tr) {
        trails.set(id, { x, y });
        return;
      }
      const d = Math.hypot(x - tr.x, y - tr.y);
      if (d > 160) { tr.x = x; tr.y = y; return; }
      if (d < 0.6) return;
      if (puck && speed > 150) {
        touch(tr.x, tr.y, x, y, r + 2);
        const a = Math.min(0.55, speed / 3600);
        hg.strokeStyle = `rgba(255, 110, 25, ${a.toFixed(3)})`;
        hg.lineWidth = r * 1.15;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
        hg.strokeStyle = `rgba(255, 225, 130, ${(a * 0.7).toFixed(3)})`;
        hg.lineWidth = r * 0.4;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
        const soot = `rgba(8, 3, 2, ${Math.min(0.06, speed / 30000).toFixed(3)})`;
        for (const g of targets) {
          g.strokeStyle = soot;
          g.lineWidth = r * 1.2;
          g.beginPath(); g.moveTo(tr.x, tr.y); g.lineTo(x, y); g.stroke();
        }
      } else if (!puck && speed > 400 && !quality.lite) {
        touch(tr.x, tr.y, x, y, r + 2);
        hg.strokeStyle = `rgba(255, 90, 20, ${Math.min(0.08, speed / 30000).toFixed(3)})`;
        hg.lineWidth = r * 0.9;
        hg.beginPath(); hg.moveTo(tr.x, tr.y); hg.lineTo(x, y); hg.stroke();
      }
      tr.x = x;
      tr.y = y;
    }

    function update(dt) {
      if (!marks) return;
      time += dt;

      // Büyüyen kırıklar
      for (let k = growing.length - 1; k >= 0; k--) {
        const c = growing[k];
        c.age += dt;
        const upto = Math.min(1, c.age / c.dur) * c.maxT;
        let n = 0;
        while (c.i < c.segs.length && c.segs[c.i].t <= upto) {
          const s = c.segs[c.i++];
          for (const g of targets) crustSeg(g, s);
          lavaSeg(s, 0.9);
          if (++n % 10 === 0 && Math.random() < 0.7) spawn(s.x1, s.y1, '255,170,60', 1, 120, 0.5, 2, { keep: true });
        }
        if (c.i >= c.segs.length) growing.splice(k, 1);
      }

      // Yeni kırıklar birkaç saniye sıcak kalır, sonra kabuk bağlar
      hotT += dt;
      if (hotT > 0.25) {
        hotT = 0;
        for (let k = hot.length - 1; k >= 0; k--) {
          const c = hot[k];
          c.heatAge += 0.25;
          const a = 0.3 * (1 - c.heatAge / c.life);
          if (a <= 0) { hot.splice(k, 1); continue; }
          for (let i = 0; i < c.i; i++) lavaSeg(c.segs[i], a);
        }
      }

      // Kızgın izler
      for (let i = 0; i < pucks.length; i++) {
        const p = pucks[i];
        if (!p.active) { trails.delete('p' + i); continue; }
        slide('p' + i, p.x, p.y, PUCK_R, Math.hypot(p.vx, p.vy), true);
      }
      for (let i = 0; i < 2; i++) {
        const m = mallets[i];
        slide('m' + i, m.x, m.y, MALLET_R, Math.hypot(m.vx, m.vy), false);
      }

      // Soğuma: ısı katmanı hızla, kalıcı izler yavaşça söner
      hb.t -= dt;
      if (hb.t <= 0) { hb.x0 = hb.y0 = 1e9; hb.x1 = hb.y1 = -1e9; }
      coolT += dt;
      if (coolT > 0.08) {
        coolT = 0;
        hg.save();
        hg.setTransform(1, 0, 0, 1, 0, 0);
        hg.globalCompositeOperation = 'destination-out';
        hg.fillStyle = 'rgba(0, 0, 0, 0.08)';
        hg.fillRect(0, 0, heat.width, heat.height);
        // Dikişlerden sızan lavın nabzı ısı katmanına işlenir: her karede ayrı bir katman
        // çizmek gerekmez (denge düzeyi = eklenen / sönen oran)
        if (!quality.lite) {
          hg.globalCompositeOperation = 'source-over';
          hg.globalAlpha = 0.08 * (0.3 + 0.16 * Math.sin(time * 1.3) + 0.06 * Math.sin(time * 5.3));
          hg.drawImage(glow, 0, 0);
        }
        hg.restore();
      }
      fadeT += dt;
      if (fadeT > 1.5) {
        fadeT = 0;
        mg.save();
        mg.setTransform(1, 0, 0, 1, 0, 0);
        mg.globalCompositeOperation = 'destination-out';
        mg.fillStyle = 'rgba(0, 0, 0, 0.03)';
        mg.fillRect(0, 0, marks.width, marks.height);
        mg.restore();
        compose();
      }

      // Çatlaklarda arada bir patlayan lav kabarcığı
      bubbleT -= dt;
      if (bubbleT <= 0 && seamPts.length) {
        bubbleT = rand(0.6, 1.8);
        const [bx, by] = seamPts[(Math.random() * seamPts.length) | 0];
        pool(bx, by, rand(6, 12), 0.7);
        spawn(bx, by, '255,160,50', 3, 60, 0.6, 1.8, { keep: true });
        if (game.state === 'play') Sound.bloop(bx);
      }

      // Kıvılcımlar: sıcak havada yükselip sönen közler
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.age += dt;
        e.x += (e.vx + Math.sin(time * 1.3 + e.ph) * 10) * dt;
        e.y += e.vy * dt;
        if (e.age > e.life || e.x < 4 || e.x > W - 4 || e.y < 4) embers[i] = newEmber();
      }
    }

    function drawOver(c) {
      if (!marks) return;
      c.globalCompositeOperation = 'lighter';
      // Isı katmanı: kızgın izler, yeni kırıklar ve dikişlerin nabzı tek çizimde.
      // Hafif modda nabız yok: yalnızca son ısınan bölge çizilir.
      if (!quality.lite) {
        c.drawImage(heat, 0, 0, W, H);
      } else if (hb.x1 > hb.x0) {
        const x0 = clamp(Math.floor(hb.x0), 0, W), y0 = clamp(Math.floor(hb.y0), 0, H);
        const x1 = clamp(Math.ceil(hb.x1), 0, W), y1 = clamp(Math.ceil(hb.y1), 0, H);
        if (x1 - x0 > 2 && y1 - y0 > 2) {
          c.drawImage(heat, x0 * GK, y0 * GK, (x1 - x0) * GK, (y1 - y0) * GK, x0, y0, x1 - x0, y1 - y0);
        }
      }
      // Közler
      const n = quality.lite ? 10 : embers.length;
      c.fillStyle = 'rgb(255, 170, 70)';
      for (let i = 0; i < n; i++) {
        const e = embers[i];
        const f = Math.min(1, e.age / 0.5, (e.life - e.age) / 0.8);
        c.globalAlpha = Math.max(0, f * (0.55 + 0.45 * Math.sin(time * 9 + e.ph)));
        c.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    return {
      init, reset, attach, update, drawOver, breakCrust,
      get crust() { init(); return crustImg; },
      get glow() { init(); return glow; },
      pool: (x, y, r, a) => { init(); pool(x, y, r, a); },
    };
  })();

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
    if (isWater() && !opts.keep) rgb = '215,240,255'; // suda kıvılcım yerine su damlası
    else if (isIce() && !opts.keep) rgb = '232,248,255'; // buzda kıvılcım yerine buz kristali
    else if (isLava() && !opts.keep) rgb = '255,150,50'; // lavda kor parçaları
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
    if (isWater()) {
      Water.splash(m.hx, m.hy, k * 0.9);
      Sound.splash(k * 0.8, m.hx);
    } else if (isIce()) {
      spawn(m.hx, m.hy, '', 3 + Math.round(k * 6), 120 + k * 200, 0.4, 2);
      if (k > 0.5) {
        const e = (k - 0.45) / 0.55;
        Ice.crack(m.hx, m.hy, e);
        spawn(m.hx, m.hy, '', 10 + Math.round(e * 22), 280 + e * 520, 0.6, 2.6);
        Sound.crackle(e, m.hx);
        game.shake = Math.max(game.shake, 3 + e * 6);
      }
    } else if (isLava()) {
      Sound.sizzle(k * 0.6, m.hx);
      if (k > 0.5) {
        const e = (k - 0.45) / 0.55;
        Lava.breakCrust(m.hx, m.hy, e);
        spawn(m.hx, m.hy, '255,190,80', 12 + Math.round(e * 26), 300 + e * 600, 0.8, 3, { keep: true });
        spawn(m.hx, m.hy, '255,110,30', 8 + Math.round(e * 12), 200 + e * 400, 1.1, 2.4, { keep: true, spark: true });
        Sound.eruption(e, m.hx);
        game.shake = Math.max(game.shake, 4 + e * 7);
      }
    }
    if (!m.ai) vibrate(Math.round(6 + k * 18));
  }

  function onWallHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, PUCK_RGB, 6, 30 + k * 40, 0.4, 2.5);
    if (k > 0.2) spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 350, 0.35, 2.4, { spark: true });
    Sound.wall(k, x);
    if (isWater()) {
      Water.splash(x, y, k * 0.7);
      Sound.splash(k * 0.55, x);
    } else if (isIce()) {
      // Çarpılan duvar ve sahaya doğru yön
      let wx = x, wy = y, dir;
      if (x <= PUCK_R + 1) { wx = 2; dir = 0; }
      else if (x >= W - PUCK_R - 1) { wx = W - 2; dir = Math.PI; }
      else if (y <= PUCK_R + 1) { wy = 2; dir = Math.PI / 2; }
      else { wy = H - 2; dir = -Math.PI / 2; }
      Ice.bruise(wx, wy, 6 + k * 8, 0.18 + k * 0.25); // bantta kar tozu
      if (k > 0.45) {
        const e = (k - 0.4) / 0.6;
        Ice.crack(wx, wy, e, dir, Math.PI * 0.95);
        spawn(wx, wy, '', 8 + Math.round(e * 16), 250 + e * 450, 0.55, 2.4, { dir, spread: 1.2 });
        Sound.crackle(e * 0.9, x);
      }
    } else if (isLava()) {
      let wx = x, wy = y, dir;
      if (x <= PUCK_R + 1) { wx = 2; dir = 0; }
      else if (x >= W - PUCK_R - 1) { wx = W - 2; dir = Math.PI; }
      else if (y <= PUCK_R + 1) { wy = 2; dir = Math.PI / 2; }
      else { wy = H - 2; dir = -Math.PI / 2; }
      Lava.pool(wx, wy, 6 + k * 10, 0.3 + k * 0.4);
      Sound.sizzle(k * 0.5, x);
      if (k > 0.45) {
        const e = (k - 0.4) / 0.6;
        Lava.breakCrust(wx, wy, e, dir, Math.PI * 0.95);
        spawn(wx, wy, '255,180,70', 10 + Math.round(e * 18), 260 + e * 480, 0.8, 2.6, { dir, spread: 1.2, keep: true });
        Sound.eruption(e * 0.8, x);
      }
    }
  }

  function onPuckHit(x, y, imp) {
    const k = clamp(imp / 1800, 0, 1);
    ripple(x, y, '255,255,255', 8, 40 + k * 40, 0.35, 3);
    spawn(x, y, '255,255,255', Math.round(4 + k * 10), 200 + k * 400, 0.35, 2.4, { spark: true });
    spawn(x, y, PUCK_RGB, Math.round(3 + k * 8), 150 + k * 300, 0.4, 2.4, { spark: true });
    Sound.clack(k, x);
    if (isWater()) Water.splash(x, y, k * 0.6);
    else if (isIce() && k > 0.6) {
      Ice.crack(x, y, (k - 0.55) * 1.2);
      Sound.crackle((k - 0.55) * 1.4, x);
    } else if (isLava() && k > 0.6) {
      Lava.breakCrust(x, y, (k - 0.55) * 1.2);
      Sound.eruption((k - 0.55) * 1.2, x);
    }
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
    spawn(gx, gy, col.rgb, 70, 1100, 1.1, 4, { dir, spread: 1.25, spark: true, keep: true });
    Water.splash(gx, scorer === 0 ? 14 : H - 14, 1.8);
    if (isWater()) Sound.splash(1, gx);
    if (isIce()) {
      Ice.crack(gx, scorer === 0 ? 3 : H - 3, 1.1, scorer === 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.9);
      Sound.crackle(1, gx);
    } else if (isLava()) {
      // Lav patlaması
      const ly = scorer === 0 ? 6 : H - 6;
      Lava.breakCrust(gx, ly, 1.15, scorer === 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.95);
      Lava.pool(gx, ly, 70, 1);
      spawn(gx, ly, '255,200,90', 50, 900, 1.3, 3.5, { dir, spread: 1.4, keep: true });
      spawn(gx, ly, '255,90,20', 30, 600, 1.6, 2.6, { dir, spread: 1.5, keep: true, spark: true });
      Sound.eruption(1.2, gx);
    }
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
  const FREE_PER_MATCH = 1; // her maçta her skillden ücretsiz hak

  // Maç içi ücretsiz haklar (oyuncu başına)
  const skills = [
    { grow: FREE_PER_MATCH, shrink: FREE_PER_MATCH, aiTimer: 1 },
    { grow: FREE_PER_MATCH, shrink: FREE_PER_MATCH, aiTimer: 1 },
  ];

  // Satın alınmış haklar: cihazda saklanır; iki oyunculu modda iki oyuncu da buradan kullanır.
  const inventory = loadInventory();

  function loadInventory() {
    const v = store.get('inventory', null) || {};
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    return { grow: n(v.grow), shrink: n(v.shrink) };
  }

  function saveInventory() {
    store.set('inventory', { grow: inventory.grow, shrink: inventory.shrink });
  }

  const floaters = [];

  function resetSkills() {
    for (const sk of skills) {
      sk.grow = sk.shrink = FREE_PER_MATCH;
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

  // Önce maçın ücretsiz hakkı, sonra satın alınmış envanter harcanır; ikisi de yoksa mağaza açılır.
  function useSkill(p, key) {
    const st = game.state, human = !mallets[p].ai;
    // Maç başındaki geri sayımda da kullanılabilir; etki süresi top oyuna girince işlemeye başlar.
    if (!(st === 'play' || st === 'demo' || (st === 'countdown' && human))) return false;
    const gi = skillGoal(p, key);
    if (goals[gi][key] > 0) {
      // Aynı etki zaten sürüyor: hak boşa harcanmasın
      if (human) Sound.denied();
      return false;
    }
    if (skills[p][key] > 0) {
      skills[p][key]--;
    } else if (human && inventory[key] > 0) {
      inventory[key]--;
      saveInventory();
    } else {
      if (human) openStore({ focus: key, fromGame: true });
      return false;
    }
    const sk = SKILLS[key];
    goals[gi][key] = sk.dur;
    const gy = gi === 1 ? 0 : H;
    ripple(W / 2, gy, sk.rgb, 20, 240, 0.7, 6);
    spawn(W / 2, gy, sk.rgb, 34, 650, 0.8, 3, { dir: gi === 1 ? Math.PI / 2 : -Math.PI / 2, spread: 1.3, spark: true });
    floaters.push({ text: sk.name + '!', gi, rgb: sk.rgb, t: 0, dur: 1.3 });
    if (isWater()) Water.splash(W / 2, gi === 1 ? 16 : H - 16, 1.2);
    if (isIce()) {
      Ice.crack(W / 2, gi === 1 ? 3 : H - 3, 0.6, gi === 1 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.8);
      Sound.crackle(0.5, W / 2);
    } else if (isLava()) {
      Lava.breakCrust(W / 2, gi === 1 ? 4 : H - 4, 0.6, gi === 1 ? Math.PI / 2 : -Math.PI / 2, Math.PI * 0.8);
      Sound.eruption(0.5, W / 2);
    }
    Sound.skill(key);
    if (human) vibrate(25);
    skillUI.dirty = true;
    return true;
  }

  function updateSkills(dt) {
    for (let p = 0; p < 2; p++) {
      if (!mallets[p].ai) continue;
      skills[p].aiTimer -= dt;
      if (skills[p].aiTimer <= 0) {
        skills[p].aiTimer = 0.4;
        aiSkills(p);
      }
    }
    for (const g of goals) {
      g.grow = Math.max(0, g.grow - dt);
      g.shrink = Math.max(0, g.shrink - dt);
    }
  }

  // Yapay zekâ yalnızca ücretsiz haklarını kullanır: kalesine hızlı top geliyorsa kilitler,
  // rakip kaleye şut gidiyorsa büyütür.
  function aiSkills(p) {
    const L = mallets[p].level, sk = skills[p];
    if (sk.grow <= 0 && sk.shrink <= 0) return;
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
    if (threat && sk.shrink > 0 && Math.random() < L.skillSmart) useSkill(p, 'shrink');
    else if (attack && sk.grow > 0 && Math.random() < L.skillSmart) useSkill(p, 'grow');
    else if (L.skillRandom && Math.random() < L.skillRandom) useSkill(p, sk.grow > 0 ? 'grow' : 'shrink');
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
    if (e.code === 'Escape' && storeEl.classList.contains('show')) {
      if (storeState.pending) cancelPurchase();
      else closeStore();
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
    [menuEl, pauseEl, overEl, cardEl, storeEl].forEach((o) => o.classList.toggle('show', o === el));
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
    if (isIce()) Ice.reset();
    if (isLava()) Lava.reset();
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
        ? 'Her skillden 1 ücretsiz hakkın var! Alttaki düğmelerle kullan.'
        : 'Her skillden 1 ücretsiz hakkın var! 1 ve 2 tuşlarıyla ya da düğmelerle kullan.'), 1800);
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
    if (isWater()) updateWater(dt);
    else if (isIce()) Ice.update(dt);
    else if (isLava()) Lava.update(dt);
  }

  // Suda yüzen nesneler: raketler daha derin oturur (daha çok su iter), paklar daha sığ
  const floatBodies = [
    { id: 'm0', x: 0, y: 0, r: MALLET_R, depth: 0.62 },
    { id: 'm1', x: 0, y: 0, r: MALLET_R, depth: 0.62 },
    { id: 'p0', x: 0, y: 0, r: PUCK_R, depth: 0.45 },
    { id: 'p1', x: 0, y: 0, r: PUCK_R, depth: 0.45 },
  ];
  const floatList = [];

  function updateWater(dt) {
    floatList.length = 0;
    for (let i = 0; i < 2; i++) {
      const b = floatBodies[i];
      b.x = mallets[i].x;
      b.y = mallets[i].y;
      floatList.push(b);
    }
    for (let i = 0; i < pucks.length && i < 2; i++) {
      const p = pucks[i];
      if (!p.visible) continue;
      const b = floatBodies[2 + i];
      b.x = p.x;
      b.y = p.y;
      floatList.push(b);
    }
    Water.update(dt, floatList, quality.lite);
    Water.setObjects(floatList);
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
    if (storeEl.classList.contains('show')) return; // mağaza kendi kapanışını yönetir
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
    const playing = game.state === 'play' || game.state === 'countdown';
    for (let p = 0; p < 2; p++) {
      const bar = skillBars[p];
      if (bar.classList.contains('hidden')) continue;
      for (const btn of bar.children) {
        const key = btn.dataset.skill, sk = SKILLS[key];
        const free = skills[p][key], owned = mallets[p].ai ? 0 : inventory[key];
        const left = goals[skillGoal(p, key)][key];
        let state, sub, badge, fill;
        if (left > 0) {
          state = 'active';
          sub = `Aktif · ${Math.ceil(left)} sn`;
          fill = left / sk.dur;
        } else if (free > 0 || owned > 0) {
          state = playing ? 'ready' : 'wait';
          sub = free > 0 ? (key === 'grow' ? 'Rakip kale büyür' : 'Kalen küçülür') : `Envanter: ${owned}`;
          fill = 1;
        } else {
          state = 'buy';
          sub = 'Satın al';
          fill = 0;
        }
        badge = free > 0 ? 'ÜCRETSİZ' : owned > 0 ? `×${owned}` : '+';
        const f = Math.round(fill * 40) / 40;
        const sig = `${state}|${sub}|${badge}|${f}`;
        if (btn._sig === sig && !skillUI.dirty) continue;
        btn._sig = sig;
        for (const c of ['ready', 'active', 'buy', 'wait']) btn.classList.toggle(c, c === state);
        btn.style.setProperty('--fill', String(f));
        btn.querySelector('small').textContent = sub;
        const b = btn.querySelector('.skill-count');
        b.textContent = badge;
        b.classList.toggle('free', free > 0);
      }
    }
    skillUI.dirty = false;
  }

  // ---------------------------------------------------------------------------
  // Mağaza ve satın alma
  // ---------------------------------------------------------------------------
  // Fiyatlar örnektir; gerçek fiyatlar ödeme sağlayıcısında tanımlanan ürünlerden gelmelidir.
  const PRODUCTS = [
    { id: 'grow_3', name: 'Dev Kale', desc: '3 kullanım', give: { grow: 3 }, price: '₺9,99' },
    { id: 'shrink_3', name: 'Kale Kilidi', desc: '3 kullanım', give: { shrink: 3 }, price: '₺9,99' },
    { id: 'bundle_5', name: 'Skill Paketi', desc: '5 Dev Kale + 5 Kale Kilidi', give: { grow: 5, shrink: 5 }, price: '₺24,99', tag: 'En avantajlı' },
  ];

  // Ödeme sağlayıcısı. Şu an TEST modunda: ödeme alınmaz, ürün doğrudan verilir.
  // Gerçek ödeme için purchase() bir ödeme altyapısına (Google Play Faturalandırma, App Store,
  // Stripe vb.) bağlanmalı ve envanter, satın almayı doğrulayan bir sunucudan gelmelidir;
  // tarayıcıda tutulan envanter kullanıcı tarafından değiştirilebilir.
  const Payments = {
    mode: 'test',
    purchase(product) {
      return Promise.resolve({ ok: true, productId: product.id, test: true });
    },
  };

  const SKILL_ICONS = {
    grow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6v12M15 6v12M2 12h4M4 10l-2 2 2 2M22 12h-4M20 10l2 2-2 2"/></svg>',
    shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12h6"/></svg>',
  };

  const storeEl = $('storeMenu'), storeList = $('storeList'), storeConfirm = $('storeConfirm');
  const storeState = { fromGame: false, focus: null, back: null, pending: null, busy: false };

  function renderInventory() {
    $('invGrow').textContent = inventory.grow;
    $('invShrink').textContent = inventory.shrink;
    const sum = $('menuInv');
    if (sum) sum.textContent = `Envanter: ${inventory.grow} Dev Kale · ${inventory.shrink} Kale Kilidi`;
  }

  function renderProducts() {
    storeList.textContent = '';
    for (const pr of PRODUCTS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'product';
      const keys = Object.keys(pr.give);
      b.dataset.kind = keys.length > 1 ? 'bundle' : keys[0];
      if (storeState.focus && pr.give[storeState.focus] && keys.length === 1) b.classList.add('suggest');
      const icons = keys.map((k) => SKILL_ICONS[k]).join('');
      b.innerHTML = `
        <span class="product-ico" aria-hidden="true">${icons}</span>
        <span class="product-text"><b></b><small></small></span>
        <span class="product-price"></span>`;
      b.querySelector('b').textContent = pr.name;
      b.querySelector('small').textContent = pr.desc;
      b.querySelector('.product-price').textContent = pr.price;
      if (pr.tag) {
        const t = document.createElement('em');
        t.className = 'product-tag';
        t.textContent = pr.tag;
        b.appendChild(t);
      }
      b.setAttribute('aria-label', `${pr.name}, ${pr.desc}, ${pr.price}`);
      b.addEventListener('click', () => askPurchase(pr));
      storeList.appendChild(b);
    }
  }

  function openStore({ focus = null, fromGame = false } = {}) {
    storeState.focus = focus;
    storeState.fromGame = fromGame;
    storeState.pending = null;
    if (fromGame) {
      // Maç duraklatılır, mağaza kapanınca kaldığı yerden sürer
      game.resumeState = game.state;
      game.state = 'paused';
      keys.clear();
      storeState.back = null;
    } else {
      storeState.back = [menuEl, overEl, pauseEl].find((o) => o.classList.contains('show')) || menuEl;
    }
    $('storeMsg').textContent = focus
      ? `Bu maçtaki ücretsiz ${SKILLS[focus].label} hakkını kullandın. Devam etmek için paket al.`
      : 'Her maçta her skillden 1 ücretsiz hakkın var. Daha fazlası için paket al.';
    storeConfirm.classList.add('hidden');
    storeList.classList.remove('hidden');
    renderProducts();
    renderInventory();
    showOverlay(storeEl);
  }

  function closeStore() {
    if (storeState.fromGame) {
      storeState.fromGame = false;
      resume();
    } else {
      showOverlay(storeState.back || menuEl);
    }
  }

  function askPurchase(pr) {
    storeState.pending = pr;
    $('confirmName').textContent = `${pr.name} · ${pr.desc}`;
    $('confirmPrice').textContent = pr.price;
    storeList.classList.add('hidden');
    storeConfirm.classList.remove('hidden');
    $('confirmBuy').focus();
  }

  function cancelPurchase() {
    storeState.pending = null;
    storeConfirm.classList.add('hidden');
    storeList.classList.remove('hidden');
  }

  function confirmPurchase() {
    const pr = storeState.pending;
    if (!pr || storeState.busy) return;
    storeState.busy = true;
    $('confirmBuy').disabled = true;
    Payments.purchase(pr).then((res) => {
      if (!res || !res.ok) throw new Error('declined');
      for (const k of Object.keys(pr.give)) inventory[k] += pr.give[k];
      saveInventory();
      renderInventory();
      skillUI.dirty = true;
      Sound.ready();
      const got = Object.keys(pr.give).map((k) => `${SKILLS[k].label} +${pr.give[k]}`).join(', ');
      toast(`Satın alındı: ${got}`);
      if (storeState.fromGame) closeStore();
      else cancelPurchase();
    }).catch(() => {
      toast('Satın alma tamamlanamadı. Ödeme alınmadı.');
      cancelPurchase();
    }).finally(() => {
      storeState.busy = false;
      $('confirmBuy').disabled = false;
    });
  }

  $('confirmBuy').addEventListener('click', confirmPurchase);
  $('confirmCancel').addEventListener('click', cancelPurchase);
  $('storeClose').addEventListener('click', closeStore);
  $('menuStoreBtn').addEventListener('click', () => openStore());
  $('overStoreBtn').addEventListener('click', () => openStore());

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

  // Tema: Neon ya da Su Stadyumu
  function applyTheme() {
    const t = settings.theme;
    if (t === 'water' && !Water.init(waterCanvas)) {
      toast('Bu cihaz WebGL desteklemiyor: su durağan gösterilecek.');
    }
    document.body.classList.toggle('theme-water', t === 'water');
    document.body.classList.toggle('theme-ice', t === 'ice');
    document.body.classList.toggle('theme-lava', t === 'lava');
    goalSprites[0] = goalSprites[1] = null;
    if (t === 'water') Water.reset();
    if (t === 'ice') Ice.reset();
    if (t === 'lava') Lava.reset();
    resize();
    Sound.ambient(t);
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
      const prev = settings[key];
      settings[key] = b.dataset.value;
      store.set(key, settings[key]);
      syncMenu();
      if (key === 'theme' && prev !== settings.theme) applyTheme();
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
    if (isWater()) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    let ox = 0, oy = 0;
    if (isWater()) {
      // Su ve kenar birlikte sarsılsın: iki tuvali taşıyan kutuyu kaydır
      const board = canvas.parentElement;
      if (game.shake > 0.3 && !reduceMotion) {
        const k = cssScale;
        board.style.transform = `translate(${(rand(-1, 1) * game.shake * k).toFixed(1)}px, ${(rand(-1, 1) * game.shake * k).toFixed(1)}px)`;
        boardShaken = true;
      } else if (boardShaken) {
        board.style.transform = '';
        boardShaken = false;
      }
    } else if (game.shake > 0.3 && !reduceMotion) {
      ox = rand(-1, 1) * game.shake;
      oy = rand(-1, 1) * game.shake;
      // Sarsıntıda kenarlarda eski kare kalmasın (su temasında tuval zaten her karede temizleniyor;
      // doldurmak alttaki suyu örterdi)
      if (!isWater()) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#05060f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    ctx.setTransform(S, 0, 0, S, ox * S, oy * S);
    ctx.drawImage(tableLayer, 0, 0, LW, LH);
    ctx.translate(B, B);

    if (isIce()) Ice.drawUnder(ctx); // izler masa katmanının içinde
    else if (isLava()) Lava.drawOver(ctx);
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
    if (!ripples.length || settings.theme !== 'neon') return; // diğer temalarda zemin kendi tepkisini verir
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
    if (n > 1 && settings.theme === 'neon') { // suda köpük ve dalga, buzda çizik bırakır
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
      if (m.glow > 0.01 && settings.theme === 'neon') {
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
    if (game.state !== 'paused') {
      if (isWater()) Water.render();
      render();
    }
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
  renderInventory();
  applyTheme();
  startDemo();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Test ve hata ayıklama için
  window.__airHockey = { Water, Ice, Lava, game, pucks, mallets, settings, AI_LEVELS, quality, Sound, goals, skills, inventory, useSkill, openStore, step: update };
})();
