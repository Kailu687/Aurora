/* Aurora - moods, Flow Architect and the Perfect Next Song.
   Everything here runs on the device from the analysis Aurora already keeps for each song (energy, tempo, brightness,
   groove, the beat grid) plus genre, year and listening history. No online AI, no accounts, no cost.
   - Moods: a small set of feelings described by those numbers, so a song can be scored against "calm" or "euphoric".
   - Flow Architect: give it a journey (calm -> nostalgic -> energetic -> euphoric) and a length, and it orders your songs
     so the feeling moves along that path without sudden jumps in tempo or intensity.
   - Perfect Next Song: when the queue runs out, it keeps picking one fitting song at a time (Familiar, Surprise me or
     Somewhere new), learns from skips, and lets the energy drift gently instead of shuffling at random. */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine, nrm = A.norm, clamp = A.clamp;
  const F = A.flow = { listeners: new Set() };
  F.emit = (ev) => F.listeners.forEach((f) => f(ev));

  // ---------- moods ----------
  // e = energy 0-1, bpm = typical tempo, b = brightness 0-1 (dark/sad to bright/happy), g = genres and words that hint at it
  A.MOODS = [
    { id: 'calm', name: 'Calm', e: 0.16, bpm: 78, b: 0.38, c: ['#74ebd5', '#4a6cf7'], g: ['ambient', 'acoustic', 'piano', 'lofi', 'lo-fi', 'chill', 'classical', 'new age', 'folk', 'sleep', 'meditat', 'instrumental'] },
    { id: 'dreamy', name: 'Dreamy', e: 0.3, bpm: 92, b: 0.48, c: ['#a18cd1', '#5b3cff'], g: ['dream', 'shoegaze', 'chillwave', 'synthwave', 'trip-hop', 'downtempo', 'ambient', 'indie'] },
    { id: 'melancholy', name: 'Melancholy', e: 0.24, bpm: 80, b: 0.22, c: ['#4b6cb7', '#182848'], g: ['sad', 'ballad', 'blues', 'slowcore', 'emo', 'singer', 'acoustic', 'piano'] },
    { id: 'nostalgic', name: 'Nostalgic', e: 0.44, bpm: 104, b: 0.52, c: ['#f7971e', '#c94b4b'], g: ['oldies', 'classic', 'retro', '80s', '90s', 'motown', 'disco', 'new wave', 'soul', 'britpop', 'grunge'], old: true },
    { id: 'warm', name: 'Warm', e: 0.42, bpm: 98, b: 0.62, c: ['#f6d365', '#fda085'], g: ['soul', 'r&b', 'rnb', 'jazz', 'funk', 'bossa', 'folk', 'neo soul', 'reggae'] },
    { id: 'focused', name: 'Focused', e: 0.36, bpm: 104, b: 0.45, c: ['#43cea2', '#185a9d'], g: ['instrumental', 'classical', 'post-rock', 'lofi', 'lo-fi', 'study', 'piano', 'soundtrack', 'score', 'electronic'] },
    { id: 'upbeat', name: 'Upbeat', e: 0.62, bpm: 116, b: 0.72, c: ['#f9d423', '#ff4e50'], g: ['pop', 'funk', 'disco', 'indie', 'reggae', 'ska', 'happy', 'summer', 'dance'] },
    { id: 'energetic', name: 'Energetic', e: 0.78, bpm: 128, b: 0.6, c: ['#ff512f', '#dd2476'], g: ['rock', 'edm', 'dance', 'hip hop', 'hip-hop', 'house', 'electronic', 'rap', 'punk', 'workout'] },
    { id: 'euphoric', name: 'Euphoric', e: 0.9, bpm: 128, b: 0.8, c: ['#fc466b', '#3f5efb'], g: ['trance', 'edm', 'house', 'progressive', 'dance', 'anthem', 'festival', 'euphoric', 'big room'] },
    { id: 'intense', name: 'Intense', e: 0.93, bpm: 142, b: 0.32, c: ['#f12711', '#2b1055'], g: ['metal', 'punk', 'dubstep', 'drum', 'techno', 'trap', 'hardcore', 'industrial'] }
  ];
  A.moodById = (id) => A.MOODS.find((m) => m.id === id);

  // tempo distance that treats double / half time as the same groove
  const tempoGap = (a, b) => { if (!a || !b) return 0.15; const r = a / b; return Math.min(Math.abs(r - 1), Math.abs(r / 2 - 1), Math.abs(r * 2 - 1)); };
  F.tempoGap = tempoGap;
  const bpmOf = (t) => (t.an && ((t.an.mix && t.an.mix.bpm) || t.an.tempo)) || 0;
  const brightOf = (t) => (t.an && t.an.bright != null ? clamp(t.an.bright, 0, 1) : 0.5);
  let medianYear = 0;
  const yearsCache = () => { const ys = L.tracks.map((t) => t.year).filter(Boolean).sort((a, b) => a - b); medianYear = ys.length ? ys[Math.floor(ys.length / 2)] : 0; };

  // a song as a point in feeling-space: energy, tempo, brightness
  const feel = (t) => ({ e: t.an ? t.an.energy : 0.5, bpm: bpmOf(t), b: brightOf(t), known: !!t.an });
  F.feel = feel;
  const genreHit = (t, words) => { const g = nrm(t.genre), blob = nrm(t.title + ' ' + t.album); for (const w of words) if (g.includes(w)) return 1; for (const w of words) if (w.length > 3 && blob.includes(w)) return 0.4; return 0; };

  // how well a song fits a target (a mood, or a blend of two moods)
  function fitTarget(t, tg) {
    const f = feel(t);
    let s = 0;
    if (f.known) {
      s += 0.5 * (1 - Math.min(1, Math.abs(f.e - tg.e) / 0.3));
      s += 0.14 * (1 - Math.min(1, tempoGap(f.bpm, tg.bpm) / 0.25));
      s += 0.12 * (1 - Math.min(1, Math.abs(f.b - tg.b) / 0.35));
    } else s += 0.3;
    s += 0.24 * tg.moods.reduce((a, [m, w]) => a + w * genreHit(t, m.g), 0);
    const old = tg.moods.reduce((a, [m, w]) => a + (m.old ? w : 0), 0);
    if (old) { let n = 0; if (t.year && medianYear) n += t.year < medianYear - 4 ? 1 : t.year < medianYear ? 0.5 : 0; if (t.plays > 2 && Date.now() - (t.last || 0) > 120 * 864e5) n += 0.6; s += 0.22 * old * Math.min(1, n); }
    return s;
  }
  F.moodScore = (t, m) => fitTarget(t, { e: m.e, bpm: m.bpm, b: m.b, moods: [[m, 1]] });
  // the closest mood for a song (used for labels like "Nostalgic" in the preview)
  F.moodOf = (t) => { if (!medianYear) yearsCache(); let best = A.MOODS[0], bs = -1; for (const m of A.MOODS) { const s = F.moodScore(t, m); if (s > bs) { bs = s; best = m; } } return best; };

  // how jarring it is to go from one song to the next: 0 = seamless, 1 = a wall
  function jump(a, b) {
    if (!a || !b) return 0; const fa = feel(a), fb = feel(b);
    if (!fa.known || !fb.known) return 0.25;
    return clamp(Math.abs(fa.e - fb.e) / 0.32, 0, 1.5) * 0.6 + clamp(tempoGap(fa.bpm, fb.bpm) / 0.14, 0, 1.5) * 0.3 + clamp(Math.abs(fa.b - fb.b) / 0.45, 0, 1) * 0.1;
  }
  F.jump = jump;
  F.jumpLabel = (a, b) => { const j = jump(a, b); if (j < 0.38) return ''; const d = feel(b).e - feel(a).e; return j > 0.75 ? (d > 0 ? 'Big lift' : d < 0 ? 'Big drop' : 'Tempo jump') : d > 0.12 ? 'Lift' : d < -0.12 ? 'Drop' : 'Tempo change'; };

  // ---------- Flow Architect ----------
  F.LENGTHS = [[20, '20 min'], [45, '45 min'], [90, '1.5 hours'], [120, '2 hours']];
  // the target feeling at a point x (0-1) along the journey
  F.targetAt = (stops, x) => {
    const ms = stops.map(A.moodById).filter(Boolean); if (ms.length === 1) { const m = ms[0]; return { e: m.e, bpm: m.bpm, b: m.b, moods: [[m, 1]] }; }
    const seg = Math.min(ms.length - 2, Math.floor(x * (ms.length - 1))), u = x * (ms.length - 1) - seg, s = u * u * (3 - 2 * u); // smoothstep: settle into each mood
    const a = ms[seg], b = ms[seg + 1];
    return { e: a.e + (b.e - a.e) * s, bpm: a.bpm + (b.bpm - a.bpm) * s, b: a.b + (b.b - a.b) * s, moods: [[a, 1 - s], [b, s]] };
  };
  F.build = ({ stops, minutes, seed = Math.random(), pool = null }) => {
    if (!medianYear) yearsCache();
    const goal = minutes * 60, rnd = mulberry(Math.floor(seed * 1e9));
    let cand = (pool || L.tracks).filter((t) => t.duration > 45 && t.duration < 900);
    const used = new Set(), out = []; let time = 0, prev = null; const recentArtists = [];
    // Leave a song out if its whole length would push the set well past the goal
    while (time < goal - 60 && cand.length) {
      const x = clamp((time + 100) / goal, 0, 1), tg = F.targetAt(stops, x);
      let best = null, bs = -1e9;
      for (const t of cand) {
        if (used.has(t.id)) continue;
        let s = fitTarget(t, tg) - 0.55 * jump(prev, t);
        if (recentArtists.includes(A.artistKey(t.artist))) s -= 0.35;
        if (t.liked) s += 0.04; if (time + t.duration > goal + 240) s -= 0.3;
        s += rnd() * 0.12;
        if (s > bs) { bs = s; best = t; }
      }
      if (!best) break;
      used.add(best.id); out.push(best.id); time += best.duration; prev = best;
      recentArtists.push(A.artistKey(best.artist)); if (recentArtists.length > 3) recentArtists.shift();
    }
    return { stops, minutes, ids: out, made: Date.now() };
  };
  // a different song for one place in the set, that still fits the journey and its neighbours
  F.swap = (draft, i) => {
    const ids = draft.ids, before = L.byId.get(ids[i - 1]), after = L.byId.get(ids[i + 1]);
    let time = 0; for (let k = 0; k < i; k++) time += (L.byId.get(ids[k]) || {}).duration || 0;
    const tg = F.targetAt(draft.stops, clamp((time + 100) / (draft.minutes * 60), 0, 1)), taken = new Set(ids);
    const opts = L.tracks.filter((t) => !taken.has(t.id) && t.duration > 45).map((t) => [fitTarget(t, tg) - 0.45 * jump(before, t) - 0.45 * jump(t, after) + Math.random() * 0.1, t]).sort((a, b) => b[0] - a[0]);
    if (opts.length) ids[i] = opts[0][1].id;
  };
  F.title = (stops) => stops.map((s) => (A.moodById(s) || {}).name).join(' → ');
  function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  F.rng = mulberry;

  // the journey as a picture: the target curve, and the real songs as dots on it
  F.curveSVG = (draft) => {
    const W = 900, H = 150, pad = 14, ids = draft.ids.map((i) => L.byId.get(i)).filter(Boolean); const total = ids.reduce((a, t) => a + t.duration, 0) || 1;
    const y = (e) => H - pad - clamp(e, 0, 1) * (H - pad * 2);
    let path = ''; for (let k = 0; k <= 60; k++) { const x = k / 60; path += (k ? 'L' : 'M') + (x * W).toFixed(1) + ' ' + y(F.targetAt(draft.stops, x).e).toFixed(1); }
    let tm = 0; const pts = ids.map((t) => { const mid = (tm + t.duration / 2) / total; tm += t.duration; return [mid * W, y(feel(t).e), t]; });
    const ms = draft.stops.map(A.moodById).filter(Boolean), c0 = ms[0].c[0], c1 = ms[ms.length - 1].c[1];
    return `<svg class="flow-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Energy across the journey"><defs><linearGradient id="fg" x1="0" x2="1"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient><linearGradient id="fga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c1}" stop-opacity=".3"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></linearGradient></defs>
      <path d="${path} L${W} ${H} L0 ${H}Z" fill="url(#fga)"/><path d="${path}" fill="none" stroke="url(#fg)" stroke-width="3" stroke-dasharray="7 6" opacity=".9"/>
      <polyline points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5"/>
      ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="#fff" data-fi="${i}"><title>${A.esc(p[2].title)}</title></circle>`).join('')}
      ${ms.map((m, i) => `<text x="${ms.length === 1 ? 8 : (i / (ms.length - 1)) * W}" y="14" text-anchor="${i === 0 ? 'start' : i === ms.length - 1 ? 'end' : 'middle'}" class="flow-lbl">${A.esc(m.name)}</text>`).join('')}</svg>`;
  };

  // ---------- Perfect Next Song ----------
  A.CONT_MODES = {
    familiar: { name: 'Familiar', tag: 'Songs you love that feel like this one' },
    surprise: { name: 'Surprise me', tag: 'Mostly familiar, with the odd curveball that still fits' },
    new: { name: 'Somewhere new', tag: 'Songs you rarely play, eased in gently' }
  };
  F.contMode = () => (A.CONT_MODES[A.store.get('contMode', 'familiar')] ? A.store.get('contMode', 'familiar') : 'familiar');
  F.setContMode = (m) => { A.store.set('contMode', m); if (!P.autoplay) { P.autoplay = true; A.store.set('autoplay', true); } F.reasons.clear(); F.refreshTail(); F.emit('mode'); };
  F.reasons = new Map(); // id -> why it was picked, shown in the queue
  const C = F.cont = { drift: 0, skips: [], auto: new Set() };

  function sim(a, b) { // 0..~1.6
    let s = 0;
    if (a.artist && A.artistKey(a.artist) === A.artistKey(b.artist)) s += 0.3;
    if (a.album && a.album === b.album) s += 0.12;
    if (a.genre && b.genre && nrm(a.genre) === nrm(b.genre)) s += 0.3; else if (a.genre && b.genre && (nrm(a.genre).includes(nrm(b.genre)) || nrm(b.genre).includes(nrm(a.genre)))) s += 0.18;
    if (a.year && b.year) s += 0.12 * (1 - Math.min(1, Math.abs(a.year - b.year) / 10));
    s += 0.55 * (1 - Math.min(1, jump(a, b)));
    return s;
  }
  F.sim = sim;

  // choose the next song after `cur` (history-aware). Returns { t, why } or null.
  F.pickNext = (cur, mode = F.contMode(), { exclude = new Set() } = {}) => {
    if (!cur) return null; if (!medianYear) yearsCache();
    const recent = new Set(P.hist.slice(-60).map((h) => h[0])), queued = new Set(P.order.slice(Math.max(0, P.pos - 30)));
    const hour = new Date().getHours(), late = hour >= 23 || hour < 6;
    // energy drifts slowly: a little upward through the day, downward late at night, never in a hurry
    C.drift = clamp(C.drift * 0.7 + (Math.random() - (late ? 0.62 : 0.42)) * 0.08, -0.1, 0.1);
    const fc = feel(cur), target = clamp(fc.e + C.drift, 0.05, 0.97);
    const curveball = mode === 'surprise' && Math.random() < 0.28;
    const skipped = C.skips.slice(-4).map((id) => L.byId.get(id)).filter(Boolean);
    const scored = [];
    for (const t of L.tracks) {
      if (t.id === cur.id || exclude.has(t.id) || queued.has(t.id)) continue;
      const f = feel(t), j = jump(cur, t), s0 = sim(cur, t), sameArtist = A.artistKey(t.artist) === A.artistKey(cur.artist);
      let s = 0;
      if (f.known) s += 0.3 * (1 - Math.min(1, Math.abs(f.e - target) / 0.25));
      if (mode === 'familiar') { s += s0 + (t.liked ? 0.18 : 0) + Math.min(0.15, (t.plays || 0) * 0.015); }
      else if (mode === 'surprise' && !curveball) { s += s0 * 0.9 + (t.liked ? 0.1 : 0) + Math.min(0.1, (t.plays || 0) * 0.01); }
      else if (curveball) { s += 0.7 * (1 - Math.min(1, j)) + (t.genre && cur.genre && nrm(t.genre) !== nrm(cur.genre) ? 0.35 : -0.2) - (sameArtist ? 0.5 : 0); }
      else { // somewhere new: rarely played, forgotten, different corners, but never a jarring jump
        const plays = t.plays || 0; s += 0.6 * (1 - Math.min(1, j)) + (plays === 0 ? 0.45 : plays < 3 ? 0.25 : 0) + (Date.now() - (t.last || 0) > 120 * 864e5 ? 0.15 : 0) - (sameArtist ? 0.35 : 0) + (t.genre && cur.genre && nrm(t.genre) !== nrm(cur.genre) ? 0.12 : 0);
      }
      if (recent.has(t.id)) s -= 0.7;
      if (j > 0.85) s -= 0.4;
      for (const k of skipped) if (sim(k, t) > 0.9) s -= 0.25; // you skipped something like this a moment ago
      scored.push([s + Math.random() * 0.12, t, { s0, j, curveball }]);
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b[0] - a[0]);
    const r = Math.random(), [, t, info] = scored[Math.min(scored.length - 1, r < 0.6 ? 0 : r < 0.88 ? 1 : 2)];
    return { t, why: F.why(cur, t, mode, info) };
  };
  F.why = (cur, t, mode, info = {}) => {
    const fa = feel(cur), fb = feel(t), d = fb.e - fa.e;
    if (info.curveball) return `A curveball with the same feel as “${cur.title}”`;
    if (mode === 'new' && !(t.plays > 0)) return 'You’ve never played this one';
    if (mode === 'new' && Date.now() - (t.last || 0) > 120 * 864e5) return 'One you haven’t heard in a while';
    if (A.artistKey(t.artist) === A.artistKey(cur.artist)) return `More from ${t.artist}`;
    if (fa.known && fb.known && d > 0.08) return 'Lifting the energy a little';
    if (fa.known && fb.known && d < -0.08) return 'Easing things down a little';
    if (t.genre && cur.genre && nrm(t.genre) === nrm(cur.genre)) return `More ${t.genre}, same mood`;
    return `Feels like “${cur.title}”`;
  };

  // keep one song lined up after the current one, so crossfades and beat-mixing can see it coming
  F.refreshTail = () => {
    if (!P.autoplay || !P.current || P.context.type === 'dj' || P.repeat !== 'off' || P.userQueue.length) return;
    // drop songs we added earlier that haven't played yet (the mode may have changed)
    while (P.order.length > P.pos + 1 && C.auto.has(P.order[P.order.length - 1])) { const id = P.order.pop(); C.auto.delete(id); F.reasons.delete(id); }
    if (P.order.length > P.pos + 1) return;
    const pick = F.pickNext(P.current); if (!pick) return;
    if (!['radio', 'cont'].includes(P.context.type)) P.context = { type: 'cont', id: P.current.id, name: 'Keep listening · ' + A.CONT_MODES[F.contMode()].name };
    else P.context.name = 'Keep listening · ' + A.CONT_MODES[F.contMode()].name;
    P.order.push(pick.t.id); C.auto.add(pick.t.id); F.reasons.set(pick.t.id, pick.why); P.emit('queue');
  };
  let lastStart = { id: null, at: 0 };
  P.addEventListener('track', (e) => {
    const t = e.detail && e.detail.track; if (!t) return;
    // a song we picked that was skipped within 30 seconds teaches the next picks to steer away
    if (lastStart.id && C.auto.has(lastStart.id) && lastStart.id !== t.id && performance.now() - lastStart.at < 30000) C.skips.push(lastStart.id);
    if (C.skips.length > 12) C.skips.shift();
    lastStart = { id: t.id, at: performance.now() };
    setTimeout(F.refreshTail, 400);
  });
  P.addEventListener('queue', A.debounce(() => { if (P.order.length <= P.pos + 1) F.refreshTail(); }, 300));

  // ---------- Just press play ----------
  // A seed song for right now: fits the time of day, leans on what you love, sometimes digs up a forgotten favourite.
  F.dayMood = () => { const h = new Date().getHours(); return h < 6 ? 'calm' : h < 9 ? 'warm' : h < 12 ? 'upbeat' : h < 14 ? 'focused' : h < 17 ? 'upbeat' : h < 20 ? 'energetic' : h < 23 ? 'dreamy' : 'calm'; };
  F.seed = () => {
    const m = A.moodById(F.dayMood()), recent = new Set(P.hist.slice(-40).map((h) => h[0]));
    const sc = L.tracks.filter((t) => !recent.has(t.id)).map((t) => [F.moodScore(t, m) + (t.liked ? 0.2 : 0) + Math.min(0.2, (t.plays || 0) * 0.02) + Math.random() * 0.25, t]).sort((a, b) => b[0] - a[0]);
    return (sc[0] || [0, A.pick(L.tracks)])[1];
  };
  F.justPlay = () => {
    const t = F.seed(); if (!t) return;
    P.playContext([t.id], t.id, { type: 'cont', id: t.id, name: 'Keep listening · ' + A.CONT_MODES[F.contMode()].name });
    if (!P.autoplay) { P.autoplay = true; A.store.set('autoplay', true); }
    if (A.store.get('immersive', true) && A.openNp) A.openNp(true);
  };
  // A handful of songs for today, different every day: forgotten favourites, songs you never play, and ones that suit the hour.
  F.todays = (n = 8) => {
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5), rnd = mulberry(day * 7919), m = A.moodById(F.dayMood());
    const now = Date.now(), pickBy = (list, k) => { const out = []; const l = list.slice(); while (out.length < k && l.length) out.push(l.splice(Math.floor(rnd() * Math.min(l.length, 8)), 1)[0]); return out; };
    const forgotten = L.tracks.filter((t) => (t.liked || t.plays >= 3) && now - (t.last || 0) > 45 * 864e5).sort((a, b) => (b.plays || 0) - (a.plays || 0));
    const unplayed = L.tracks.filter((t) => !t.plays).sort(() => rnd() - 0.5);
    const hour = L.tracks.map((t) => [F.moodScore(t, m), t]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const out = [], seen = new Set(), add = (arr, why) => arr.forEach((t) => { if (t && !seen.has(t.id) && out.length < n) { seen.add(t.id); out.push({ t, why }); } });
    add(pickBy(forgotten, 3), 'Forgotten favourite'); add(pickBy(unplayed, 2), 'Never played'); add(pickBy(hour, n), `${m.name} for right now`);
    return out;
  };

  // ---------- Flow Architect page ----------
  const esc = A.esc, icon = A.icon, $ = A.$, $$ = A.$$;
  F.PRESETS = [
    ['Sunrise', ['calm', 'warm', 'upbeat']], ['Night out', ['warm', 'energetic', 'euphoric', 'dreamy']], ['Rewind', ['calm', 'nostalgic', 'energetic', 'euphoric']],
    ['Unwind', ['energetic', 'warm', 'calm']], ['Deep focus', ['focused', 'focused']], ['Feel it', ['melancholy', 'dreamy', 'warm']]
  ];
  const sel = F.sel = A.store.get('flowSel', null) || { stops: ['calm', 'nostalgic', 'energetic', 'euphoric'], minutes: 45 };
  const saveSel = () => A.store.set('flowSel', sel);
  F.draft = () => { const d = A.store.get('flowDraft', null); if (d) d.ids = d.ids.filter((i) => L.byId.has(i)); return d && d.ids.length ? d : null; };
  const saveDraft = (d) => A.store.set('flowDraft', d);
  const moodChip = (m) => `background:linear-gradient(135deg,${m.c[0]},${m.c[1]})`;
  F.page = (el) => {
    if (!L.tracks.length) { el.innerHTML = `<div class="page"><h1>Flow Architect</h1><div class="empty">${icon('music')}<div>Add some music first, then build a journey through it.</div></div></div>`; return; }
    const d = F.draft(), left = A.analysis && A.analysis.pendingList ? L.tracks.filter((t) => !t.an && !t.anFail).length : 0;
    const stops = sel.stops.map((id, i) => { const m = A.moodById(id) || A.MOODS[0]; return `${i ? `<span class="fl-arrow">${icon('right')}</span>` : ''}<span class="fl-stop" style="${moodChip(m)}"><select data-si="${i}" aria-label="Mood ${i + 1}">${A.MOODS.map((o) => `<option value="${o.id}"${o.id === m.id ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>${sel.stops.length > 1 ? `<button data-a="flow-stop-del" data-i="${i}" aria-label="Remove">${icon('x')}</button>` : ''}</span>`; }).join('');
    let list = '';
    if (d) {
      const ts = d.ids.map((i) => L.byId.get(i)), total = ts.reduce((a, t) => a + t.duration, 0);
      list = `<div class="sec"><h2>${esc(F.title(d.stops))}</h2><span class="muted" style="font-size:13px">${ts.length} songs · ${A.fmtLong(total)}</span></div>
        <div class="actions"><button class="btn accent" data-a="flow-play">${icon('play')} Play journey</button><button class="btn ghost" data-a="flow-save">${icon('plus')} Save as playlist</button><button class="btn ghost" data-a="flow-build">${icon('shuffle')} Try another</button></div>
        <div class="panel flow-curve">${F.curveSVG(d)}<div class="flow-legend"><span><i class="dash"></i>Planned energy</span><span><i class="dot"></i>Your songs</span></div></div>
        <div class="fl-list" id="fl-list">${ts.map((t, i) => { const m = F.moodOf(t), j = i ? F.jumpLabel(ts[i - 1], t) : '', f = feel(t);
          return `${j ? `<div class="fl-jump${/Big/.test(j) ? ' big' : ''}">${icon('zap')} ${esc(j)}</div>` : ''}<div class="fl-row" data-i="${i}" data-tid="${t.id}"><span class="fl-handle" title="Drag to move">${icon('list')}</span><span class="fl-n">${i + 1}</span>${U().cover(t)}<div class="m"><b class="ellip">${esc(t.title)}</b><small class="ellip">${esc(t.artist)}</small></div>
            <span class="fl-mood" style="${moodChip(m)}">${esc(m.name)}</span><span class="fl-num">${f.known ? `${Math.round(f.bpm) || '–'} bpm · ${Math.round(f.e * 100)}%` : 'Not analysed yet'}</span>
            <button class="icon-btn sm" data-a="flow-swap" data-i="${i}" title="Swap for another song that fits">${icon('shuffle')}</button><button class="icon-btn sm" data-a="flow-del" data-i="${i}" title="Remove">${icon('x')}</button></div>`; }).join('')}</div>`;
    }
    el.innerHTML = `<div class="page flow-page"><div class="flow-hero"><div><div class="faint" style="font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:12px">Flow Architect</div><h1>Build a journey, not just a playlist</h1><p class="muted">Choose where the music starts and where it should take you. Aurora orders your own songs so the feeling moves step by step, without sudden jumps in tempo or intensity.</p></div></div>
      <div class="panel flow-build"><div class="fb-row"><b>Journey</b><div class="fl-stops">${stops}${sel.stops.length < 5 ? `<button class="chip" data-a="flow-stop-add">${icon('plus')} Add a mood</button>` : ''}</div></div>
        <div class="fb-row"><b>Ideas</b><div class="actions">${F.PRESETS.map(([n, st], i) => `<button class="chip" data-a="flow-preset" data-i="${i}" title="${esc(F.title(st))}">${esc(n)}</button>`).join('')}</div></div>
        <div class="fb-row"><b>Length</b><div class="seg">${F.LENGTHS.map(([m, l]) => `<button class="${sel.minutes === m ? 'on' : ''}" data-a="flow-len" data-id="${m}">${l}</button>`).join('')}</div></div>
        <div class="fb-row"><span></span><button class="btn accent lg" data-a="flow-build">${icon('spark')} ${d ? 'Build a new journey' : 'Build my journey'}</button></div>
        ${left ? `<p class="faint" style="margin:6px 0 0;font-size:13px">${icon('wave')} Aurora is still listening to ${left} of your songs to learn their energy and tempo. Journeys get smoother as it finishes.</p>` : ''}</div>
      ${list}</div>`;
    $$('select[data-si]', el).forEach((s) => s.addEventListener('change', () => { sel.stops[+s.dataset.si] = s.value; saveSel(); A.render(true); }));
    bindDrag($('#fl-list', el));
  };
  const U = () => A.ui;
  // drag a song to a new place (mouse or finger)
  function bindDrag(list) {
    if (!list) return;
    list.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('.fl-handle'); if (!h) return; e.preventDefault();
      const row = h.closest('.fl-row'); row.classList.add('dragging');
      const move = (ev) => {
        const rows = $$('.fl-row:not(.dragging)', list); let before = null;
        for (const r of rows) { const b = r.getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { before = r; break; } }
        if (before) list.insertBefore(row, before.previousElementSibling && before.previousElementSibling.classList.contains('fl-jump') ? before.previousElementSibling : before); else list.appendChild(row);
      };
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); row.classList.remove('dragging');
        const d = F.draft(); if (!d) return; d.ids = $$('.fl-row', list).map((r) => r.dataset.tid); saveDraft(d); A.render(true);
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
  }
  Object.assign(A.actions, {
    'flow-stop-add': () => { const last = sel.stops[sel.stops.length - 1], i = A.MOODS.findIndex((m) => m.id === last); sel.stops.push(A.MOODS[Math.min(A.MOODS.length - 1, i + 2)].id); saveSel(); A.render(true); },
    'flow-stop-del': (el) => { sel.stops.splice(+el.dataset.i, 1); saveSel(); A.render(true); },
    'flow-preset': (el) => { sel.stops = F.PRESETS[+el.dataset.i][1].slice(); saveSel(); A.render(true); },
    'flow-len': (el) => { sel.minutes = +el.dataset.id; saveSel(); A.render(true); },
    'flow-build': () => { const d = F.build({ stops: sel.stops.slice(), minutes: sel.minutes }); if (!d.ids.length) { A.toast('Not enough songs for that journey yet'); return; } saveDraft(d); A.render(true); const c = $('.flow-page .sec'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    'flow-swap': (el) => { const d = F.draft(); if (!d) return; F.swap(d, +el.dataset.i); saveDraft(d); A.render(true); },
    'flow-del': (el) => { const d = F.draft(); if (!d) return; d.ids.splice(+el.dataset.i, 1); saveDraft(d); A.render(true); },
    'flow-play': () => { const d = F.draft(); if (!d) return; P.playContext(d.ids, d.ids[0], { type: 'flow', id: 'flow', name: 'Journey · ' + F.title(d.stops) }); A.immersive && A.immersive.autoOpen(); },
    'flow-save': () => { const d = F.draft(); if (!d) return; const p = L.newPlaylist(F.title(d.stops), d.ids); A.toast(`Saved “${p.name}”`); },
    'cont-mode': (el) => { const m = el.dataset.id; if (m === 'off') { P.autoplay = false; A.store.set('autoplay', false); } else F.setContMode(m); A.render(true); A.renderSide && A.renderSide(); },
    'just-play': () => F.justPlay(),
    'pick-play': (el) => { const t = L.byId.get(el.dataset.id); if (!t) return; P.playContext([t.id], t.id, { type: 'cont', id: t.id, name: 'Keep listening · ' + A.CONT_MODES[F.contMode()].name }); if (!P.autoplay) { P.autoplay = true; A.store.set('autoplay', true); } A.immersive && A.immersive.autoOpen(); }
  });
  F.modeChips = (cls = 'seg') => `<div class="${cls}">${Object.entries(A.CONT_MODES).map(([k, m]) => `<button class="${P.autoplay && F.contMode() === k ? 'on' : ''}" data-a="cont-mode" data-id="${k}" title="${esc(m.tag)}">${esc(m.name)}</button>`).join('')}</div>`;
  // Home: "Just press play" and today's handful of songs
  F.homeHTML = () => {
    const m = A.moodById(F.dayMood()), picks = F.todays(8);
    return `<div class="jpp" style="--m1:${m.c[0]};--m2:${m.c[1]}"><button class="jpp-play" data-a="just-play" aria-label="Just press play">${icon('play')}</button><div class="jpp-txt"><h2>Just press play</h2><p>${esc(m.name)} music for right now, then Aurora keeps it going with songs that fit.</p>${F.modeChips('seg sm')}</div></div>
      ${picks.length ? `<div class="sec"><h2>Today’s picks</h2><span class="faint" style="font-size:13px">A different handful from your collection every day</span></div><div class="shelf">${picks.map(({ t, why }) => `<button class="card pick" data-a="pick-play" data-id="${t.id}"><div class="cover-wrap">${A.ui.cover(t)}<span class="go">${icon('play')}</span></div><b class="ellip">${esc(t.title)}</b><small>${esc(why)}</small></button>`).join('')}</div>` : ''}`;
  };
  if (A.routes) { A.routes.flow = F.page; A.routes.lines = (el) => A.lyr.page(el); }
})(window.A);
