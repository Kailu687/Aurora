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
        // per-deck DJ filters: a high-pass for sweeps and a low shelf for bass swaps (both neutral unless a mix uses them)
        d.hp = ctx.createBiquadFilter(); d.hp.type = 'highpass'; d.hp.frequency.value = 10; d.hp.Q.value = 0.7;
        d.bass = ctx.createBiquadFilter(); d.bass.type = 'lowshelf'; d.bass.frequency.value = 180; d.bass.gain.value = 0;
        d.lp = ctx.createBiquadFilter(); d.lp.type = 'lowpass'; d.lp.frequency.value = 20000; d.lp.Q.value = 0.9;
        d.node.connect(d.hp); d.hp.connect(d.lp); d.lp.connect(d.bass); d.bass.connect(d.gain);
        // effect sends, taken before the deck's fader so an echo or reverb tail keeps ringing after the song is cut
        // (they are only wired up while a mix uses them, see _fxOn)
        d.esend = ctx.createGain(); d.esend.gain.value = 0; d.rsend = ctx.createGain(); d.rsend.gain.value = 0;
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
    _cancelXfade() { clearTimeout(this._xt); clearInterval(this._xi); this.mixing = null; this.xfading = false; this._resetFilters(); }
    _resetFilters() {
      clearInterval(this._bi); this._stopRiser();
      if (this.direct || !this.ctx) return; const t = this.ctx.currentTime;
      this.decks.forEach((d) => {
        [[d.hp.frequency, 10], [d.lp.frequency, 20000], [d.bass.gain, 0], [d.esend.gain, 0], [d.rsend.gain, 0]].forEach(([p, v]) => { p.cancelScheduledValues(t); p.setValueAtTime(v, t); });
      });
      this._fxIdle();
    }
    // DJ effects (a tempo-synced echo and a reverb) are built the first time a mix needs them and unplugged again
    // a few seconds after it ends: an idle reverb and echo loop still cost CPU every audio frame, which phones feel.
    _fxOn() {
      if (this.direct || !this.ctx) return; clearTimeout(this._fxT); if (this._fxLive) return; const ctx = this.ctx;
      if (!this.echo) {
        this.echo = ctx.createDelay(4); this.echo.delayTime.value = 0.5; this.efb = ctx.createGain(); this.efb.gain.value = 0.55;
        this.etone = ctx.createBiquadFilter(); this.etone.type = 'lowpass'; this.etone.frequency.value = 3200;
        this.echo.connect(this.etone); this.etone.connect(this.eq[0]);
        this.verb = ctx.createConvolver(); this.verb.buffer = this._impulse(3.2);
        this.verbOut = ctx.createGain(); this.verbOut.gain.value = 0.9; this.verb.connect(this.verbOut); this.verbOut.connect(this.eq[0]);
        this.decks.forEach((d) => { d.esend.connect(this.echo); d.rsend.connect(this.verb); });
      }
      this.etone.connect(this.efb); this.efb.connect(this.echo);
      this.decks.forEach((d) => { d.bass.connect(d.esend); d.bass.connect(d.rsend); });
      this._fxLive = true;
    }
    _fxIdle(ms = 9000) {
      clearTimeout(this._fxT); if (!this._fxLive) return;
      this._fxT = setTimeout(() => {
        if (this.mixing) return this._fxIdle(ms);
        try { this.decks.forEach((d) => { d.bass.disconnect(d.esend); d.bass.disconnect(d.rsend); }); this.etone.disconnect(this.efb); this.efb.disconnect(this.echo); } catch { /* */ }
        this._fxLive = false;
      }, ms);
    }
    _impulse(secs) {
      const sr = this.ctx.sampleRate, n = Math.floor(sr * secs), b = this.ctx.createBuffer(2, n, sr);
      for (let c = 0; c < 2; c++) { const ch = b.getChannelData(c); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * 0.6; }
      return b;
    }
    _stopRiser() { const r = this._riser; if (!r) return; this._riser = null; try { const t = this.ctx.currentTime; r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.linearRampToValueAtTime(0.0001, t + 0.12); r.src.stop(t + 0.15); } catch { /* */ } }

    // Effects that run on the playing song just BEFORE a DJ cut (secs = real seconds until the cut, beat = one beat):
    // 'echo' feeds the last beat into a tempo-synced echo, 'brake' slows the record to a stop like a turntable,
    // 'riser' builds a noise sweep while the song is filtered thinner and thinner.
    preFx(kind, secs, beat = 0.5) {
      this.init(); const d = this.deck;
      if (kind === 'brake') {
        clearInterval(this._bi); const r0 = d.el.playbackRate || 1, t0 = performance.now(); d.el.preservesPitch = false;
        this._bi = setInterval(() => { const p = Math.min(1, (performance.now() - t0) / (secs * 1000)); d.el.playbackRate = Math.max(0.0625, r0 * (1 - p) ** 1.6); if (p >= 1) clearInterval(this._bi); }, 16);
        return;
      }
      if (this.direct || !this.ctx) return;
      const t = this.ctx.currentTime;
      if (kind === 'echo') {
        this._fxOn();
        this.echo.delayTime.setValueAtTime(A.clamp(beat * 0.75, 0.12, 1.5), t); this.efb.gain.setValueAtTime(0.58, t);
        d.esend.gain.cancelScheduledValues(t); d.esend.gain.setValueAtTime(0.0001, t); d.esend.gain.linearRampToValueAtTime(0.9, t + Math.max(0.05, secs * 0.6));
      } else if (kind === 'riser') {
        this._stopRiser();
        const sr = this.ctx.sampleRate, n = Math.floor(sr * (secs + 0.5)), b = this.ctx.createBuffer(1, n, sr), ch = b.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5; const g = this.ctx.createGain();
        src.connect(f); f.connect(g); g.connect(this.eq[0]);
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + secs);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + secs);
        src.start(t); this._riser = { src, g };
        d.hp.frequency.cancelScheduledValues(t); d.hp.frequency.setValueAtTime(10, t); d.hp.frequency.exponentialRampToValueAtTime(700, t + secs);
      }
    }

    // DJ mix: start the next track on the idle deck at startAt, tempo-matched (rate), and blend over `blend` seconds.
    // style 'swap': both basslines never play at once (incoming bass is cut, then swapped halfway).
    // style 'cut': no tempo match possible, so the outgoing track gets a high-pass sweep and drops out on the beat.
    // style 'filter': long low-pass / high-pass blend. 'wash': the old song dissolves into reverb.
    // styles 'echo', 'brake', 'riser', 'slam': an instant cut on the downbeat after preFx() has done its build-up.
    async mixTo(track, urlP, { startAt = 0, blend = 8, rate = 1, style = 'swap' } = {}) {
      this.init(); await this.resume();
      if (this.xfading) this._cancelXfade();
      const from = this.deck, to = this.other;
      if (!(this.preloaded && this.preloaded.id === track.id)) await this.loadInto(to, track, urlP, false, startAt);
      else to.el.currentTime = startAt;
      this.preloaded = null; this.xfading = true;
      to.el.playbackRate = rate; to.el.preservesPitch = true;
      const nTo = this.normalize ? to.norm : 1, nFrom = this.normalize ? from.norm : 1;
      this.mixing = { from, to, t0: performance.now(), blend, style };
      const hard = HARD.has(style);
      if (this.direct) {
        to.level = 0; this._applyDirect(to); try { await to.el.play(); } catch { /* */ }
        this.cur = 1 - this.cur; this.emit('meta'); this.emit('state');
        const t0 = performance.now(); clearInterval(this._xi); if (hard) blend = 0.12;
        this._xi = setInterval(() => {
          const p = Math.min(1, (performance.now() - t0) / (blend * 1000));
          to.level = hard ? 1 : style === 'cut' ? Math.min(1, p * 4) : Math.min(1, p * 2); from.level = hard ? 1 - p : style === 'cut' ? 1 - Math.min(1, p * 1.5) : p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
          this._applyDirect(to); this._applyDirect(from);
          if (p >= 1) { clearInterval(this._xi); clearInterval(this._bi); from.el.pause(); from.el.playbackRate = this.rate; from.el.preservesPitch = true; from.level = 0; this._applyDirect(from); this.xfading = false; this.mixing = null; }
        }, 40);
        return;
      }
      if (hard || style === 'wash') this._fxOn();
      const t = this.ctx.currentTime, half = t + blend / 2, end = t + blend, g = (d) => d.gain.gain;
      [to, from].forEach((d) => { g(d).cancelScheduledValues(t); d.hp.frequency.cancelScheduledValues(t); d.bass.gain.cancelScheduledValues(t); });
      [to.lp.frequency, to.esend.gain, to.rsend.gain].forEach((p) => p.cancelScheduledValues(t));
      g(to).setValueAtTime(0.0001, t); d0(to.hp.frequency, 10, t); d0(to.lp.frequency, 20000, t); d0(to.esend.gain, 0, t); d0(to.rsend.gain, 0, t);
      if (!hard) { d0(from.hp.frequency, 10, t); from.lp.frequency.cancelScheduledValues(t); d0(from.lp.frequency, 20000, t); }
      d0(from.bass.gain, 0, t);
      if (hard) {
        // the cut itself: the new song lands on the beat at full level; whatever effect was building on the old one
        // (echo tail, brake, riser) is what you hear carry over it for a moment
        blend = Math.max(blend, 0.3); d0(to.bass.gain, 0, t); g(to).linearRampToValueAtTime(nTo, t + 0.012);
        g(from).setValueAtTime(g(from).value || nFrom, t); g(from).linearRampToValueAtTime(0.0001, t + 0.03);
        from.esend.gain.setValueAtTime(from.esend.gain.value, t + 0.03); from.esend.gain.linearRampToValueAtTime(0.0001, t + 0.06);
        if (this._riser) { const r = this._riser; this._riser = null; r.g.gain.cancelScheduledValues(t); r.g.gain.setValueAtTime(r.g.gain.value, t); r.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); r.src.stop(t + 1); }
      } else if (style === 'filter') {
        // smooth late-night blend: the old song closes up under a low-pass while the new one opens up from thin to full
        to.hp.frequency.setValueAtTime(900, t); to.hp.frequency.exponentialRampToValueAtTime(10, t + blend * 0.8); to.bass.gain.setValueAtTime(-20, t); to.bass.gain.linearRampToValueAtTime(0, t + blend * 0.75);
        g(to).linearRampToValueAtTime(nTo, t + blend * 0.55);
        g(from).setValueAtTime(nFrom, t); from.lp.frequency.setValueAtTime(20000, t); from.lp.frequency.exponentialRampToValueAtTime(260, t + blend * 0.9);
        g(from).setValueAtTime(nFrom, t + blend * 0.45); g(from).linearRampToValueAtTime(0.0001, end);
      } else if (style === 'wash') {
        // dreamy hand-over: the old song dissolves into reverb as the new one fades up underneath
        from.rsend.gain.setValueAtTime(0.0001, t); from.rsend.gain.linearRampToValueAtTime(0.85, t + blend * 0.5); from.rsend.gain.linearRampToValueAtTime(0.0001, end);
        g(from).setValueAtTime(nFrom, t); g(from).linearRampToValueAtTime(0.0001, t + blend * 0.7);
        from.lp.frequency.setValueAtTime(20000, t); from.lp.frequency.exponentialRampToValueAtTime(1800, t + blend * 0.7);
        g(to).setValueAtTime(0.0001, t + blend * 0.2); g(to).linearRampToValueAtTime(nTo, end);
      } else if (style === 'cut') {
        d0(to.bass.gain, 0, t); g(to).linearRampToValueAtTime(nTo, t + Math.min(0.6, blend / 3));
        g(from).setValueAtTime(nFrom, t); from.hp.frequency.exponentialRampToValueAtTime(900, t + blend * 0.7); g(from).linearRampToValueAtTime(0.0001, end);
      } else {
        to.bass.gain.setValueAtTime(-26, t); g(to).linearRampToValueAtTime(nTo, half);
        g(from).setValueAtTime(nFrom, half);
        // the swap: over one beat-ish, the incoming bass comes in as the outgoing bass goes out
        to.bass.gain.setValueAtTime(-26, half); to.bass.gain.linearRampToValueAtTime(0, half + 0.4);
        from.bass.gain.setValueAtTime(0, half); from.bass.gain.linearRampToValueAtTime(-26, half + 0.4);
        g(from).linearRampToValueAtTime(0.0001, end);
      }
      try { await to.el.play(); } catch { /* */ }
      this.cur = 1 - this.cur; this.emit('meta'); this.emit('state');
      clearTimeout(this._xt);
      this._xt = setTimeout(() => {
        from.el.pause(); clearInterval(this._bi); from.el.playbackRate = this.rate; from.el.preservesPitch = true; from.gain.gain.value = 0;
        [[from.hp.frequency, 10], [from.lp.frequency, 20000], [from.bass.gain, 0], [from.esend.gain, 0], [from.rsend.gain, 0]].forEach(([p, v]) => { p.cancelScheduledValues(0); p.value = v; });
        this.xfading = false; this.mixing = null; this._fxIdle();
      }, blend * 1000 + 120);
    }
    setDeckRate(d, r) { d.el.playbackRate = r; d.el.preservesPitch = true; }

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
  function d0(param, v, t) { param.setValueAtTime(v, t); }
  const HARD = new Set(['echo', 'brake', 'riser', 'slam']);
  A.engine = new Engine();
})(window.A);
