/* Aurora - the DJ mixer. During a DJ set it decides where each song is mixed out and where the next one comes in,
   matches tempos, lines the beats up and swaps the basslines, the way a club DJ blends two records.
   Uses the beat grid from A.mixAnalysis (meta.js): exact BPM, first beat, first downbeat and 8-bar phrases. */
(function (A) {
  const E = A.engine, P = A.player, L = A.lib;
  const M = A.mixer = { plan: null, armed: null, listeners: new Set(), busy: new Set() };
  A.MIX_MODES = {
    parts: { name: 'Best parts', tag: 'Plays the strongest part of each song and mixes on the beat, like a club DJ' },
    full: { name: 'Full songs', tag: 'Whole songs, with beat-matched blends through the outros' },
    fade: { name: 'Simple fades', tag: 'Plain crossfades, no beat matching' }
  };
  M.mode = () => (A.MIX_MODES[A.store.get('djMix', 'parts')] ? A.store.get('djMix', 'parts') : 'parts');
  M.setMode = (m) => { A.store.set('djMix', m); M.plan = null; M.disarm(); M.emit(); };
  M.emit = () => {
    M.listeners.forEach((f) => f(M.plan));
    const h = document.getElementById('mix-strip-host'); if (h && P.current) h.innerHTML = M.strip(P.current);
  };
  const grid = (t) => (t && t.an && t.an.mix && t.an.mix.v === A.MIX_VERSION ? t.an.mix : null);
  M.grid = grid;
  const beatLen = (m) => 60 / m.bpm;
  const barAt = (m, i) => m.bar0 + i * 4 * beatLen(m);
  // where a song comes in: the build into its hook ('parts'), straight onto the hook (for a drop), or its first bar
  const inPoint = (m, mode, drop) => (mode !== 'parts' ? Math.max(0, m.bar0) : barAt(m, drop ? m.hb : m.ib));
  M.active = () => !!(A.dj && A.dj.s && P.context.type === 'dj' && M.mode() !== 'fade');
  M.owns = () => M.active() && !!grid(P.current) && !!M.plan;

  // ---------- how a DJ would move between two songs in this mood ----------
  // blend styles overlap the songs (beat-locked); cut styles build an effect on the old song and drop the new one
  // in on the downbeat, usually straight onto its hook.
  A.MIX_STYLES = {
    swap: { name: 'Bass swap', blend: true }, filter: { name: 'Filter blend', blend: true }, wash: { name: 'Reverb wash', blend: true },
    echo: { name: 'Echo out', pre: 'echo', beats: 1 }, brake: { name: 'Turntable brake', pre: 'brake', beats: 2 }, riser: { name: 'Build-up and drop', pre: 'riser', beats: 16 },
    slam: { name: 'Cut on the one', pre: null, beats: 0 }, cut: { name: 'Quick cut', blend: true }
  };
  const MOOD_MIX = {
    hype: { swap: 1, echo: 3, riser: 3, brake: 1.5, slam: 1 }, workout: { swap: 1.5, echo: 2.5, riser: 3, slam: 1.5 },
    party: { swap: 3, echo: 2, riser: 1.5, brake: 0.6 }, feelgood: { swap: 3, echo: 1.5, filter: 1 }, roadtrip: { swap: 3, echo: 1.5, filter: 1 },
    throwback: { swap: 3, echo: 1.5, brake: 0.8 }, chill: { filter: 3, swap: 1.5, wash: 1 }, focus: { filter: 3, swap: 1 },
    latenight: { filter: 3, swap: 1.5, echo: 0.8, wash: 0.8 }, romance: { filter: 2.5, wash: 2, swap: 1 }, sad: { wash: 3, filter: 2 }, sleep: { wash: 3, filter: 1.5 }
  };
  function chooseStyle(a, b, ma, mb, match) {
    if (M.forceStyle && A.MIX_STYLES[M.forceStyle]) return M.forceStyle; // for trying a specific transition
    const vibe = (A.dj && A.dj.s && A.dj.s.vibe && A.dj.s.vibe.id) || 'party', w = Object.assign({}, MOOD_MIX[vibe] || MOOD_MIX.party);
    const e = ((a.an.energy || 0.5) + (b.an.energy || 0.5)) / 2, key = A.keyMatch(ma.key && ma.key.cam, mb.key && mb.key.cam);
    if (!match) { delete w.swap; delete w.filter; w.echo = (w.echo || 0) + 2; if (e < 0.45) w.wash = (w.wash || 0) + 3; else w.brake = (w.brake || 0) + 0.8; }
    if (key < 0.4) { if (w.swap) w.swap *= 0.4; if (w.filter) w.filter *= 0.6; w.echo = (w.echo || 0) + 1; } // keys clash: don't overlap them for long
    if (e > 0.7) { if (w.riser) w.riser *= 1.4; } else if (w.riser) w.riser *= 0.5;
    if (!E.ctx) { ['echo', 'riser', 'filter', 'wash'].forEach((k) => delete w[k]); w.swap = match ? 3 : 0; w.brake = (w.brake || 0) + 1; w.slam = 1; } // phone direct mode: no effects rack
    // the DJ wants to talk as this song comes in: use a transition that leaves quiet bars for it (or a build-up to shout over)
    if (A.dj && A.dj.talkRoom(b.id) && M.mode() === 'parts') { ['echo', 'brake', 'slam'].forEach((k) => { if (w[k]) w[k] *= 0.15; }); }
    const last = M._lastStyle; if (last && w[last] && Object.keys(w).length > 1) w[last] *= 0.35; // don't do the same trick twice in a row
    const ks = Object.keys(w).filter((k) => w[k] > 0), tot = ks.reduce((t, k) => t + w[k], 0); let r = Math.random() * tot;
    for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks[0] || 'swap';
  }

  // ---------- beat grids on demand (the background analysis may not have reached these songs yet) ----------
  M.ensure = async (t) => {
    if (!t || grid(t) || M.busy.has(t.id) || t.anFail) return grid(t);
    M.busy.add(t.id);
    try { const r = await A.analyze(await L.sourceFor(t)); if (r) { t.an = r; L.touch(t); } else t.anFail = true; }
    catch (e) { A.log('mix analysis failed: ' + (e && e.message)); t.anFail = true; }
    finally { M.busy.delete(t.id); }
    if (t === P.current || t.id === P.peekNext()) M.replan();
    return grid(t);
  };

  // ---------- planning ----------
  // Works out: the effect start (fxAt) and the mix point (at) on the current song, where the next song comes in
  // (startAt), how fast it must play to match tempo (rate), how long the blend is (blend, real seconds) and the style.
  // In 'parts' mode the current song always plays its WHOLE hook (hb..he) before anything happens.
  function makePlan(a, b, { now = 0, soon = false } = {}) {
    const ma = grid(a), mb = grid(b); if (!ma || !mb) return null;
    const mode = M.mode(), rateA = E.deck.el.playbackRate || 1, effA = ma.bpm * rateA;
    let k = 1, r = effA / mb.bpm; for (const kk of [0.5, 2]) { const rr = effA / (mb.bpm * kk); if (Math.abs(rr - 1) < Math.abs(r - 1)) { r = rr; k = kk; } }
    const match = Math.abs(r - 1) <= 0.08;
    const bsA = beatLen(ma), bar = 4 * bsA, energy = ((a.an.energy || 0.5) + (b.an.energy || 0.5)) / 2;
    let style = soon ? (match ? 'swap' : E.ctx ? 'echo' : 'slam') : chooseStyle(a, b, ma, mb, match);
    const S = A.MIX_STYLES[style];
    const dur = E.duration || ma.dur || a.duration;
    let bars = 0;
    if (S.blend) bars = soon ? 2 : style === 'swap' ? (energy > 0.66 ? 4 : energy < 0.38 ? 16 : 8) : style === 'filter' ? (energy > 0.6 ? 8 : 16) : 8;
    const blendA = bars * bar, pre = (S.pre ? S.beats : 0) * bsA, limit = dur - blendA - 0.5;
    // the mix point: right after the hook ends (parts) or after the last full-energy section (full songs)
    let at;
    if (soon) at = ma.bar0 + Math.ceil((now + 0.35 * rateA + pre - ma.bar0) / bar) * bar;
    else at = barAt(ma, mode === 'parts' ? ma.he : Math.max(ma.he, ma.lb));
    if (at > limit) at = ma.bar0 + Math.floor((limit - ma.bar0) / bar) * bar;
    if (!soon && at - pre < now + 3) at = ma.bar0 + Math.ceil((now + 3 + pre - ma.bar0) / bar) * bar;
    if (!(at - pre > now) || at > limit + 0.01) return null;
    const drop = !S.blend; // cut styles land the new song right on its hook
    let startAt = inPoint(mb, mode, drop);
    // the DJ wants to say something as this song comes in: bring it in earlier so there are quiet bars to talk over
    // after the blend and before its hook (a hype shout over a build-up needs no room)
    const room = !soon && mode === 'parts' && S.blend && A.dj ? A.dj.talkRoom(b.id) : 0;
    if (room) { const barB = 4 * beatLen(mb) / (S.blend && match ? r : 1), need = Math.ceil(room / barB / 4) * 4, from = Math.max(0, mb.hb - bars - need); if (from < mb.ib) startAt = barAt(mb, from); }
    return {
      a: a.id, b: b.id, at, fxAt: at - pre, fx: S.pre, startAt, rate: S.blend && match ? r : 1, k, blend: S.blend ? blendA / rateA : 0.3,
      style, beat: bsA / rateA, bpmA: ma.bpm, bpmB: mb.bpm, match, bars, keyA: ma.key && ma.key.name, keyB: mb.key && mb.key.name
    };
  }
  M.replan = () => {
    if (M.fxOn) return; // an effect is already building on this song: the plan is locked in
    M.disarm();
    const a = P.current, nid = P.peekNext(), b = nid && L.byId.get(nid);
    M.plan = M.active() && a && b && b.id !== a.id && P.isLoaded() ? makePlan(a, b, { now: E.time }) : null;
    M.emit();
  };
  M.disarm = () => { clearTimeout(M.armed); clearTimeout(M.fxArmed); M.armed = null; M.fxArmed = null; if (M.fxOn) { M.fxOn = false; E._resetFilters(); E.setDeckRate(E.deck, E.rate || 1); } };
  const realUntil = (songT) => ((songT - E.time) / (E.deck.el.playbackRate || 1)) * 1000;
  function startFx(plan) {
    M.fxArmed = null;
    if (!M.active() || !P.current || P.current.id !== plan.a || P.peekNext() !== plan.b) return M.replan();
    const secs = Math.max(0.05, realUntil(plan.at) / 1000);
    M.fxOn = true; E.preFx(plan.fx, secs, plan.beat);
    if (plan.fx === 'riser' && A.dj) A.dj.onBuild(secs, plan.b);
  }
  function fire(plan) {
    M.armed = null;
    if (!M.active() || !P.current || P.current.id !== plan.a || P.peekNext() !== plan.b) { M.fxOn = false; return M.replan(); }
    const late = plan.fx === 'brake' ? 0 : Math.max(0, E.time - plan.at) / (E.deck.el.playbackRate || 1); // real seconds we are late by
    M.live = { ...plan, ma: grid(P.current), mb: grid(L.byId.get(plan.b)), started: performance.now() };
    M.plan = null; M.fxOn = false; M._lastStyle = plan.style;
    P.next(true, { startAt: plan.startAt + late * plan.rate, blend: plan.blend, rate: plan.rate, style: plan.style });
  }
  function arm(plan) {
    const toFx = plan.fx ? realUntil(plan.fxAt) : Infinity;
    if (plan.fx && !M.fxArmed && !M.fxOn) M.fxArmed = setTimeout(() => startFx(plan), Math.max(0, toFx - 12));
    // a braking record slows down, so its own clock can't time the cut: use real time from when the brake started
    M.armed = setTimeout(() => fire(plan), Math.max(0, (plan.fx === 'brake' ? toFx + (plan.at - plan.fxAt) / (E.deck.el.playbackRate || 1) * 1000 : realUntil(plan.at)) - 12));
  }

  // Skip during a DJ set: mix out on the next bar instead of cutting
  M.quickMix = () => {
    if (!M.active() || !P.isLoaded() || E.xfading) return false;
    const a = P.current, nid = P.peekNext(), b = nid && L.byId.get(nid); if (!a || !b || !grid(a) || !grid(b)) return false;
    M.disarm(); const plan = makePlan(a, b, { now: E.time, soon: true }); if (!plan) return false;
    M.plan = plan; M.emit(); arm(plan);
    return true;
  };

  // ---------- the live loop ----------
  function tick() {
    if (!M.active()) { if (M.plan) { M.plan = null; M.emit(); } return; }
    const cur = P.current; if (!cur || !E.playing) return;
    if (!grid(cur)) { M.ensure(cur); return; }
    if (!M.plan && !E.xfading && !M.armed) M.replan();
    const plan = M.plan;
    if (plan && !M.armed && plan.a === cur.id) {
      const wait = (plan.fxAt - E.time) / (E.deck.el.playbackRate || 1);
      if (wait < 1.2) arm(plan);
    }
  }
  // Beat lock: while two songs play together, nudge the incoming one's speed so its beats sit on the outgoing beats
  // (what a DJ does with the pitch fader), then ease it back to normal speed once the old song is gone.
  function lock() {
    const mx = E.mixing, lv = M.live;
    if (mx && lv && lv.match && A.MIX_STYLES[mx.style] && A.MIX_STYLES[mx.style].blend && mx.style !== 'cut' && lv.ma && lv.mb) {
      const bsA = beatLen(lv.ma), bsB = 60 / (lv.mb.bpm * lv.k);
      const posA = (mx.from.el.currentTime - lv.ma.beat0) / bsA, posB = (mx.to.el.currentTime - lv.mb.beat0) / bsB;
      let err = (posB - posA) % 1; if (err > 0.5) err -= 1; if (err < -0.5) err += 1;
      // the incoming song starts a few milliseconds late (audio start-up), so once it is running, jump it onto the
      // beat in one go while it is still quiet, then let the speed nudges hold it there
      if (!lv.fixed && performance.now() - lv.started > 400 && !mx.to.el.paused) { lv.fixed = true; if (Math.abs(err) > 0.02) { mx.to.el.currentTime = mx.to.el.currentTime - err * bsB; lv.err = err; return; } }
      E.setDeckRate(mx.to, lv.rate * (1 - A.clamp(err * 0.2, -0.035, 0.035)));
      lv.err = err;
    } else if (lv && !mx && P.isLoaded() && P.current && P.current.id === lv.b) {
      const d = E.deck, target = E.rate || 1, r = d.el.playbackRate;
      if (Math.abs(r - target) < 0.0008) { E.setDeckRate(d, target); M.live = null; M.replan(); }
      else E.setDeckRate(d, r + Math.sign(target - r) * Math.min(0.0007, Math.abs(target - r)));
    }
  }
  setInterval(lock, 100);
  E.addEventListener('tick', tick);
  P.addEventListener('queue', () => { if (M.active() && !E.xfading && !M.live) M.replan(); });
  P.addEventListener('track', (e) => {
    const t = e.detail && e.detail.track; if (!M.active() || !t) return;
    M.ensure(t); const nid = P.peekNext(); if (nid) M.ensure(L.byId.get(nid));
    // first song of a set in Best parts mode: start where the song builds into its hook
    const m = grid(t); if (m && !M.live && M.mode() === 'parts' && E.time < 3 && !t._mixStarted) { const s = inPoint(m, 'parts'); if (s > 1) E.seek(s); }
    M.fxOn = false;
    if (!E.xfading) setTimeout(M.replan, 300);
  });
  P.addEventListener('state', () => { if (!E.playing) M.disarm(); });

  // ---------- picture of the song for the DJ page ----------
  M.strip = (t) => {
    const m = grid(t); if (!m) return '';
    const n = m.bars.length, plan = M.plan && M.plan.a === t.id ? M.plan : null, dur = m.dur || t.duration || 1, pct = (s) => A.clamp((s / dur) * 100, 0, 100);
    const hookS = barAt(m, m.hb), hookE = barAt(m, m.he);
    return `<div class="mixstrip" data-tid="${t.id}"><div class="ms-bars">${m.bars.map((v) => `<i style="height:${Math.max(6, v)}%"></i>`).join('')}</div>
      <span class="ms-hook" style="left:${pct(hookS)}%;width:${pct(hookE) - pct(hookS)}%"></span>${plan ? `<span class="ms-out" style="left:${pct(plan.at)}%"></span>` : ''}<span class="ms-head" id="ms-head"></span></div>`;
  };
  M.describe = () => {
    const p = M.plan, lv = M.live;
    if (lv && E.mixing) return `Mixing now · ${A.MIX_STYLES[lv.style].name}${lv.match && A.MIX_STYLES[lv.style].blend ? ', beats locked' : ''}`;
    if (M.fxOn && p) return `${A.MIX_STYLES[p.style].name}…`;
    if (!p) return M.active() ? 'Reading the song…' : '';
    const b = L.byId.get(p.b), S = A.MIX_STYLES[p.style];
    return `Next: ${S.name.toLowerCase()} into “${b ? b.title : ''}” at ${A.fmt(p.at)}${M.mode() === 'parts' ? ', after the hook' : ''}${S.blend && p.match ? ` · ${p.bars}-bar blend` : ''}${p.keyA && p.keyB ? ` · ${p.keyA} → ${p.keyB}` : ''}`;
  };
  setInterval(() => { const h = document.getElementById('ms-head'); if (h && P.current) { const m = grid(P.current); const dur = (m && m.dur) || E.duration || 1; h.style.left = A.clamp((E.time / dur) * 100, 0, 100) + '%'; const d = document.getElementById('mix-desc'); if (d) d.textContent = M.describe(); } }, 250);
})(window.A);
