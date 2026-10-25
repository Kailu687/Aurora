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
  const phraseAt = (m, i) => m.bar0 + i * 32 * beatLen(m);
  const inPoint = (m, mode) => (mode === 'parts' ? phraseAt(m, Math.max(0, Math.min(m.hook - 1, m.i0))) : Math.max(0, m.bar0));
  M.active = () => !!(A.dj && A.dj.s && P.context.type === 'dj' && M.mode() !== 'fade');
  M.owns = () => M.active() && !!grid(P.current) && !!M.plan;

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
  // Works out: when on the current song the blend starts (at), where the next song comes in (startAt), how fast it
  // must play to match tempo (rate), how long the blend is (blend, real seconds) and the style.
  function makePlan(a, b, { now = 0, soon = false } = {}) {
    const ma = grid(a), mb = grid(b); if (!ma || !mb) return null;
    const mode = M.mode(), rateA = E.deck.el.playbackRate || 1, effA = ma.bpm * rateA;
    let k = 1, r = effA / mb.bpm; for (const kk of [0.5, 2]) { const rr = effA / (mb.bpm * kk); if (Math.abs(rr - 1) < Math.abs(r - 1)) { r = rr; k = kk; } }
    const match = Math.abs(r - 1) <= 0.08;
    const bsA = beatLen(ma), bar = 4 * bsA, energy = ((a.an.energy || 0.5) + (b.an.energy || 0.5)) / 2;
    const bars = !match ? 1 : soon ? 2 : energy > 0.66 ? 4 : energy < 0.38 ? 16 : 8;
    const blendA = bars * bar; // in the current song's own seconds
    const dur = E.duration || ma.dur || a.duration, limit = dur - blendA - 0.5;
    let at;
    if (soon) at = ma.bar0 + Math.ceil((now + 0.35 * rateA - ma.bar0) / bar) * bar;
    else at = phraseAt(ma, mode === 'parts' ? Math.min(ma.hook + 1, ma.last + 1) : ma.last + 1);
    if (at > limit) at = ma.bar0 + Math.floor((limit - ma.bar0) / bar) * bar;
    if (!soon && at < now + 3) at = ma.bar0 + Math.ceil((now + 3 - ma.bar0) / bar) * bar;
    if (!(at > now) || at > limit + 0.01) return null;
    return { a: a.id, b: b.id, at, startAt: inPoint(mb, mode), rate: match ? r : 1, k, blend: blendA / rateA, style: match ? 'swap' : 'cut', bpmA: ma.bpm, bpmB: mb.bpm, match, bars };
  }
  M.replan = () => {
    M.disarm();
    const a = P.current, nid = P.peekNext(), b = nid && L.byId.get(nid);
    M.plan = M.active() && a && b && b.id !== a.id && P.isLoaded() ? makePlan(a, b, { now: E.time }) : null;
    M.emit();
  };
  M.disarm = () => { clearTimeout(M.armed); M.armed = null; };
  function fire(plan) {
    M.armed = null;
    if (!M.active() || !P.current || P.current.id !== plan.a || P.peekNext() !== plan.b) return M.replan();
    const late = Math.max(0, E.time - plan.at) / (E.deck.el.playbackRate || 1); // real seconds we are late by
    M.live = { ...plan, ma: grid(P.current), mb: grid(L.byId.get(plan.b)), started: performance.now() };
    M.plan = null;
    P.next(true, { startAt: plan.startAt + late * plan.rate, blend: plan.blend, rate: plan.rate, style: plan.style });
  }

  // Skip during a DJ set: mix out on the next bar instead of cutting
  M.quickMix = () => {
    if (!M.active() || !P.isLoaded() || E.xfading) return false;
    const a = P.current, nid = P.peekNext(), b = nid && L.byId.get(nid); if (!a || !b || !grid(a) || !grid(b)) return false;
    const plan = makePlan(a, b, { now: E.time, soon: true }); if (!plan) return false;
    M.disarm(); M.plan = plan; M.emit();
    M.armed = setTimeout(() => fire(plan), Math.max(0, ((plan.at - E.time) / (E.deck.el.playbackRate || 1)) * 1000 - 12));
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
      const wait = (plan.at - E.time) / (E.deck.el.playbackRate || 1);
      if (wait < 1.2) M.armed = setTimeout(() => fire(plan), Math.max(0, wait * 1000 - 12));
    }
  }
  // Beat lock: while two songs play together, nudge the incoming one's speed so its beats sit on the outgoing beats
  // (what a DJ does with the pitch fader), then ease it back to normal speed once the old song is gone.
  function lock() {
    const mx = E.mixing, lv = M.live;
    if (mx && lv && mx.style === 'swap' && lv.ma && lv.mb) {
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
    if (!E.xfading) setTimeout(M.replan, 300);
  });
  P.addEventListener('state', () => { if (!E.playing) M.disarm(); });

  // ---------- picture of the song for the DJ page ----------
  M.strip = (t) => {
    const m = grid(t); if (!m) return '';
    const n = m.bars.length, plan = M.plan && M.plan.a === t.id ? M.plan : null, dur = m.dur || t.duration || 1, pct = (s) => A.clamp((s / dur) * 100, 0, 100);
    const hookS = phraseAt(m, m.hook), hookE = phraseAt(m, m.hook + 1);
    return `<div class="mixstrip" data-tid="${t.id}"><div class="ms-bars">${m.bars.map((v) => `<i style="height:${Math.max(6, v)}%"></i>`).join('')}</div>
      <span class="ms-hook" style="left:${pct(hookS)}%;width:${pct(hookE) - pct(hookS)}%"></span>${plan ? `<span class="ms-out" style="left:${pct(plan.at)}%"></span>` : ''}<span class="ms-head" id="ms-head"></span></div>`;
  };
  M.describe = () => {
    const p = M.plan, lv = M.live; if (lv && E.mixing) return `Mixing now · ${lv.match ? `${lv.bpmA.toFixed(0)} → ${lv.bpmB.toFixed(0)} BPM, beats locked` : 'quick cut on the beat'}`;
    if (!p) return M.active() ? 'Reading the beat grid…' : '';
    const b = L.byId.get(p.b); return `Next: into “${b ? b.title : ''}” at ${A.fmt(p.at)} · ${p.match ? `${p.bpmA.toFixed(0)} → ${p.bpmB.toFixed(0)} BPM${Math.abs(p.rate - 1) > 0.004 ? ` (${p.rate > 1 ? '+' : ''}${((p.rate - 1) * 100).toFixed(1)}%)` : ''}, ${p.bars}-bar blend with a bass swap` : 'tempos too far apart, so a quick cut on the downbeat'}`;
  };
  setInterval(() => { const h = document.getElementById('ms-head'); if (h && P.current) { const m = grid(P.current); const dur = (m && m.dur) || E.duration || 1; h.style.left = A.clamp((E.time / dur) * 100, 0, 100) + '%'; const d = document.getElementById('mix-desc'); if (d) d.textContent = M.describe(); } }, 250);
})(window.A);
