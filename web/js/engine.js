/* Aurora - audio engine: dual decks, crossfade, 10-band EQ, ducking, analyser */
(function (A) {
  const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  A.EQ_FREQS = EQ_FREQS;
  A.EQ_PRESETS = {
    Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Bass Boost': [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
    'Treble Boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
    Vocal: [-2, -2, -1, 1, 4, 5, 4, 2, 0, -1],
    Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
    Electronic: [6, 5, 2, 0, -2, 2, 1, 3, 5, 6],
    Acoustic: [4, 4, 3, 1, 2, 2, 3, 3, 3, 2],
    'Late Night': [3, 2, 1, 0, 0, -1, -2, -2, -3, -4]
  };

  class Engine extends EventTarget {
    constructor() {
      super();
      this.ctx = null; this.decks = []; this.cur = 0;
      this.volume = A.store.get('volume', 0.8); this.muted = false;
      this.rate = 1; this.crossfade = A.store.get('crossfade', 0);
      this.eqGains = A.store.get('eq', EQ_FREQS.map(() => 0));
      this.duckLevel = 1; this.normalize = A.store.get('normalize', true);
      this.xfading = false; this.preloaded = null; this._tick = null;
      // "direct" mode = plain <audio> output (no WebAudio graph): used in the Android app where WebAudio can be silent
      this.direct = !!window.AuroraAndroid || A.store.get('directAudio', false);
      for (let i = 0; i < 2; i++) {
        const el = new Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous';
        el.addEventListener('ended', () => { if (i === this.cur && !this.xfading) this.emit('ended'); });
        el.addEventListener('play', () => { if (i === this.cur) this.emit('state'); });
        el.addEventListener('pause', () => { if (i === this.cur && !this.xfading) this.emit('state'); });
        el.addEventListener('error', () => { if (i === this.cur && el.src) this.emit('error'); });
        el.addEventListener('loadedmetadata', () => { if (i === this.cur) this.emit('meta'); });
        this.decks.push({ el, node: null, gain: null, url: null, track: null, norm: 1, level: i === 0 ? 1 : 0 });
      }
    }
    emit(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d })); }
    get deck() { return this.decks[this.cur]; }
    get other() { return this.decks[1 - this.cur]; }

    // ----- direct (no WebAudio) helpers -----
    _applyDirect(d) {
      const n = this.normalize ? d.norm : 1, v = this.muted ? 0 : Math.pow(this.volume, 1.6);
      d.el.volume = A.clamp(v * this.duckLevel * (d.level == null ? 0 : d.level) * n, 0, 1);
    }
    _rampDuck(level, ms) {
      clearInterval(this._di); const from = this.duckLevel, t0 = performance.now(); ms = Math.max(60, ms);
      this._di = setInterval(() => {
        const p = Math.min(1, (performance.now() - t0) / ms); this.duckLevel = from + (level - from) * p; this.decks.forEach((d) => this._applyDirect(d));
        if (p >= 1) clearInterval(this._di);
      }, 30);
    }

    init() {
      if (this.direct) {
        if (!this._tick) { this._tick = setInterval(() => this.emit('tick'), 250); this.decks.forEach((d) => this._applyDirect(d)); }
        return;
      }
      if (this.ctx) return;
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
      this.master = ctx.createGain(); this.duck = ctx.createGain(); this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512; this.analyser.smoothingTimeConstant = 0.82;
      this.eq = EQ_FREQS.map((f, i) => {
        const b = ctx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === 9 ? 'highshelf' : 'peaking';
        b.frequency.value = f; b.Q.value = 1.1; b.gain.value = this.eqGains[i] || 0; return b;
      });
      this.decks.forEach((d) => {
        d.node = ctx.createMediaElementSource(d.el); d.gain = ctx.createGain(); d.gain.gain.value = d === this.deck ? 1 : 0;
        d.node.connect(d.gain);
      });
      let prev = null;
      this.eq.forEach((b) => { if (prev) prev.connect(b); prev = b; });
      this.decks.forEach((d) => d.gain.connect(this.eq[0]));
      prev.connect(this.duck); this.duck.connect(this.master); this.master.connect(this.analyser); this.analyser.connect(ctx.destination);
      this.applyVolume();
      this._tick = setInterval(() => this.emit('tick'), 250);
    }
    resume() { this.init(); if (this.direct) return Promise.resolve(); if (this.ctx.state !== 'running') return this.ctx.resume(); }

    applyVolume() {
      if (this.direct) { this.decks.forEach((d) => this._applyDirect(d)); return; }
      if (!this.master) return;
      const v = this.muted ? 0 : Math.pow(this.volume, 1.6);
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    }
    setVolume(v) { this.volume = A.clamp(v, 0, 1); if (this.volume > 0) this.muted = false; A.store.set('volume', this.volume); this.applyVolume(); this.emit('vol'); }
    toggleMute() { this.muted = !this.muted; this.applyVolume(); this.emit('vol'); }
    setDuck(level, t = 0.35) { if (this.direct) { this._rampDuck(level, t * 1500); return; } this.duckLevel = level; if (this.duck) this.duck.gain.setTargetAtTime(level, this.ctx.currentTime, t); }
    setEQ(i, g) { this.eqGains[i] = g; if (this.eq) this.eq[i].gain.setTargetAtTime(g, this.ctx.currentTime, 0.02); A.store.set('eq', this.eqGains); }
    setEQAll(arr) { arr.forEach((g, i) => this.setEQ(i, g)); }
    setRate(r) { this.rate = r; this.decks.forEach((d) => { d.el.playbackRate = r; d.el.preservesPitch = true; }); }
    setCrossfade(s) { this.crossfade = s; A.store.set('crossfade', s); }
    setNormalize(on) { this.normalize = on; A.store.set('normalize', on); this.decks.forEach((d) => this._applyNorm(d)); }
    _applyNorm(d) {
      if (this.direct) { this._applyDirect(d); return; }
      if (!d.gain) return;
      const n = this.normalize ? d.norm : 1;
      const base = d === this.deck || this.xfading ? 1 : 0;
      if (!this.xfading) d.gain.gain.setTargetAtTime(d === this.deck ? n : 0, this.ctx.currentTime, 0.05);
      d._n = n; void base;
    }
    static normFor(track) {
      const r = track && track.an && track.an.rms; if (!r) return 1;
      return A.clamp(0.1 / r, 0.55, 1.35); // aim at ~ -20 dBFS rms
    }

    async loadInto(deck, track, urlP, autoplay, startAt = 0) {
      if (deck.url) { try { URL.revokeObjectURL(deck.url); } catch { /* */ } deck.url = null; }
      const url = await urlP;
      deck.url = url.startsWith('blob:') ? url : null;
      deck.track = track; deck.norm = Engine.normFor(track);
      deck.el.src = url; deck.el.playbackRate = this.rate; deck.el.preservesPitch = true;
      if (this.direct) this._applyDirect(deck);
      if (startAt) deck.el.currentTime = startAt;
      if (autoplay) await deck.el.play();
    }

    // Play a track on the current deck (hard cut)
    async play(track, urlP, startAt = 0) {
      this.init(); await this.resume();
      this._cancelXfade();
      const other = this.other; other.el.pause(); this.preloaded = null;
      const d = this.deck;
      if (this.direct) { other.level = 0; d.level = 1; d.norm = Engine.normFor(track); this._applyDirect(other); this._applyDirect(d); }
      else {
        other.gain.gain.cancelScheduledValues(0); other.gain.gain.value = 0;
        d.gain.gain.cancelScheduledValues(0); d.gain.gain.value = this.normalize ? Engine.normFor(track) : 1;
      }
      await this.loadInto(d, track, urlP, true, startAt);
      this.emit('state'); this.emit('meta');
    }

    async preload(track, urlP) {
      if (this.preloaded && this.preloaded.id === track.id) return;
      this.preloaded = { id: track.id };
      const o = this.other;
      try { await this.loadInto(o, track, urlP, false); } catch { this.preloaded = null; }
    }

    // Start next track on the idle deck and fade between them
    async crossTo(track, urlP, secs) {
      this.init(); await this.resume();
      if (this.xfading) return;
      const from = this.deck, to = this.other, t = this.direct ? 0 : this.ctx.currentTime;
      if (!(this.preloaded && this.preloaded.id === track.id)) await this.loadInto(to, track, urlP, false);
      this.preloaded = null; this.xfading = true;
      if (this.direct) {
        to.level = 0; from.level = 1; this._applyDirect(to);
        try { await to.el.play(); } catch { /* */ }
        this.cur = 1 - this.cur; this.emit('meta'); this.emit('state');
        const t0 = performance.now(); clearInterval(this._xi);
        this._xi = setInterval(() => {
          const p = Math.min(1, (performance.now() - t0) / (secs * 1000)); to.level = p; from.level = 1 - p; this._applyDirect(to); this._applyDirect(from);
          if (p >= 1) { clearInterval(this._xi); from.el.pause(); from.level = 0; this._applyDirect(from); this.xfading = false; }
        }, 50);
        return;
      }
      const n = this.normalize ? to.norm : 1, nf = this.normalize ? from.norm : 1;
      to.gain.gain.cancelScheduledValues(t); to.gain.gain.setValueAtTime(0.0001, t); to.gain.gain.linearRampToValueAtTime(n, t + secs);
      from.gain.gain.cancelScheduledValues(t); from.gain.gain.setValueAtTime(nf, t); from.gain.gain.linearRampToValueAtTime(0.0001, t + secs);
      try { await to.el.play(); } catch { /* */ }
      this.cur = 1 - this.cur;
      this.emit('meta'); this.emit('state');
      this._xt = setTimeout(() => { from.el.pause(); from.gain.gain.value = 0; this.xfading = false; }, secs * 1000 + 80);
    }
    _cancelXfade() { clearTimeout(this._xt); clearInterval(this._xi); this.xfading = false; }

    pause() { this.deck.el.pause(); if (this.xfading) { this.other.el.pause(); } }
    async resumePlay() { await this.resume(); return this.deck.el.play(); }
    get playing() { const e = this.deck.el; return !e.paused && !e.ended; }
    get time() { return this.deck.el.currentTime || 0; }
    get duration() { const d = this.deck.el.duration; return isFinite(d) ? d : 0; }
    seek(t) { this.deck.el.currentTime = A.clamp(t, 0, this.duration || t); this.emit('tick'); }
    stop() { this.pause(); this._cancelXfade(); }
    // fade out master over secs then pause (sleep timer)
    fadeOutAndPause(secs = 8) {
      return new Promise((res) => {
        if (this.direct) { this._rampDuck(0.0001, secs * 1000); setTimeout(() => { this.pause(); this.duckLevel = 1; this.decks.forEach((d) => this._applyDirect(d)); res(); }, secs * 1000 + 100); return; }
        if (!this.ctx) return res();
        const g = this.duck.gain, t = this.ctx.currentTime;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + secs);
        setTimeout(() => { this.pause(); this.setDuck(1, 0.01); res(); }, secs * 1000 + 100);
      });
    }
    getBars(n = 48) {
      if (!this.analyser) return null;
      const buf = this._fb || (this._fb = new Uint8Array(this.analyser.frequencyBinCount));
      this.analyser.getByteFrequencyData(buf);
      const out = new Float32Array(n), usable = Math.floor(buf.length * 0.78);
      for (let i = 0; i < n; i++) {
        const a = Math.floor(Math.pow(i / n, 1.7) * usable), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.7) * usable));
        let s = 0; for (let j = a; j < b; j++) s += buf[j]; out[i] = s / (b - a) / 255;
      }
      return out;
    }
  }
  A.engine = new Engine();
})(window.A);
