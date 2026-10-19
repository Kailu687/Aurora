/* Aurora - AI DJ: vibe engine, set builder, spoken commentary, background audio analysis */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine;

  // ---------- vibes ----------
  A.VIBES = [
    { id: 'chill', name: 'Chill', tag: 'Easy, breezy, unwind', g: ['#5ee7df', '#4a6cf7'], e: [0.08, 0.42], bpm: [60, 105], genres: ['chill', 'lofi', 'lo-fi', 'ambient', 'acoustic', 'jazz', 'soul', 'bossa', 'downtempo', 'folk', 'trip-hop', 'new age', 'easy', 'singer'], words: ['chill', 'calm', 'soft', 'slow', 'sunday', 'rain'] },
    { id: 'hype', name: 'Hype', tag: 'Turn it all the way up', g: ['#ff512f', '#dd2476'], e: [0.68, 1], bpm: [118, 180], genres: ['edm', 'dance', 'hip hop', 'hip-hop', 'rap', 'trap', 'house', 'electronic', 'techno', 'drum', 'dubstep', 'bass', 'rave', 'metal', 'punk'], words: ['hype', 'turn up', 'bangers', 'remix', 'club'] },
    { id: 'focus', name: 'Focus', tag: 'Deep work, no distractions', g: ['#43cea2', '#185a9d'], e: [0.22, 0.55], bpm: [70, 125], genres: ['instrumental', 'classical', 'ambient', 'piano', 'lofi', 'lo-fi', 'electronic', 'soundtrack', 'score', 'post-rock', 'study', 'focus', 'new age'], words: ['focus', 'study', 'instrumental', 'piano'] },
    { id: 'latenight', name: 'Late Night', tag: 'Neon lights, empty streets', g: ['#7f00ff', '#e100ff'], e: [0.25, 0.62], bpm: [70, 118], genres: ['r&b', 'rnb', 'soul', 'synthwave', 'trip-hop', 'downtempo', 'neo soul', 'chillwave', 'night', 'dream', 'electronic', 'lo-fi', 'lofi'], words: ['night', 'midnight', 'dark', 'moon', 'neon', 'city'] },
    { id: 'workout', name: 'Workout', tag: 'Pace, power, repeat', g: ['#f12711', '#f5af19'], e: [0.72, 1], bpm: [125, 180], genres: ['edm', 'dance', 'hip hop', 'hip-hop', 'rap', 'rock', 'metal', 'house', 'techno', 'trap', 'electronic', 'pop', 'punk', 'workout'], words: ['run', 'gym', 'workout', 'power', 'beast'] },
    { id: 'party', name: 'Party', tag: 'Everyone on the floor', g: ['#fc466b', '#3f5efb'], e: [0.6, 0.95], bpm: [100, 140], genres: ['pop', 'dance', 'latin', 'hip hop', 'hip-hop', 'disco', 'funk', 'reggaeton', 'house', 'edm', 'r&b', 'top 40', 'afro', 'party'], words: ['party', 'dance', 'club', 'baila', 'tonight'] },
    { id: 'feelgood', name: 'Feel Good', tag: 'Sunshine in audio form', g: ['#f9d423', '#ff4e50'], e: [0.45, 0.82], bpm: [90, 140], genres: ['pop', 'funk', 'disco', 'reggae', 'soul', 'indie', 'ska', 'motown', 'oldies', 'happy', 'summer', 'country'], words: ['happy', 'sun', 'smile', 'good', 'love', 'summer', 'dance'] },
    { id: 'sad', name: 'In My Feelings', tag: 'Soft, slow, a little sad', g: ['#4b6cb7', '#182848'], e: [0.05, 0.4], bpm: [55, 100], genres: ['ballad', 'acoustic', 'indie', 'singer', 'folk', 'blues', 'sad', 'emo', 'piano', 'country', 'slowcore'], words: ['sad', 'cry', 'tears', 'alone', 'lonely', 'broken', 'goodbye', 'miss', 'heart', 'rain', 'blue'] },
    { id: 'romance', name: 'Romance', tag: 'Candlelight and slow dances', g: ['#ee0979', '#ff6a00'], e: [0.12, 0.55], bpm: [60, 112], genres: ['r&b', 'rnb', 'soul', 'jazz', 'ballad', 'love', 'bossa', 'latin', 'vocal', 'easy listening', 'romantic'], words: ['love', 'kiss', 'baby', 'heart', 'darling', 'forever', 'romance', 'you'] },
    { id: 'throwback', name: 'Throwback', tag: 'Golden-era classics', g: ['#f7971e', '#ffd200'], e: [0.25, 0.9], bpm: [70, 150], genres: ['oldies', 'classic', 'disco', 'retro', '80s', '90s', 'new wave', 'funk', 'soul', 'motown', 'classic rock', 'britpop', 'grunge'], words: [], years: [1960, 2008] },
    { id: 'roadtrip', name: 'Road Trip', tag: 'Windows down, volume up', g: ['#56ab2f', '#a8e063'], e: [0.45, 0.88], bpm: [90, 150], genres: ['rock', 'classic rock', 'country', 'alternative', 'indie', 'pop rock', 'americana', 'folk rock', 'southern', 'alternrock', 'blues'], words: ['road', 'drive', 'highway', 'freedom', 'ride', 'wild', 'home'] },
    { id: 'sleep', name: 'Wind Down', tag: 'Drift off gently', g: ['#2c3e50', '#4ca1af'], e: [0, 0.28], bpm: [40, 90], genres: ['ambient', 'new age', 'classical', 'piano', 'meditative', 'sleep', 'instrumental', 'space', 'lullaby', 'drone'], words: ['sleep', 'dream', 'lullaby', 'quiet', 'night', 'peace'] }
  ];
  A.vibeById = (id) => A.VIBES.find((v) => v.id === id);
  A.vibeOfDay = () => { const h = new Date().getHours(); return h < 6 ? 'sleep' : h < 10 ? 'feelgood' : h < 14 ? 'focus' : h < 18 ? 'roadtrip' : h < 22 ? 'party' : 'latenight'; };

  const nrm = A.norm;
  const rangeFit = (v, [a, b], soft) => (v >= a && v <= b ? 1 : 1 - A.clamp((v < a ? a - v : v - b) / soft, 0, 1));

  A.vibeScore = function (t, vibe, forceGenres) {
    const g = nrm(t.genre), blob = nrm(t.title + ' ' + t.album + ' ' + t.artist);
    let gs = 0;
    if (g) for (const k of vibe.genres) if (g.includes(k)) { gs = 1; break; }
    if (!gs) for (const w of vibe.words) if (w && blob.includes(w)) { gs = 0.45; break; }
    let era = 0.5;
    if (vibe.years) era = t.year ? (t.year >= vibe.years[0] && t.year <= vibe.years[1] ? 1 : 0.1) : 0.35;
    let s;
    if (t.an) {
      const e = rangeFit(t.an.energy, vibe.e, 0.35), b = t.an.tempo ? rangeFit(t.an.tempo, vibe.bpm, 40) : 0.5;
      s = 0.3 * gs + 0.45 * e + 0.12 * b + (vibe.years ? 0.13 * era : 0.13 * 0.5);
      if (!vibe.years) s += 0.0;
    } else s = 0.62 * gs + 0.2 * 0.4 + (vibe.years ? 0.18 * era : 0.1);
    if (forceGenres && forceGenres.size) { let m = false; for (const k of forceGenres) if (g.includes(k)) { m = true; break; } s = m ? s + 0.35 : s * 0.25; }
    return s;
  };

  // ---------- similarity (radio / more-like-this) ----------
  A.similar = function (t, n = 25) {
    const out = [];
    for (const o of L.tracks) {
      if (o.id === t.id) continue;
      let s = Math.random() * 0.08;
      if (o.artist === t.artist) s += 0.5;
      if (t.album && o.album === t.album) s += 0.25;
      if (t.genre && nrm(o.genre) === nrm(t.genre)) s += 0.4;
      if (t.year && o.year && Math.abs(o.year - t.year) <= 6) s += 0.12;
      if (t.an && o.an) { s += 0.35 * (1 - Math.min(1, Math.abs(t.an.energy - o.an.energy) / 0.4)); if (t.an.tempo && o.an.tempo) s += 0.15 * (1 - Math.min(1, Math.abs(t.an.tempo - o.an.tempo) / 40)); }
      out.push([s, o]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, n).map((x) => x[1]);
  };

  // ---------- background vibe analysis ----------
  const AN = A.analysis = { running: false, paused: false, done: 0, total: 0, enabled: A.store.get('analyze', true), listeners: new Set() };
  AN.pendingList = () => L.tracks.filter((t) => !t.an && !t.anFail);
  AN.emit = () => AN.listeners.forEach((f) => f());
  A.djEnabled = () => A.store.get('djEnabled', true) !== false;
  AN.start = async function () {
    if (AN.running || !AN.enabled || !A.djEnabled()) return; AN.running = true;
    try {
      let list = AN.pendingList(); AN.total = L.tracks.length; AN.done = AN.total - list.length; AN.emit();
      while (AN.enabled && A.djEnabled()) {
        if (L.enriching) { await A.sleep(2000); continue; } // let tag reading finish first
        list = AN.pendingList(); if (!list.length) break;
        // prioritise what the DJ might pick soon
        const t = list[Math.floor(Math.random() * Math.min(list.length, 6))];
        try {
          if (t.kind === 'handle' && (await t.handle.queryPermission({ mode: 'read' })) !== 'granted') { t.anFail = true; continue; }
          const src = await L.sourceFor(t); const r = await A.analyze(src);
          if (r) t.an = r; else t.anFail = true;
        } catch { t.anFail = true; }
        L.touch(t); AN.done = L.tracks.length - AN.pendingList().length; AN.emit();
        await A.sleep(P.current && E.playing ? 450 : 120);
      }
    } finally { AN.running = false; AN.emit(); }
  };
  AN.setEnabled = (on) => { AN.enabled = on; A.store.set('analyze', on); if (on) AN.start(); };
  AN.reset = () => { L.tracks.forEach((t) => { t.an = null; t.anFail = false; L.touch(t); }); AN.start(); };

  // ---------- speech ----------
  const sp = A.speech = {
    get ok() { return 'speechSynthesis' in window || !!window.AuroraAndroid; }, voices: [], speaking: false,
    load() {
      if (!('speechSynthesis' in window)) return; // Android app: voices come from the phone's own TTS instead
      const get = () => { sp.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); sp.listeners && sp.listeners.forEach((f) => f()); };
      get(); speechSynthesis.addEventListener('voiceschanged', get);
    },
    listeners: new Set(),
    best() {
      const saved = A.store.get('djVoice', '');
      let v = sp.voices.find((x) => x.name === saved);
      if (!v) v = sp.voices.find((x) => /natural|online|aria|jenny|guy|davis|sonia|ryan/i.test(x.name)) || sp.voices.find((x) => /google (us|uk)|samantha|daniel|zira|david|mark/i.test(x.name)) || sp.voices[0];
      return v;
    },
    speak(text, { rate = 1, pitch = 1 } = {}) {
      return new Promise((res) => {
        if (!sp.ok || A.store.get('djVoiceOn', true) === false) return res(false);
        const AA = window.AuroraAndroid;
        if (AA && AA.speak) { // Android app: the phone's own text-to-speech
          sp._native = res; sp.speaking = true;
          if (AA.speak(text, rate, pitch) !== 'ok') { sp._native = null; sp.speaking = false; return res(false); }
          setTimeout(() => { if (sp._native === res) { sp._native = null; sp.speaking = false; res(false); } }, 25000 + text.length * 120);
          return;
        }
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); const v = sp.best(); if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = rate; u.pitch = pitch; u.volume = 1;
        let fin = false; const done = (ok) => { if (fin) return; fin = true; sp.speaking = false; clearTimeout(guard); res(ok); };
        const guard = setTimeout(() => done(false), 25000 + text.length * 120);
        u.onstart = () => { sp.speaking = true; }; u.onend = () => done(true); u.onerror = () => done(false);
        sp._u = u; speechSynthesis.speak(u);
      });
    },
    cancel() { if (window.AuroraAndroid) { try { window.AuroraAndroid.stopSpeak(); } catch { /* */ } if (sp._native) { const r = sp._native; sp._native = null; r(false); } sp.speaking = false; dj._unduck(); return; } if (sp.ok && (sp.speaking || speechSynthesis.speaking || speechSynthesis.pending)) { speechSynthesis.cancel(); } sp.speaking = false; dj._unduck(); }
  };
  sp.load();

  // ---------- DJ script writing ----------
  A.DJ_STYLES = {
    smooth: { label: 'Smooth', dj: 'Nova', rate: 0.97, pitch: 1.0, start: ['Hey, it’s {dj}, and tonight we’re keeping it {vibe}. Let’s ease in with {title} by {artist}.', 'Welcome in. {dj} here. Your {vibe} set starts now, beginning with {artist} and {title}.', 'Okay, {vibe} mode is on. I’m {dj}, and I’ve got a good one to open: {title}, {artist}.'], trans: ['That was {prev}. Next up, {artist} with {title}.', 'Mmm, nice. Here’s {artist} — this is {title}.', 'Let’s keep it flowing with {title} from {artist}.', 'Smooth. Now, {artist}, {title}.', 'You’re listening to {dj}. This one’s {title} by {artist}.', 'Staying right in the groove — {artist}, {title}.'], up: ['Let’s lift the energy a little.', 'Picking things up.'], down: ['Easing it down a notch.', 'Let’s take a breath.'], ack: { up: 'You got it, bringing the energy up.', down: 'Sure, dialing it down.', more: 'Say less. More of this vibe coming.', change: 'Switching gears for you.' } },
    hype: { label: 'Hype', dj: 'Blaze', rate: 1.08, pitch: 1.05, start: ['Yo yo yo, it’s {dj} in the building! {vibe} vibes ONLY. First up, {title} by {artist}!', 'Let’s GOOO! {dj} on the decks, and we’re opening with {artist}, {title}!', 'Hey, hey! {vibe} set, locked in. Kicking it off with {title}!'], trans: ['That was {prev}! Now run it back with {artist}, {title}!', 'Oh, you KNOW this one — {title}, {artist}!', 'Keep it moving! {artist} with {title}!', 'Turn it up! {title} by {artist}!', 'Don’t touch that dial. {artist}, {title}, right now!', 'Next one’s a heater: {title}!'], up: ['Time to crank it!', 'Okay, we’re going up!'], down: ['Quick breather, we’ll be back!', 'Cooling it for a second.'], ack: { up: 'Louder! Say no more.', down: 'Alright, cooling it down.', more: 'More of this? Coming right up!', change: 'New direction! Let’s go!' } },
    zen: { label: 'Zen', dj: 'Echo', rate: 0.9, pitch: 0.95, start: ['Hi, I’m {dj}. Take a breath. We begin gently with {title} by {artist}.', 'Welcome. {vibe}. Nothing else matters for a while. Here is {title}, from {artist}.'], trans: ['{artist}, with {title}.', 'Let that settle. Next, {title} by {artist}.', 'And now, {title}. {artist}.', 'Floating on. {artist}, {title}.', 'Just breathe. This is {title}.'], up: ['A little more light now.'], down: ['Softer now.'], ack: { up: 'A little more life, then.', down: 'Softer. Slower.', more: 'More of this. Stay with it.', change: 'Let’s drift somewhere new.' } }
  };

  function timeWord() { const h = new Date().getHours(); return h < 5 ? 'in the middle of the night' : h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : h < 21 ? 'this evening' : 'tonight'; }
  function facts(t, prev, s) {
    const f = [];
    if (t.year) f.push(`That one’s from ${t.year}.`, `${t.year}, and it still hits.`);
    if (t.album) f.push(`Pulled from the album ${t.album}.`);
    if (t.genre) f.push(`A little ${t.genre} for you.`);
    if (t.plays >= 5) f.push(`You’ve played this ${t.plays} times, so I’m guessing it’s a favorite.`);
    if (t.plays === 0) f.push('A track you haven’t spun yet. Fresh ears.');
    if (t.liked) f.push('One of your liked songs.');
    if (t.an && t.an.tempo) f.push(`Sitting at about ${t.an.tempo} beats per minute.`);
    if (prev && prev.artist === t.artist) f.push(`More ${t.artist}, because why not.`);
    f.push(`Perfect ${timeWord()}.`);
    if (s.n > 0 && s.n % 5 === 0) f.push(`That’s ${s.n} tracks into the ${s.vibe.name} set.`);
    return A.pick(f);
  }
  function fill(str, c) { return str.replace(/\{(\w+)\}/g, (_, k) => c[k] || ''); }
  function writeLine(t, prev, s, moment) {
    const S = A.DJ_STYLES[s.style], c = { dj: S.dj, vibe: s.vibe.name, title: t.title, artist: t.artist, prev: prev ? prev.title : '' };
    let line = fill(A.pick(moment === 'start' ? S.start : S.trans), c);
    if (moment !== 'start' && prev && t.an && prev.an) {
      const d = t.an.energy - prev.an.energy;
      if (d > 0.22 && Math.random() < 0.7) line = A.pick(S.up) + ' ' + line; else if (d < -0.22 && Math.random() < 0.7) line = A.pick(S.down) + ' ' + line;
    }
    if (Math.random() < (s.style === 'zen' ? 0.35 : 0.6)) line += ' ' + facts(t, prev, s);
    return line;
  }
  async function llmLine(t, prev, s, moment) {
    const key = A.store.get('aiKey', ''); if (!key) return null;
    const S = A.DJ_STYLES[s.style];
    const prompt = `You are ${S.dj}, a charismatic radio DJ in the style "${S.label}". Current set vibe: ${s.vibe.name} (${s.vibe.tag}). ` +
      `${moment === 'start' ? 'You are opening the set.' : `The song that just ended: "${prev ? prev.title : ''}" by ${prev ? prev.artist : ''}.`} ` +
      `Now introducing: "${t.title}" by ${t.artist}${t.album ? ', album ' + t.album : ''}${t.year ? ', ' + t.year : ''}${t.genre ? ', genre ' + t.genre : ''}. ` +
      `Time of day: ${timeWord()}. Write ONE spoken intro of 20-40 words, natural, no emojis, no stage directions, no quotation marks. Mention the song and artist.`;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: A.store.get('aiModel', 'claude-haiku-5-5'), max_tokens: 160, messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) return null;
      const j = await r.json(); const txt = j.content && j.content[0] && j.content[0].text;
      return txt ? txt.replace(/\s+/g, ' ').trim() : null;
    } catch { return null; } finally { clearTimeout(to); }
  }

  // ---------- DJ session ----------
  const dj = A.dj = {
    s: null,
    listeners: new Set(),
    emit(n, d) { dj.listeners.forEach((f) => f(n, d)); },
    get active() { return !!dj.s && P.context.type === 'dj'; },

    start({ vibe, genres = [], style, voice, talk, request } = {}) {
      if (!A.djEnabled()) { A.toast('AI DJ is turned off in Settings'); return false; }
      vibe = typeof vibe === 'string' ? A.vibeById(vibe) : vibe;
      if (!vibe) vibe = A.vibeById(A.vibeOfDay());
      if (L.tracks.length < 3) { A.toast('Add some music first so the DJ has records to spin'); return false; }
      A.store.set('djLast', { vibe: vibe.id, genres, style });
      dj.s = { vibe, genres: new Set(genres.map(nrm)), style: style || A.store.get('djStyle', 'smooth'), talk: talk || A.store.get('djTalk', 'always'), bias: 0, played: new Set(), recentArtists: [], n: 0, started: Date.now(), focus: null, artistFocus: null, dead: false };
      A.store.set('djStyle', dj.s.style);
      const first = dj._pick(); if (!first) { A.toast('Couldn’t find tracks for that vibe'); return false; }
      dj._mark(first);
      P.playContext([first.id], first.id, { type: 'dj', id: vibe.id, name: `DJ ${A.DJ_STYLES[dj.s.style].dj} · ${vibe.name}` }, { noShuffle: true });
      dj.ensure(); dj.emit('start'); return true;
    },
    stop() { if (dj.s) { A.speech.cancel(); dj.s = null; dj.emit('stop'); } },

    _mark(t) { const s = dj.s; s.played.add(t.id); s.recentArtists.push(t.artist); if (s.recentArtists.length > 5) s.recentArtists.shift(); },
    _targetEnergy() { const s = dj.s, [a, b] = s.vibe.e; const mid = (a + b) / 2, wave = 0.09 * Math.sin((s.n / 9) * Math.PI * 2 - Math.PI / 2); return A.clamp(mid + s.bias * 0.3 + wave, 0, 1); },
    _pick(prev) {
      const s = dj.s; if (!s) return null;
      let pool = L.tracks.filter((t) => !s.played.has(t.id));
      if (pool.length < 4) { s.played.clear(); pool = L.tracks.slice(); }
      const target = dj._targetEnergy();
      const last = prev || P.current;
      const scored = pool.map((t) => {
        let sc = A.vibeScore(t, s.vibe, s.genres);
        if (t.an) sc += 0.28 * (1 - Math.min(1, Math.abs(t.an.energy - target) / 0.4));
        if (s.recentArtists.includes(t.artist)) sc -= 0.4;
        if (last && last.an && t.an) { sc += 0.12 * (1 - Math.min(1, Math.abs(last.an.energy - t.an.energy) / 0.35)); if (last.an.tempo && t.an.tempo) sc += 0.08 * (1 - Math.min(1, Math.abs(last.an.tempo - t.an.tempo) / 35)); }
        if (s.focus) sc += 0.5 * (s.focusSim.get(t.id) || 0);
        if (s.artistFocus && nrm(t.artist) === s.artistFocus) sc += 0.55;
        if (t.liked) sc += 0.06; if (t.plays) sc += Math.min(0.06, t.plays * 0.01);
        return [sc + Math.random() * 0.18, t];
      }).sort((a, b) => b[0] - a[0]);
      const top = scored.slice(0, Math.min(8, scored.length));
      // weighted pick among the best few
      const mn = top[top.length - 1][0]; const w = top.map((x) => (x[0] - mn + 0.05) ** 2); let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < top.length; i++) { r -= w[i]; if (r <= 0) return top[i][1]; }
      return top[0][1];
    },
    ensure(minAhead = 2) {
      const s = dj.s; if (!s || P.context.type !== 'dj') return;
      let guard = 0;
      while (P.upcoming.length + P.userQueue.length < minAhead && guard++ < 6) {
        const last = L.byId.get(P.order[P.order.length - 1]) || P.current; const t = dj._pick(last); if (!t) break;
        dj._mark(t); P.order.push(t.id);
      }
      P.emit('queue');
    },
    refill() { // drop planned songs and choose again (after a nudge)
      if (!dj.s || P.context.type !== 'dj') return;
      P.order.length = P.pos + 1; dj.ensure(3);
    },
    nudge(kind) {
      const s = dj.s; if (!s) return;
      if (kind === 'up') s.bias = Math.min(1, s.bias + 0.5); else if (kind === 'down') s.bias = Math.max(-1, s.bias - 0.5);
      else if (kind === 'more' && P.current) { const sim = A.similar(P.current, 40); s.focus = P.current; s.focusSim = new Map(sim.map((t, i) => [t.id, 1 - i / 40])); }
      else if (kind === 'change') { s.focus = null; s.artistFocus = null; s.bias = 0; s.recentArtists = []; }
      dj.refill(); dj.say(A.pick([A.DJ_STYLES[s.style].ack[kind]]), { duck: true, quick: true }); dj.emit('nudge', kind);
    },
    setVibe(v) { const s = dj.s; if (!s) return; s.vibe = typeof v === 'string' ? A.vibeById(v) : v; s.bias = 0; s.focus = null; s.n = 0; dj.refill(); dj.emit('vibe'); },

    // Free-text requests, parsed locally against vibes, genres and artists in the library
    request(text) {
      const q = nrm(text); if (!q) return false;
      if (!dj.s) { const v = A.VIBES.find((x) => q.includes(nrm(x.name)) || x.words.some((w) => w && q.includes(w))) || A.vibeById(A.vibeOfDay()); dj.start({ vibe: v }); }
      const s = dj.s; if (!s) return false; const d = L.derive(); let did = '';
      const art = d.artists.find((a) => a.key.length > 2 && q.includes(a.key)); if (art) { s.artistFocus = art.key; did = `Pulling in ${art.name}`; }
      const gen = d.genres.find((g) => g.key.length > 2 && q.includes(g.key)); if (gen) { s.genres = new Set([gen.key]); did = did || `${gen.name} it is`; }
      const vb = A.VIBES.find((x) => q.includes(nrm(x.name)) || x.words.some((w) => w && w.length > 3 && q.includes(w)));
      if (vb && vb.id !== s.vibe.id) { s.vibe = vb; did = did || `Shifting to ${vb.name}`; }
      if (/(more energy|faster|upbeat|louder|hype|turn it up|pump|bangers)/.test(q)) { s.bias = Math.min(1, s.bias + 0.6); did = did || 'Turning up the energy'; }
      if (/(slower|calm|chill|relax|softer|quiet|sleep|mellow|sad)/.test(q)) { s.bias = Math.max(-1, s.bias - 0.6); did = did || 'Easing back'; }
      if (/(different|something else|change|new)/.test(q)) { s.focus = null; s.artistFocus = null; did = did || 'Changing it up'; }
      if (!did) { dj.say('I couldn’t match that to your library, but try a genre, an artist, or a mood like chill or hype.', { quick: true }); return false; }
      dj.refill(); dj.say(did + '.', { quick: true, duck: true }); dj.emit('vibe'); return true;
    },

    // ----- speaking -----
    _unduck() { if (E.ctx || E.direct) E.setDuck(1, 0.5); dj.emit('talk', false); },
    async say(text, { duck = true, quick = false } = {}) {
      const s = dj.s; const S = A.DJ_STYLES[(s && s.style) || 'smooth'];
      dj.emit('say', { text, dj: S.dj }); dj.emit('talk', true);
      const token = (dj._tok = (dj._tok || 0) + 1);
      if (duck && (E.ctx || E.direct)) E.setDuck(0.2, 0.25);
      const spoke = await A.speech.speak(text, { rate: S.rate, pitch: S.pitch });
      if (!spoke) await A.sleep(Math.min(7000, 1800 + text.length * 55));
      if (dj._tok === token) { E.setDuck(1, 0.8); dj.emit('talk', false); setTimeout(() => dj._tok === token && dj.emit('say', null), quick ? 600 : 1200); }
    },
    async onTrack(track, prev) {
      const s = dj.s; if (!s || s.dead) return;
      const first = s.n === 0; s.n++;
      dj.ensure(); dj.emit('track', track);
      const freq = s.talk; if (freq === 'off') return;
      if (!first && ((freq === 'often' && s.n % 2) || (freq === 'rare' && s.n % 4))) return;
      const moment = first ? 'start' : 'trans';
      let line = await llmLine(track, prev, s, moment);
      if (P.current !== track || !dj.s) return;
      if (!line) line = writeLine(track, prev, s, moment);
      dj.say(line);
    }
  };
})(window.A);
