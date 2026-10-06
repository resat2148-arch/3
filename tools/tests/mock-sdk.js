// CrazyGames SDK v3 taklidi (yalnızca test): init + localStorage benzeri data modülü
(function () {
  const mode = new URLSearchParams(location.search).get('mock') || 'ok';
  const KEY = 'MOCK_CLOUD';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = (m) => localStorage.setItem(KEY, JSON.stringify(m));
  window.__cloudWrites = 0;
  window.CrazyGames = {
    SDK: {
      environment: mode === 'disabled' ? 'disabled' : 'crazygames',
      init() {
        if (mode === 'fail') return Promise.reject(new Error('init failed'));
        if (mode === 'hang') return new Promise(() => {});
        return new Promise((r) => setTimeout(r, 300));
      },
      game: {
        settings: { muteAudio: new URLSearchParams(location.search).get('muteAudio') === 'true', disableChat: false },
        _ls: [],
        gameplayStart() { (window.__gp = window.__gp || []).push('start'); },
        gameplayStop() { (window.__gp = window.__gp || []).push('stop'); },
        addSettingsChangeListener(f) { this._ls.push(f); },
        removeSettingsChangeListener(f) { this._ls = this._ls.filter((x) => x !== f); },
        _set(st) { this.settings = Object.assign({}, this.settings, st); this._ls.forEach((f) => f(this.settings)); },
      },
      ad: {
        requestAd(type, cb) {
          const q = new URLSearchParams(location.search).get('ad') || 'ok';
          (window.__adLog = window.__adLog || []).push(type);
          if (q === 'ok') {
            setTimeout(() => { window.__adState = 'started'; cb.adStarted && cb.adStarted(); }, 150);
            setTimeout(() => { window.__adState = 'finished'; cb.adFinished && cb.adFinished(); }, 1500);
          } else {
            setTimeout(() => cb.adError && cb.adError({ code: q }), 200);
          }
        },
      },
      data: {
        getItem(k) { const m = load(); return k in m ? m[k] : null; },
        setItem(k, v) { const m = load(); m[k] = String(v); save(m); window.__cloudWrites++; },
        removeItem(k) { const m = load(); delete m[k]; save(m); },
        clear() { save({}); },
      },
    },
  };
})();
