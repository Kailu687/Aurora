/* Aurora - player: queue, shuffle/repeat, history, crossfade orchestration, media session */
(function (A) {
  const E = A.engine, L = A.lib;
  class Player extends EventTarget {
    constructor() {
      super();
      this.base = []; this.order = []; this.pos = -1; this.userQueue = []; this.history = [];
      this.context = { type: 'none', id: '', name: '' };
      this.shuffle = A.store.get('shuffle', false); this.repeat = A.store.get('repeat', 'off');
      this.autoplay = A.store.get('autoplay', true);
      this.current = null; this.counted = false; this.errStreak = 0; this.sleep = null; this.speed = 1;
      this.hist = A.store.get('history', []);
      E.addEventListener('ended', () => this.next(true));
      E.addEventListener('state', () => { this.emit('state'); this._ms(); if (!E.playing) this.saveSession(); });
      window.addEventListener('pagehide', () => this.saveSession());
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveSession(); });
      E.addEventListener('tick', () => this._tick());
      E.addEventListener('error', () => this._onError());
      this._bindMediaSession();
    }
    emit(n, d) { this.dispatchEvent(new CustomEvent(n, { detail: d })); }

    // ----- queue building -----
    playContext(ids, start, ctx = {}, opts = {}) {
      ids = ids.filter((i) => L.byId.has(i)); if (!ids.length) return;
      if ((ctx.type || 'list') !== 'dj' && A.dj && A.dj.s) A.dj.stop();
      this.context = { type: ctx.type || 'list', id: ctx.id || '', name: ctx.name || '' };
      this.base = ids.slice();
      let startId = typeof start === 'number' ? ids[start] : start;
      const sh = opts.noShuffle ? false : opts.shuffle != null ? opts.shuffle : this.shuffle;
      if (!opts.noShuffle && opts.shuffle != null && opts.shuffle !== this.shuffle) { this.shuffle = opts.shuffle; A.store.set('shuffle', this.shuffle); }
      if (sh) {
        const rest = A.shuffle(ids.filter((i) => i !== startId));
        if (startId == null) startId = rest.shift();
        this.order = [startId, ...rest];
      } else { this.order = ids.slice(); if (startId == null) startId = ids[0]; }
      this.pos = this.order.indexOf(startId); this.history = [];
      this._load(L.byId.get(this.order[this.pos]));
      this.emit('queue');
    }
    playTrackNow(t) { this.playContext([t.id], t.id, { type: 'single', name: t.title }); }
    addToQueue(ids, next = false) {
      ids = ids.filter((i) => L.byId.has(i));
      if (next) this.userQueue.unshift(...ids); else this.userQueue.push(...ids);
      if (!this.current) this.next();
      this.emit('queue');
    }
    removeFromQueue(kind, idx) {
      if (kind === 'user') this.userQueue.splice(idx, 1); else this.order.splice(this.pos + 1 + idx, 1);
      this.emit('queue');
    }
    moveInQueue(kind, from, to) {
      const arr = kind === 'user' ? this.userQueue : null;
      if (arr) { const [x] = arr.splice(from, 1); arr.splice(to, 0, x); }
      else { const b = this.pos + 1; const [x] = this.order.splice(b + from, 1); this.order.splice(b + to, 0, x); }
      this.emit('queue');
    }
    clearQueue() { this.userQueue = []; this.order.length = this.pos + 1; this.emit('queue'); }
    get upcoming() { return this.order.slice(this.pos + 1); }

    toggleShuffle() {
      this.shuffle = !this.shuffle; A.store.set('shuffle', this.shuffle);
      if (this.order.length && this.context.type !== 'dj') {
        const cur = this.current && this.current.id;
        if (this.shuffle) { const rest = A.shuffle(this.order.slice(this.pos + 1)); this.order = [...this.order.slice(0, this.pos + 1), ...rest]; }
        else if (this.context.type !== 'dj') { this.order = this.base.slice(); this.pos = Math.max(0, this.order.indexOf(cur)); }
      }
      this.emit('queue'); this.emit('state');
    }
    cycleRepeat() { this.repeat = { off: 'all', all: 'one', one: 'off' }[this.repeat]; A.store.set('repeat', this.repeat); this.emit('state'); }

    // ----- navigation -----
    peekNext() {
      if (this.repeat === 'one' && this.current) return this.current.id;
      if (this.userQueue.length) return this.userQueue[0];
      if (this.pos + 1 < this.order.length) return this.order[this.pos + 1];
      if (this.repeat === 'all' && this.order.length && this.context.type !== 'dj') return this.order[0];
      return null;
    }
    next(auto = false, mix = null) {
      if (A.dj && this.context.type === 'dj') A.dj.ensure();
      if (!auto && !mix && A.mixer && A.mixer.quickMix()) return; // DJ set: Skip mixes out on the next bar instead of a hard cut
      if (auto && this.repeat === 'one' && this.current) return this._load(this.current, { replay: true });
      let id = null;
      if (this.userQueue.length) id = this.userQueue.shift();
      else if (this.pos + 1 < this.order.length) { this.pos++; id = this.order[this.pos]; }
      else if (this.repeat === 'all' && this.order.length && this.context.type !== 'dj') { this.pos = 0; id = this.order[0]; if (this.shuffle) this.order = A.shuffle(this.order); }
      else if (this.autoplay && this.current && this.context.type !== 'dj' && A.similar) {
        const more = A.similar(this.current, 25).map((t) => t.id);
        if (more.length) { this.context = { type: 'radio', id: this.current.id, name: `${this.current.title} Radio` }; this.order.push(...more); this.pos++; id = this.order[this.pos]; A.toast('Autoplay: more like ' + this.current.title); }
      }
      if (id == null) { E.pause(); this.emit('state'); return; }
      this.emit('queue');
      this._load(L.byId.get(id), mix ? { mix } : auto && E.crossfade > 0 ? { cross: E.crossfade } : {});
    }
    prev() {
      if (!this.isLoaded()) { this.seekTo(0); return; }
      if (E.time > 3 || !this.history.length) { E.seek(0); return; }
      const id = this.history.pop();
      if (this.pos > 0 && this.order[this.pos - 1] === id) this.pos--; else this.order.splice(this.pos, 0, id);
      this._load(L.byId.get(id), { noHistory: true }); this.emit('queue');
    }
    jumpToQueue(kind, idx) {
      if (kind === 'user') { const id = this.userQueue.splice(idx, 1)[0]; this._load(L.byId.get(id)); }
      else { this.userQueue.length = 0; this.pos += idx + 1; this._load(L.byId.get(this.order[this.pos])); }
      this.emit('queue');
    }
    isLoaded() { return !!(this.current && E.deck.track && E.deck.track.id === this.current.id && E.deck.el.src); }
    toggle() {
      if (!this.current) { if (L.tracks.length) this.playContext(L.tracks.map((t) => t.id), null, { type: 'library', name: 'Your Library' }, { shuffle: true }); return; }
      if (!this.isLoaded()) { this._load(this.current, { noHistory: true, replay: true, startAt: this.resume ? this.resume.pos : 0 }); return; } // restored session: load on first play
      E.playing ? E.pause() : E.resumePlay().catch(() => {});
    }
    seekTo(sec) { if (this.isLoaded()) E.seek(sec); else if (this.current) { this.resume = { pos: A.clamp(sec, 0, this.current.duration || sec) }; this.saveSession(); } }

    // ----- resume where you left off -----
    saveSession() {
      this._lastSave = Date.now();
      if (!this.current) { A.store.set('session', null); return; }
      const ctx = this.context.type === 'dj' ? { type: 'list', id: '', name: this.context.name } : this.context;
      A.store.set('session', {
        id: this.current.id, pos: this.isLoaded() ? E.time : (this.resume ? this.resume.pos : 0), order: this.order.slice(0, 1500), at: this.pos, base: this.base.slice(0, 1500),
        uq: this.userQueue.slice(0, 200), ctx, shuffle: this.shuffle, repeat: this.repeat
      });
    }
    restoreSession() {
      const s = A.store.get('session', null); if (!s || !L.byId.has(s.id)) return false;
      const ok = (ids) => (ids || []).filter((i) => L.byId.has(i));
      this.order = ok(s.order); this.pos = this.order.indexOf(s.id);
      if (this.pos < 0) { this.order = [s.id]; this.pos = 0; }
      this.base = ok(s.base); this.userQueue = ok(s.uq); this.context = s.ctx || { type: 'list', id: '', name: '' };
      this.current = L.byId.get(s.id); this.resume = { pos: s.pos || 0 }; this.counted = false;
      this.emit('queue'); return true;
    }

    async _load(track, o = {}) {
      if (!track) return;
      const prev = this.current;
      if (prev && !o.noHistory && !o.replay && prev.id !== track.id) { this.history.push(prev.id); if (this.history.length > 200) this.history.shift(); }
      this.current = track; this.counted = false; this.preQueued = null; this.sleepEnd = false;
      A.speech && A.speech.cancel(); // never carry a DJ intro into the next song
      this.busy = true;
      try {
        if (o.mix && E.playing) await E.mixTo(track, L.urlFor(track), o.mix);
        else if (o.cross && E.playing && !o.replay) await E.crossTo(track, L.urlFor(track), o.cross);
        else await E.play(track, L.urlFor(track), o.startAt || 0);
        this.resume = null; this.errStreak = 0;
      } catch (e) {
        console.warn(e); if (e && e.name === 'NotAllowedError') { A.toast('Press play to start'); this.emit('state'); }
        else if (e && /Permission/.test(e.message || '')) { A.toast('Reconnect your folder in Settings to play'); }
        else this._onError();
      } finally { this.busy = false; }
      this.emit('track', { track, prev }); this._ms(); this._mediaMeta(); this.saveSession();
      if (A.dj && this.context.type === 'dj') A.dj.onTrack(track, prev);
    }
    _onError() {
      this.errStreak++;
      if (this.errStreak > 4) { A.toast('Playback keeps failing, stopping.'); this.errStreak = 0; E.pause(); return; }
      A.toast('Couldn’t play that file, skipping'); setTimeout(() => this.next(), 500);
    }
    _tick() {
      const t = this.current; if (!t || !E.playing) { this.emit('time'); return; }
      if (Date.now() - (this._lastSave || 0) > 4000) this.saveSession();
      const dur = E.duration, cur = E.time, rem = dur - cur;
      if (!this.counted && cur > Math.min(30, dur * 0.5)) {
        this.counted = true; t.plays = (t.plays || 0) + 1; t.last = Date.now(); L.touch(t);
        this.hist.push([t.id, Date.now()]); if (this.hist.length > 2500) this.hist.splice(0, this.hist.length - 2500);
        A.store.set('history', this.hist); if (A.safety) A.safety.mirror('history', this.hist); this.emit('counted');
      }
      if (dur > 0 && !E.xfading && !this.busy) {
        if (rem < 14 && !this.preQueued && !(A.mixer && A.mixer.owns())) {
          const nid = this.peekNext(); const nt = nid && L.byId.get(nid);
          if (nt && nid !== t.id) { this.preQueued = nid; E.preload(nt, L.urlFor(nt)); }
        }
        const xf = E.crossfade;
        if (A.mixer && A.mixer.owns()) { /* the DJ mixer decides when to move on */ }
        else if (xf > 0 && rem <= xf + 0.15 && dur > xf * 2 && this.repeat !== 'one' && this.peekNext()) this.next(true);
      }
      if (this.loop && this.loop.id === t.id && this.loop.b > this.loop.a && cur >= this.loop.b) E.seek(this.loop.a);
      if (this.sleepEnd && dur > 0 && rem < 0.5) { this.sleepEnd = false; E.fadeOutAndPause(0.3); this.setSleep(null); A.toast('Sleep timer: goodnight'); }
      this.emit('time');
    }

    // ----- A-B loop (practice a section) -----
    setLoopPoint(which) {
      const t = this.current; if (!t || !this.isLoaded()) return null;
      if (!this.loop || this.loop.id !== t.id) this.loop = { id: t.id, a: 0, b: 0 };
      this.loop[which] = E.time; if (which === 'a' && this.loop.b <= this.loop.a) this.loop.b = 0;
      this.emit('loop'); return this.loop;
    }
    clearLoop() { this.loop = null; this.emit('loop'); }

    // ----- sleep timer -----
    setSleep(mins) {
      clearTimeout(this.sleepT); this.sleepEnd = false; this.sleep = null;
      if (mins === 'end') { this.sleepEnd = true; this.sleep = { end: true }; }
      else if (mins) {
        this.sleep = { at: Date.now() + mins * 60000 };
        this.sleepT = setTimeout(() => { E.fadeOutAndPause(10).then(() => { this.sleep = null; this.emit('sleep'); A.toast('Sleep timer: goodnight'); }); }, mins * 60000);
      }
      this.emit('sleep');
    }

    // ----- Media Session (lock screen / headset keys) -----
    _bindMediaSession() {
      if (!('mediaSession' in navigator)) return;
      const ms = navigator.mediaSession;
      const set = (a, f) => { try { ms.setActionHandler(a, f); } catch { /* unsupported */ } };
      set('play', () => E.resumePlay()); set('pause', () => E.pause());
      set('previoustrack', () => this.prev()); set('nexttrack', () => this.next());
      set('seekto', (d) => E.seek(d.seekTime)); set('seekbackward', () => E.seek(E.time - 10)); set('seekforward', () => E.seek(E.time + 10));
    }
    _ms() { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = E.playing ? 'playing' : this.current ? 'paused' : 'none'; }
    _mediaMeta() {
      if (!('mediaSession' in navigator) || !this.current) return;
      const t = this.current, art = L.artUrl(t);
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: t.album || 'Aurora', artwork: art ? [{ src: art, sizes: '600x600', type: 'image/jpeg' }] : [] });
    }
  }
  A.player = new Player();
})(window.A);
