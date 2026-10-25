/* Aurora - AI Audition: sing along to a few songs, and Aurora works out your vocal range and the character of your
   voice, then finds the songs in your own library that sit well for you (and the key to try the others in).
   Everything happens on this device: recordings are analysed in memory and never stored or sent anywhere; only the
   resulting numbers (your range and a few traits) are saved.
   Honest by design: it measures range and comfort zone from what you sang and compares them with an ESTIMATE of each
   song's melody range (A.mixAnalysis, mel). It never claims you "sound like" a famous singer or gives fake scores. */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine, esc = A.esc, icon = A.icon, $ = A.$;
  const AU = A.audition = { state: 'home', picks: [], takes: [], cur: 0, profile: A.store.get('auditionProfile', null) };
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (m) => { const r = Math.round(m); return NOTE[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); };
  const mel = (t) => t && t.an && t.an.mix && t.an.mix.v === A.MIX_VERSION && t.an.mix.mel;
  AU.ready = () => L.tracks.filter((t) => mel(t));
  AU.supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && !(window.AuroraAndroid && (+((window.AuroraAndroid.appBuild && window.AuroraAndroid.appBuild()) || 0) < 21));
  const TAKE_MAX = 45;

  // ---------- choosing songs ----------
  // Auto: three songs you probably know (liked / played), spread from low to high so the takes cover your range,
  // preferring songs that have lyrics.
  AU.autoPick = async () => {
    const pool = AU.ready(); if (pool.length < 3) return [];
    const known = pool.filter((t) => t.liked || t.plays > 0), base = known.length >= 6 ? known : pool;
    const withLyr = []; for (const t of A.shuffle(base.slice()).slice(0, 40)) { const l = await L.lyricsFor(t); if (l && l.lines && l.lines.length) withLyr.push(t); if (withLyr.length >= 12) break; }
    const src = (withLyr.length >= 3 ? withLyr : A.shuffle(base.slice()).slice(0, 12)).sort((a, b) => mel(a).p50 - mel(b).p50);
    const pickAt = (f) => src[Math.min(src.length - 1, Math.round(f * (src.length - 1)))];
    return [...new Set([pickAt(0.15), pickAt(0.5), pickAt(0.85)])].filter(Boolean);
  };

  // ---------- recording ----------
  async function openMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume();
    const src = ctx.createMediaStreamSource(stream), proc = ctx.createScriptProcessor(4096, 1, 1), sink = ctx.createGain(); sink.gain.value = 0;
    const chunks = []; let live = null;
    proc.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); live = d; };
    src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
    return {
      sr: ctx.sampleRate, chunks, get live() { return live; },
      take() { const n = chunks.reduce((s, c) => s + c.length, 0), out = new Float32Array(n); let o = 0; chunks.forEach((c) => { out.set(c, o); o += c.length; }); chunks.length = 0; return out; },
      close() { try { proc.disconnect(); src.disconnect(); } catch { /* */ } stream.getTracks().forEach((t) => t.stop()); ctx.close(); }
    };
  }

  // ---------- pitch (YIN) ----------
  function down(x, sr, to = 11025) { const r = sr / to, n = Math.floor(x.length / r), y = new Float32Array(n); for (let i = 0; i < n; i++) { const a = Math.floor(i * r), b = Math.max(a + 1, Math.floor((i + 1) * r)); let s = 0; for (let j = a; j < b; j++) s += x[j]; y[i] = s / (b - a); } return y; }
  function yin(x, sr, i0, W) {
    const tmin = Math.floor(sr / 1100), tmax = Math.floor(sr / 70); const d = new Float32Array(tmax + 1);
    for (let tau = 1; tau <= tmax; tau++) { let s = 0; for (let i = 0; i < W; i++) { const v = x[i0 + i] - x[i0 + i + tau]; s += v * v; } d[tau] = s; }
    let run = 0, best = -1; const c = new Float32Array(tmax + 1); c[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) { run += d[tau]; c[tau] = run ? (d[tau] * tau) / run : 1; }
    for (let tau = tmin; tau <= tmax; tau++) if (c[tau] < 0.15) { while (tau + 1 <= tmax && c[tau + 1] < c[tau]) tau++; best = tau; break; }
    if (best < 0) { let m = 1; for (let tau = tmin; tau <= tmax; tau++) if (c[tau] < m) { m = c[tau]; best = tau; } if (m > 0.35) return null; }
    const a = c[best - 1] || c[best], b = c[best], cc = c[best + 1] || c[best], den = a - 2 * b + cc, sh = den ? (0.5 * (a - cc)) / den : 0;
    return { f0: sr / (best + A.clamp(sh, -1, 1)), ap: b };
  }
  // A take -> frames of { m (MIDI note), rms, ap (aperiodicity: breathiness), hf (brightness) }
  AU.analyzeTake = function (raw, srIn) {
    const sr = 11025, x = down(raw, srIn, sr), W = 512, H = 128, fr = [];
    let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
    const tmax = Math.floor(sr / 70); const rmsAll = [];
    for (let i = 0; i + W + tmax < x.length; i += H) { let e = 0, dd = 0; for (let k = 0; k < W; k++) { const v = x[i + k]; e += v * v; if (k) { const q = v - x[i + k - 1]; dd += q * q; } } rmsAll.push([i, Math.sqrt(e / W), Math.sqrt(dd / W)]); }
    const sorted = rmsAll.map((r) => r[1]).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.2)] || 0, gate = Math.max(Math.min(floor * 2.5, peak * 0.12), peak * 0.03, 0.002); // above the room noise, but never so high that steady singing is cut
    for (const [i, rms, hfr] of rmsAll) { if (rms < gate) continue; const r = yin(x, sr, i, W); if (!r) continue; fr.push({ m: 69 + 12 * Math.log2(r.f0 / 440), rms, ap: r.ap, hf: hfr / (rms || 1) }); }
    // drop octave jumps that last a single frame
    for (let k = 1; k + 1 < fr.length; k++) { const a = fr[k - 1].m, b = fr[k].m, c = fr[k + 1].m; if (Math.abs(b - a) > 9 && Math.abs(b - c) > 9 && Math.abs(a - c) < 3) fr[k].bad = true; }
    return fr.filter((f) => !f.bad && f.m > 33 && f.m < 90);
  };
  const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * q)))];
  AU.profileFrom = function (takes) {
    const fr = takes.flatMap((t) => t.frames); if (fr.length < 60) return null;
    const ms = fr.map((f) => f.m).sort((a, b) => a - b);
    // steadiness: how far each note wanders from its neighbours (cents), ignoring real note changes
    let jit = 0, jn = 0; for (let k = 2; k < fr.length; k++) { const d = Math.abs(fr[k].m - (fr[k - 1].m + fr[k - 2].m) / 2); if (d < 1) { jit += d; jn++; } }
    const ap = fr.map((f) => f.ap).sort((a, b) => a - b), hf = fr.map((f) => f.hf).sort((a, b) => a - b), rms = fr.map((f) => f.rms).sort((a, b) => a - b);
    const p = { lo: +pct(ms, 0.05).toFixed(1), hi: +pct(ms, 0.95).toFixed(1), c1: +pct(ms, 0.25).toFixed(1), c2: +pct(ms, 0.75).toFixed(1), mid: +pct(ms, 0.5).toFixed(1),
      steady: +A.clamp(1 - (jn ? (jit / jn) * 100 : 30) / 30, 0, 1).toFixed(2), breathy: +A.clamp((pct(ap, 0.5) - 0.03) / 0.17, 0, 1).toFixed(2),
      bright: +A.clamp((pct(hf, 0.5) - 0.15) / 0.6, 0, 1).toFixed(2), power: +A.clamp((pct(rms, 0.9) / (pct(rms, 0.3) || 1) - 1.5) / 4, 0, 1).toFixed(2), frames: fr.length, at: Date.now() };
    // how each song was sung compared with its melody (most people drop or raise a whole octave without noticing)
    p.songs = takes.map((t) => { const sm = mel(L.byId.get(t.id)), med = pct(t.frames.map((f) => f.m).sort((a, b) => a - b), 0.5); return { id: t.id, n: t.frames.length, med: med ? +med.toFixed(1) : null, oct: sm && med ? Math.round((med - sm.p50) / 12) : 0 }; });
    return p;
  };
  AU.voiceType = (p) => { const m = (p.c1 + p.c2) / 2; return m < 49 ? 'bass' : m < 53 ? 'baritone' : m < 57 ? 'tenor or low alto' : m < 61 ? 'alto or high tenor' : m < 65 ? 'mezzo-soprano' : 'soprano'; };
  AU.traits = (p) => [
    p.steady > 0.62 ? ['Steady', 'You hold notes evenly'] : ['Expressive', 'Your pitch moves and bends a lot, like a lot of soulful singers'],
    p.bright > 0.5 ? ['Bright', 'A clear, ringing tone'] : ['Warm', 'A rounder, darker tone'],
    p.breathy > 0.5 ? ['Airy', 'A soft, breathy quality'] : ['Clear', 'A focused, clean sound'],
    p.power > 0.5 ? ['Dynamic', 'You push from soft to loud'] : ['Even', 'You keep a gentle, even level']
  ];

  // ---------- matching songs to the voice ----------
  // For every song with a melody estimate: how much of its melody falls in your comfort zone (full credit) or your
  // range (some credit), sung as written, an octave down/up, or transposed a few semitones.
  function fitAt(h, shift, p) {
    let tot = 0, s = 0;
    h.forEach((v, i) => { if (!v) return; const n = 45 + i + shift; tot += v; let w; if (n >= p.c1 - 0.5 && n <= p.c2 + 0.5) w = 1; else if (n >= p.lo && n <= p.hi) w = 0.72; else { const d = n < p.lo ? p.lo - n : n - p.hi; w = Math.max(0, 0.5 - d * 0.18); } s += v * w; });
    return tot ? s / tot : 0;
  }
  AU.match = function (p) {
    if (!p) return [];
    const feel = (t) => { if (!t.an) return 0; const soft = (1 - p.power) * 0.5 + p.breathy * 0.5; return 0.06 * (1 - Math.abs(soft - (1 - (t.an.energy || 0.5)))); };
    return AU.ready().map((t) => {
      const h = mel(t).hist; let nat = 0, natOct = 0, best = 0, bOct = 0, bT = 0;
      for (const oct of [-12, 0, 12]) {
        const f0 = fitAt(h, oct, p); if (f0 > nat + 0.02 || (Math.abs(f0 - nat) <= 0.02 && Math.abs(oct) < Math.abs(natOct))) { nat = f0; natOct = oct; }
        for (let tt = -5; tt <= 5; tt++) { const f = fitAt(h, oct + tt, p) - 0.035 * Math.abs(tt); if (f > best) { best = f; bOct = oct; bT = tt; } }
      }
      const useKey = best > nat + 0.06 && bT !== 0, score = (useKey ? best : nat) + feel(t);
      return { t, score, fit: useKey ? best + 0.035 * Math.abs(bT) : nat, oct: useKey ? bOct : natOct, shift: useKey ? bT : 0 };
    }).sort((a, b) => b.score - a.score);
  };
  const fitWord = (f) => (f >= 0.82 ? 'Great fit' : f >= 0.66 ? 'Good fit' : f >= 0.5 ? 'Worth a try' : 'A stretch');
  const how = (r) => { const parts = []; if (r.oct < 0) parts.push('an octave lower'); if (r.oct > 0) parts.push('an octave higher'); if (r.shift) parts.push(`${Math.abs(r.shift)} semitone${Math.abs(r.shift) > 1 ? 's' : ''} ${r.shift < 0 ? 'lower' : 'higher'}`); return parts.length ? 'Sing it ' + parts.join(', ') : 'Fits you as it is'; };
  AU.artists = (list) => {
    const by = new Map(); list.forEach((r) => { const a = (A.splitArtists ? A.splitArtists(r.t.artist)[0] : r.t.artist) || ''; if (!a || /unknown/i.test(a)) return; if (!by.has(a)) by.set(a, []); by.get(a).push(r.score); });
    return [...by].filter(([, s]) => s.length >= 2).map(([a, s]) => { s.sort((x, y) => y - x); const top = s.slice(0, 3); return { a, s: top.reduce((x, y) => x + y, 0) / top.length, n: s.length }; }).sort((x, y) => y.s - x.s).slice(0, 6);
  };

  // ---------- the singing session ----------
  async function startSession(ids) {
    AU.picks = ids; AU.takes = []; AU.cur = 0;
    try { AU.mic = await openMic(); } catch (e) { A.toast(/denied|NotAllowed/i.test(String(e && (e.name || e.message))) ? 'Aurora needs the microphone to hear you sing. Allow it and try again.' : 'Couldn’t open the microphone'); return; }
    AU.state = 'sing'; A.render(true); runTake();
  }
  async function runTake() {
    const t = L.byId.get(AU.picks[AU.cur]); if (!t) return finish();
    AU.lyr = await L.lyricsFor(t); AU.count = 3; AU.phase = 'count'; AU.render();
    for (let i = 3; i > 0; i--) { AU.count = i; AU.render(); await A.sleep(800); if (AU.state !== 'sing') return; }
    const m = t.an && t.an.mix, start = m ? Math.max(0, m.bar0 + Math.max(0, m.ib) * 4 * (60 / m.bpm)) : Math.max(0, (t.duration || 120) * 0.25);
    AU.start = start; AU.end = Math.min((t.duration || start + TAKE_MAX) - 1, start + TAKE_MAX, m ? m.bar0 + m.he * 4 * (60 / m.bpm) + 2 : Infinity);
    P.playContext([t.id], t.id, { type: 'audition', id: 'audition', name: 'AI Audition' }, { noShuffle: true });
    await A.sleep(400); E.seek(start); E.setDuck(0.32, 0.2); // the song quietly underneath, so your voice leads
    AU.mic.take(); AU.phase = 'rec'; AU.t0 = performance.now(); AU.render();
    clearInterval(AU.iv); AU.iv = setInterval(tick, 80);
  }
  function tick() {
    if (AU.state !== 'sing' || AU.phase !== 'rec') { clearInterval(AU.iv); return; }
    if (E.time >= AU.end || !E.playing && performance.now() - AU.t0 > 3000) return endTake(false);
    let note = ''; const ch = AU.mic.chunks.slice(-4);
    if (ch.length >= 2) { const n = ch.reduce((x, c) => x + c.length, 0), buf = new Float32Array(n); let o = 0; ch.forEach((c) => { buf.set(c, o); o += c.length; }); const r = AU.analyzeTake(buf, AU.mic.sr); if (r.length > 2) { const ms = r.map((f) => f.m).sort((a, b) => a - b); note = noteName(ms[Math.floor(ms.length / 2)]); } }
    const nEl = $('#au-note'), bar = $('#au-prog'); if (nEl) { nEl.textContent = note || '·'; nEl.classList.toggle('on', !!note); } if (bar) bar.style.width = A.clamp(((E.time - AU.start) / (AU.end - AU.start)) * 100, 0, 100) + '%';
    const ly = $('#au-lyr'); if (ly && AU.lyr && AU.lyr.synced) {
      const tt = E.time - (A.lyr ? A.lyr.offset(L.byId.get(AU.picks[AU.cur])) : 0), ls = AU.lyr.lines; let i = -1; for (let k = 0; k < ls.length; k++) { if (ls[k].t <= tt + 0.2) i = k; else break; }
      if (i !== AU.li) { AU.li = i; ly.innerHTML = [ls[i], ls[i + 1]].map((x, k) => (x && x.s ? `<p class="${k ? 'nx' : 'cur'}">${esc(x.s)}</p>` : `<p class="${k ? 'nx' : 'cur'}">${k ? '' : '♪'}</p>`)).join(''); }
    }
  }
  function endTake(skip) {
    clearInterval(AU.iv); const raw = AU.mic ? AU.mic.take() : null; E.setDuck(1, 0.3); E.pause();
    if (!skip && raw && raw.length) { const frames = AU.analyzeTake(raw, AU.mic.sr); AU.takes.push({ id: AU.picks[AU.cur], frames }); }
    AU.cur++; if (AU.cur < AU.picks.length && AU.state === 'sing') runTake(); else finish();
  }
  function finish() {
    clearInterval(AU.iv); if (AU.mic) { AU.mic.close(); AU.mic = null; } E.setDuck(1, 0.3);
    const p = AU.profileFrom(AU.takes);
    if (!p) { AU.state = 'home'; A.render(true); A.toast('Aurora couldn’t hear enough singing. Try again a little closer to the mic (headphones help).', 5000); return; }
    AU.profile = p; A.store.set('auditionProfile', p); AU.state = 'result'; A.render(true);
  }
  AU.stop = () => { if (AU.state === 'sing') { AU.state = 'home'; clearInterval(AU.iv); if (AU.mic) { AU.mic.close(); AU.mic = null; } E.setDuck(1, 0.3); E.pause(); A.render(true); } };

  // ---------- pages ----------
  function keyboard(p, songs = []) { // a piano strip from C2 to C6 with your range and comfort zone
    const lo = 36, hi = 84, x = (m) => ((m - lo) / (hi - lo)) * 100;
    let keys = ''; for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) keys += `<i style="left:${x(m)}%"></i>`;
    const marks = [48, 60, 72].map((m) => `<span class="kb-l" style="left:${x(m)}%">${noteName(m)}</span>`).join('');
    const songBars = songs.map((s) => `<b class="kb-song" style="left:${x(s.a)}%;width:${Math.max(1, x(s.b) - x(s.a))}%" title="${esc(s.label)}"></b>`).join('');
    return `<div class="kb"><div class="kb-keys">${keys}</div><span class="kb-range" style="left:${x(p.lo)}%;width:${x(p.hi) - x(p.lo)}%"></span><span class="kb-comf" style="left:${x(p.c1)}%;width:${Math.max(1, x(p.c2) - x(p.c1))}%"></span>${songBars}${marks}</div>`;
  }
  AU.page = (el) => {
    if (AU.state === 'sing') return AU.singPage(el);
    if (AU.state === 'pick') return AU.pickPage(el);
    const p = AU.profile, ready = AU.ready().length, total = L.tracks.length, left = A.analysis ? A.analysis.pendingList().length : 0;
    const hero = `<div class="au-hero"><div class="au-orb">${icon('mic')}</div><div style="flex:1;min-width:240px"><div class="faint au-kicker">AI Audition</div><h1>Which songs were made for your voice?</h1><p>Sing along to a few songs. Aurora listens to your range and the character of your voice, then finds the songs in your library that sit best for you, and the key to sing the rest in.</p>
      ${AU.supported() ? `<div class="au-modes"><button class="au-mode" data-a="au-auto"${ready < 3 ? ' disabled' : ''}><b>${icon('spark')} Auto</b><small>Aurora picks 3 songs you know, from low to high. Just sing.</small></button><button class="au-mode" data-a="au-manual"${ready < 1 ? ' disabled' : ''}><b>${icon('list')} Pick songs</b><small>Choose 1 to 5 songs you love to sing.</small></button></div>` : `<div class="banner"><span>${window.AuroraAndroid ? 'AI Audition needs the newest Android app (it adds microphone access). Download it from Settings, About.' : 'This browser can’t use the microphone.'}</span></div>`}
      ${ready < 3 ? `<p class="faint" style="font-size:13px">${total ? `Aurora is still listening to your library (${total - left}/${total} songs). AI Audition can use ${ready} so far.` : 'Add some music first.'}</p>` : `<p class="faint" style="font-size:13px">${icon('info')} Headphones work best. Your voice is analysed on this device and the recording is never saved.</p>`}</div></div>`;
    if (!p) { el.innerHTML = `<div class="page au-page">${hero}</div>`; return; }
    el.innerHTML = `<div class="page au-page">${AU.state === 'result' ? '' : hero}${AU.resultHTML(p)}</div>`;
  };
  AU.resultHTML = (p) => {
    const list = AU.match(p), top = list.slice(0, 18), artists = AU.artists(list), tr = AU.traits(p);
    const octNote = (p.songs || []).filter((s) => s.oct).map((s) => { const t = L.byId.get(s.id); return t ? `You sang “${esc(t.title)}” an octave ${s.oct < 0 ? 'below' : 'above'} the original, which is completely normal.` : ''; }).filter(Boolean)[0];
    const songsOnKb = top.slice(0, 3).map((r) => { const m = mel(r.t); return { a: m.p10 + r.oct + r.shift, b: m.p90 + r.oct + r.shift, label: r.t.title }; });
    return `<div class="sec"><h2>Your voice</h2><span class="faint" style="font-size:13px">From ${(p.songs || []).length} take${(p.songs || []).length === 1 ? '' : 's'} · ${new Date(p.at).toLocaleDateString()}</span></div>
      <div class="panel au-card"><div class="au-range"><div><small>Range you sang</small><b>${noteName(p.lo)} – ${noteName(p.hi)}</b></div><div><small>Comfort zone</small><b>${noteName(p.c1)} – ${noteName(p.c2)}</b></div><div><small>Sits like a</small><b>${esc(AU.voiceType(p))}</b></div></div>
        ${keyboard(p, songsOnKb)}<div class="au-legend"><span><i class="lg-r"></i>your range</span><span><i class="lg-c"></i>comfort zone</span><span><i class="lg-s"></i>melodies of your top songs</span></div>
        <div class="au-traits">${tr.map(([n, d]) => `<div><b>${n}</b><small>${d}</small></div>`).join('')}</div>${octNote ? `<p class="faint" style="font-size:13px;margin:10px 0 0">${octNote}</p>` : ''}
        <div class="actions" style="padding:12px 0 0"><button class="btn accent" data-a="au-save">${icon('plus')} Save “Songs for my voice”</button><button class="btn ghost" data-a="au-card">${icon('download')} Save as image</button><button class="btn ghost" data-a="au-again">${icon('mic')} Audition again</button></div></div>
      <div class="sec"><h2>Songs that suit your voice</h2><span class="faint" style="font-size:13px">From your library</span></div>
      <div class="au-list">${top.map((r, i) => `<div class="au-row"><span class="au-n">${i + 1}</span>${A.ui.cover(r.t)}<div class="au-t"><b class="ellip">${esc(r.t.title)}</b><small class="ellip">${esc(r.t.artist)} · ${how(r)}</small></div><span class="au-fit f${r.fit >= 0.82 ? 3 : r.fit >= 0.66 ? 2 : 1}">${fitWord(r.fit)}</span><button class="icon-btn" data-a="au-sing" data-id="${r.t.id}" data-shift="${r.shift}" title="Sing it">${icon('mic')}</button><button class="icon-btn" data-a="au-play" data-id="${r.t.id}" title="Play">${icon('play')}</button></div>`).join('')}</div>
      ${artists.length ? `<div class="sec"><h2>Artists whose songs sit in your range</h2></div><div class="actions">${artists.map((a) => `<span class="chip">${esc(a.a)} <small class="faint">${fitWord(a.s)}</small></span>`).join('')}</div>` : ''}
      <p class="faint au-honest">${icon('info')} This is an estimate from a few short takes, compared with each song’s melody as Aurora hears it in the mix. It’s about range and comfort, not talent: sing what you love.</p>`;
  };
  AU.pickPage = (el) => {
    const q = AU.q || '', all = AU.ready().filter((t) => !q || A.norm(t.title + ' ' + t.artist).includes(A.norm(q))).slice(0, 80), sel = AU.sel || (AU.sel = []);
    el.innerHTML = `<div class="page au-page"><div class="sec"><h2>Pick 1 to 5 songs to sing</h2><button class="btn ghost sm" data-a="au-home">Back</button></div>
      <input class="field" id="au-q" placeholder="Search songs Aurora has analysed…" value="${esc(q)}" style="width:100%">
      <div class="au-list" style="margin-top:10px">${all.map((t) => `<button class="au-row pickable${sel.includes(t.id) ? ' on' : ''}" data-a="au-toggle" data-id="${t.id}">${A.ui.cover(t)}<div class="au-t"><b class="ellip">${esc(t.title)}</b><small class="ellip">${esc(t.artist)}</small></div><span class="au-check">${sel.includes(t.id) ? icon('check') : ''}</span></button>`).join('') || '<p class="faint">No songs match.</p>'}</div>
      <div class="au-bar glass"><span>${sel.length} selected</span><button class="btn accent" data-a="au-go"${sel.length ? '' : ' disabled'}>${icon('mic')} Start singing</button></div></div>`;
    const inp = $('#au-q', el); inp.oninput = () => { AU.q = inp.value; clearTimeout(AU.qt); AU.qt = setTimeout(() => { A.render(true); const i = $('#au-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); };
  };
  AU.singPage = (el) => { el.innerHTML = '<div class="page au-page"><div id="au-sing"></div></div>'; AU.render(); };
  AU.render = () => {
    const host = $('#au-sing'); if (!host) return; const t = L.byId.get(AU.picks[AU.cur]); if (!t) return;
    const head = `<div class="au-sing-h">${A.ui.cover(t)}<div><small class="faint">Song ${AU.cur + 1} of ${AU.picks.length}</small><h2 class="ellip">${esc(t.title)}</h2><span class="faint">${esc(t.artist)}</span></div></div>`;
    if (AU.phase === 'count') { host.innerHTML = `${head}<div class="au-count">${AU.count}</div><p class="faint" style="text-align:center">Get ready to sing along${AU.lyr ? '' : ' (no lyrics saved for this one, so hum or sing what you remember)'}</p>`; return; }
    const ly = AU.lyr && AU.lyr.synced ? '<div id="au-lyr" class="au-lyr"><p class="cur">♪</p></div>' : AU.lyr ? `<div class="au-lyr plain">${AU.lyr.lines.slice(0, 40).map((x) => `<p>${esc(x.s)}</p>`).join('')}</div>` : '<div class="au-lyr"><p class="cur">Sing or hum along</p></div>';
    host.innerHTML = `${head}${ly}<div class="au-live"><span id="au-note" class="au-note">·</span><div class="au-prog"><i id="au-prog"></i></div></div>
      <div class="actions" style="justify-content:center"><button class="btn accent" data-a="au-next">${icon('check')} ${AU.cur + 1 < AU.picks.length ? 'Next song' : 'Done, show my results'}</button><button class="btn ghost" data-a="au-skip">Skip this song</button><button class="btn ghost" data-a="au-stop">Stop</button></div>`;
    AU.li = -2;
  };
  async function saveCard() {
    const p = AU.profile; if (!p) return; const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 1080, 1350); gr.addColorStop(0, '#2b1055'); gr.addColorStop(1, '#d53369'); g.fillStyle = gr; g.fillRect(0, 0, 1080, 1350);
    g.fillStyle = '#fff'; g.font = '700 44px system-ui, sans-serif'; g.fillText('My voice · AI Audition', 80, 140);
    g.font = '800 96px system-ui, sans-serif'; g.fillText(`${noteName(p.lo)} – ${noteName(p.hi)}`, 80, 290);
    g.font = '500 40px system-ui, sans-serif'; g.fillText(`Comfort zone ${noteName(p.c1)} – ${noteName(p.c2)} · sits like a ${AU.voiceType(p)}`, 80, 360);
    AU.traits(p).forEach(([n], i) => { g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(80 + i * 235, 420, 215, 90); g.fillStyle = '#fff'; g.font = '700 38px system-ui, sans-serif'; g.fillText(n, 100 + i * 235, 478); });
    g.font = '700 42px system-ui, sans-serif'; g.fillText('Songs made for my voice', 80, 620); g.font = '500 36px system-ui, sans-serif';
    AU.match(p).slice(0, 8).forEach((r, i) => g.fillText(`${i + 1}. ${r.t.title} · ${r.t.artist}`.slice(0, 52), 80, 690 + i * 64));
    g.globalAlpha = 0.75; g.font = '500 30px system-ui, sans-serif'; g.fillText('Aurora · kailashamarnath.me/Aurora', 80, 1270);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'my-voice-aurora.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  Object.assign(A.actions, {
    'au-auto': async () => { const ids = (await AU.autoPick()).map((t) => t.id); if (ids.length < 1) return A.toast('Aurora needs a few more analysed songs first'); startSession(ids); },
    'au-manual': () => { AU.state = 'pick'; AU.sel = []; A.render(true); },
    'au-home': () => { AU.state = AU.profile ? 'result' : 'home'; A.render(true); },
    'au-toggle': (el) => { const id = el.dataset.id, s = AU.sel || (AU.sel = []), i = s.indexOf(id); if (i > -1) s.splice(i, 1); else if (s.length < 5) s.push(id); else A.toast('Up to 5 songs'); A.render(true); },
    'au-go': () => { if (AU.sel && AU.sel.length) startSession(AU.sel.slice()); },
    'au-next': () => endTake(false), 'au-skip': () => endTake(true), 'au-stop': () => AU.stop(),
    'au-again': () => { AU.state = 'home'; AU.profile = AU.profile; A.render(true); window.scrollTo(0, 0); const c = document.querySelector('.au-modes'); if (c) c.scrollIntoView({ behavior: 'smooth' }); },
    'au-save': () => { const ids = AU.match(AU.profile).slice(0, 25).map((r) => r.t.id); const p = L.newPlaylist('Songs for my voice', ids); A.toast(`Saved “${p.name}”`); },
    'au-card': () => saveCard(),
    'au-play': (el) => { const t = L.byId.get(el.dataset.id); if (t) P.playContext([t.id], t.id, { type: 'audition', id: 'audition', name: 'Songs for my voice' }); },
    // sing it: play it with the lyrics up; "in your key" changes the speed too (a plain player can't shift pitch alone)
    'au-sing': (el) => { const t = L.byId.get(el.dataset.id); if (!t) return; P.playContext([t.id], t.id, { type: 'audition', id: 'audition', name: 'Sing it' }); const sh = +el.dataset.shift || 0; if (sh && Math.abs(sh) <= 3) { setTimeout(() => { E.decks.forEach((d) => { if (d.track && d.track.id === t.id) { d.el.preservesPitch = false; d.el.playbackRate = Math.pow(2, sh / 12); } }); A.toast(`Playing ${Math.abs(sh)} semitone${Math.abs(sh) > 1 ? 's' : ''} ${sh < 0 ? 'lower' : 'higher'} (a little ${sh < 0 ? 'slower' : 'faster'} too)`); }, 600); } A.openNp && A.openNp(); setTimeout(() => A.lyr && A.lyr.full && A.lyr.full(true), 700); }
  });
  // leaving the page mid-song stops the session cleanly
  window.addEventListener('hashchange', () => { if (AU.state === 'sing' && !/^#\/audition/.test(location.hash)) AU.stop(); });
  if (A.routes) A.routes.audition = AU.page;
})(window.A);
