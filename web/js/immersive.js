/* Aurora - the Living Album: Now Playing as a place, not a panel.
   - Pulse: a visual field drawn from the sound itself (bass, mids, highs, loudness and detected beats), in the colours
     of the album cover. A few art-directed styles, from ambient light to full motion. On devices where the audio can't
     be measured live (Android's direct playback), it follows the song's beat grid and energy map instead.
   - Songs hand over to each other: the old artwork's colour fades out under the new one, the new cover settles in.
   - Zen: when you stop touching anything, the controls fade away and only the music, art and lyrics remain.
   - Press play on an album, playlist or mix and Now Playing opens by itself (can be turned off). */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine, $ = A.$, $$ = A.$$;
  const I = A.immersive = {};
  A.PULSE_STYLES = {
    aurora: { name: 'Aurora', tag: 'Ribbons of light that ride the music' },
    glow: { name: 'Ambient', tag: 'Soft colour that breathes with the song' },
    bloom: { name: 'Bloom', tag: 'Rings and sparks on every beat' },
    bars: { name: 'Spectrum', tag: 'The classic frequency bars' },
    off: { name: 'Still', tag: 'Just the artwork' }
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  I.style = () => { const s = A.store.get('pulseStyle', reduced ? 'glow' : 'aurora'); return A.PULSE_STYLES[s] ? s : 'aurora'; };
  I.setStyle = (s) => { A.store.set('pulseStyle', s); apply(); };

  const np = $('#np'), cv = document.createElement('canvas'); cv.id = 'pulse'; cv.className = 'np-pulse'; cv.setAttribute('aria-hidden', 'true');
  np.insertBefore(cv, $('#np-bg').nextSibling);
  const g = cv.getContext('2d');
  function apply() { const s = I.style(); np.dataset.pulse = s; cv.classList.toggle('soft', s === 'aurora' || s === 'glow'); size(); loop(); }

  // ---------- listening to the sound ----------
  const F = I.feat = { bass: 0, mid: 0, high: 0, level: 0, kick: 0 }; let avgB = 0.2, prevB = 0, lastBeat = 0;
  function sample(now, dt) {
    let bass = 0, mid = 0, high = 0, live = false;
    if (E.playing) {
      const bars = E.getBars(32);
      if (bars) { let s = 0; for (let i = 0; i < bars.length; i++) s += bars[i]; if (s > 0.15) { live = true; bass = (bars[0] + bars[1] + bars[2] + bars[3]) / 4; for (let i = 4; i < 15; i++) mid += bars[i] / 11; for (let i = 15; i < 32; i++) high += bars[i] / 17; } }
      if (!live && P.current) { // no live audio data: follow the beat grid
        const t = P.current, m = A.mixer && A.mixer.grid(t), bpm = (m && m.bpm) || (t.an && t.an.tempo) || 100, b0 = (m && m.beat0) || 0;
        const ph = (((E.time - b0) * bpm) / 60) % 1, bar = m ? m.bars[Math.floor((E.time - m.bar0) / (240 / bpm))] : null;
        const en = bar != null ? bar / 100 : (t.an && t.an.energy) || 0.5;
        bass = en * (0.35 + 0.65 * Math.exp(-Math.max(0, ph) * 7)); mid = en * (0.5 + 0.1 * Math.sin(now / 900)); high = en * 0.35;
      }
    }
    const ease = (a, b, up, down) => a + (b - a) * (b > a ? up : down);
    F.bass = ease(F.bass, bass, 0.55, 0.1); F.mid = ease(F.mid, mid, 0.35, 0.08); F.high = ease(F.high, high, 0.4, 0.1);
    const flux = bass - prevB; prevB = bass; avgB = avgB * 0.96 + bass * 0.04;
    if (bass > avgB * 1.18 && flux > 0.035 && now - lastBeat > 260) { F.kick = 1; lastBeat = now; onBeat(); }
    F.kick *= Math.pow(0.04, dt); F.level = F.bass * 0.5 + F.mid * 0.35 + F.high * 0.15;
  }

  // ---------- colour from the cover ----------
  let pal = [[124, 92, 255], [255, 77, 141], [80, 200, 255]], palAt = 0;
  function palette(now) {
    if (now - palAt < 600) return; palAt = now;
    const cs = getComputedStyle(document.documentElement), p = (v) => cs.getPropertyValue(v).split(',').map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));
    const a = p('--ar'), b = p('--ar2'); if (a.length === 3 && b.length === 3) pal = [a, b, shift(a, b)];
  }
  const shift = (a, b) => [Math.min(255, (a[2] + b[1]) / 1.6), Math.min(255, (a[0] + b[2]) / 1.7), Math.min(255, (a[1] + b[0]) / 1.5)].map(Math.round);
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

  // ---------- drawing ----------
  let W = 0, H = 0, scale = 1;
  function size() {
    const s = I.style(), soft = s === 'aurora' || s === 'glow'; scale = soft ? 0.3 : Math.min(1.25, devicePixelRatio || 1) * 0.75;
    W = Math.max(2, Math.round(np.clientWidth * scale)); H = Math.max(2, Math.round(np.clientHeight * scale));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  window.addEventListener('resize', A.debounce(size, 150));
  const rings = [], sparks = [];
  function onBeat() {
    if (I.style() !== 'bloom' || rings.length > 8) return;
    rings.push({ born: performance.now(), c: pal[rings.length % 2] });
  }
  function center() { const a = $('#np-art'), r = a && a.getBoundingClientRect(), n = np.getBoundingClientRect(); if (!r || !r.width || document.body.classList.contains('lyr-full')) return [W / 2, H / 2, Math.min(W, H) * 0.18]; return [(r.left - n.left + r.width / 2) * scale, (r.top - n.top + r.height / 2) * scale, (r.width / 2) * scale]; }

  function drawAurora(t) {
    g.globalCompositeOperation = 'lighter';
    const bands = [F.bass, F.mid, F.high, (F.bass + F.high) / 2], bpm = (P.current && P.current.an && P.current.an.tempo) || 100, sp = 0.35 + bpm / 260;
    for (let k = 0; k < 4; k++) {
      const c = pal[k % 3], base = H * (0.26 + 0.16 * k), amp = H * (0.05 + 0.2 * bands[k]), th = H * (0.14 + 0.22 * F.level + 0.1 * F.kick * (k === 0)), ph = t * sp * (0.18 + 0.07 * k) + k * 1.7;
      const grd = g.createLinearGradient(0, base - amp - th, 0, base + amp + th); grd.addColorStop(0, rgba(c, 0)); grd.addColorStop(0.5, rgba(c, 0.35 + 0.4 * bands[k])); grd.addColorStop(1, rgba(c, 0));
      g.fillStyle = grd; g.beginPath();
      const y = (x) => base + Math.sin((x / W) * (1.3 + k * 0.45) * Math.PI * 2 + ph) * amp + Math.sin((x / W) * 3.3 + ph * 1.6) * amp * 0.45;
      g.moveTo(0, y(0) - th / 2); for (let x = 0; x <= W; x += 6) g.lineTo(x, y(x) - th / 2);
      for (let x = W; x >= 0; x -= 6) g.lineTo(x, y(x) + th / 2 + Math.sin(x / 40 + ph * 2) * th * 0.15);
      g.closePath(); g.fill();
    }
  }
  function drawGlow(t) {
    g.globalCompositeOperation = 'lighter'; const m = Math.min(W, H);
    for (let k = 0; k < 4; k++) {
      const c = pal[k % 3], cx = W * (0.5 + 0.33 * Math.sin(t * 0.06 * (k + 1) + k * 2.1)), cy = H * (0.5 + 0.3 * Math.cos(t * 0.045 * (k + 1.3) + k));
      const r = m * (0.32 + 0.3 * F.level + (k === 0 ? 0.14 * F.kick : 0)), grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, rgba(c, 0.5 + 0.3 * F.level)); grd.addColorStop(1, rgba(c, 0)); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
  }
  function drawBloom(t, now, dt) {
    const [cx, cy, r0] = center(); g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(cx, cy, r0 * 0.6, cx, cy, r0 * (1.6 + F.kick * 0.8)); grd.addColorStop(0, rgba(pal[0], 0.28 + 0.4 * F.kick)); grd.addColorStop(1, rgba(pal[1], 0)); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    for (let i = rings.length - 1; i >= 0; i--) {
      const rg = rings[i], age = (now - rg.born) / 1000; if (age > 1.8) { rings.splice(i, 1); continue; }
      g.strokeStyle = rgba(rg.c, (1 - age / 1.8) * 0.55); g.lineWidth = (2 + 6 * (1 - age / 1.8)) * scale * 1.4;
      g.beginPath(); g.arc(cx, cy, r0 * 1.02 + age * Math.max(W, H) * 0.32, 0, Math.PI * 2); g.stroke();
    }
    const want = Math.min(260, 40 + F.level * 320); let n = Math.round(F.level * 6 + F.kick * 10);
    while (n-- > 0 && sparks.length < want) { const a = Math.random() * Math.PI * 2; sparks.push({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0, vx: Math.cos(a), vy: Math.sin(a), life: 0, max: 1.5 + Math.random() * 1.6, s: 0.6 + Math.random() * 1.8, c: pal[Math.floor(Math.random() * 3)] }); }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt; if (p.life > p.max) { sparks.splice(i, 1); continue; }
      const sp = (30 + 220 * F.level) * scale * dt; p.x += p.vx * sp; p.y += p.vy * sp;
      g.fillStyle = rgba(p.c, (1 - p.life / p.max) * 0.85); g.beginPath(); g.arc(p.x, p.y, p.s * scale * 1.6, 0, Math.PI * 2); g.fill();
    }
  }

  let raf = 0, last = 0;
  const running = () => document.body.classList.contains('np-open') && !document.hidden && !['off', 'bars'].includes(I.style());
  function frame(now) {
    raf = 0; if (!running()) { g.clearRect(0, 0, W, H); return; }
    const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    palette(now); sample(now, dt);
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
    const t = now / 1000, s = I.style();
    if (s === 'aurora') drawAurora(t); else if (s === 'glow') drawGlow(t); else if (s === 'bloom') drawBloom(t, now, dt);
    raf = requestAnimationFrame(frame);
  }
  function loop() { if (!raf && running()) { last = 0; size(); raf = requestAnimationFrame(frame); } }
  new MutationObserver(loop).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', loop);

  // ---------- one song handing over to the next ----------
  P.addEventListener('track', () => {
    if (!document.body.classList.contains('np-open')) return;
    const bg = $('#np-bg'); if (bg && bg.style.backgroundImage) { const gh = bg.cloneNode(); gh.id = ''; gh.classList.add('ghost'); bg.after(gh); requestAnimationFrame(() => gh.classList.add('out')); setTimeout(() => gh.remove(), 1600); }
    const art = $('#np-art'); if (art) { art.classList.remove('np-enter'); void art.offsetWidth; art.classList.add('np-enter'); }
  });

  // ---------- zen: controls fade when you're just listening ----------
  let zt = 0;
  const wake = () => { document.body.classList.remove('np-zen'); clearTimeout(zt); zt = setTimeout(() => { if (document.body.classList.contains('np-open') && E.playing && A.store.get('zen', true) && !np.querySelector(':hover > button:hover, input:focus')) document.body.classList.add('np-zen'); }, 4000); };
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => np.addEventListener(ev, wake, { passive: true }));
  document.addEventListener('keydown', wake);
  P.addEventListener('state', wake);

  // ---------- extra buttons on the Now Playing screen ----------
  const more = $('#np-more'), right = document.createElement('div'); right.className = 'np-right';
  right.innerHTML = `<button class="icon-btn" data-a="pulse-cycle" id="np-pulse" title="Visual style (V)">${A.icon('wave')}</button><button class="icon-btn" data-a="lyr-full" id="np-lyrfull" title="Full-screen lyrics (Shift+Y)">${A.icon('mic')}</button><button class="icon-btn" data-a="mini" id="np-mini" title="Mini player (I)">${A.icon('pip')}</button>`;
  more.replaceWith(right); right.appendChild(more);
  Object.assign(A.actions, {
    'pulse-cycle': () => { const ks = Object.keys(A.PULSE_STYLES), n = ks[(ks.indexOf(I.style()) + 1) % ks.length]; I.setStyle(n); A.toast('Visuals: ' + A.PULSE_STYLES[n].name); },
    'pulse-set': (el) => { I.setStyle(el.dataset.id); if (A.route.name === 'settings') A.render(true); }
  });
  // pressing play on a card (album, playlist, mix) steps into Now Playing
  const playCtx = A.actions['play-ctx'];
  I.autoOpen = () => { if (A.store.get('immersive', true) && A.openNp) setTimeout(() => A.openNp(true), 60); };
  if (playCtx) A.actions['play-ctx'] = (el, e) => { playCtx(el, e); I.autoOpen(); };
  apply();
})(window.A);
