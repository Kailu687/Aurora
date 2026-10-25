/* Aurora - AI DJ: vibe engine, set builder, spoken commentary, background audio analysis */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine;

  // ---------- vibes ----------
  A.VIBES = [
    { id: 'chill', name: 'Chill', tag: 'Easy, breezy, unwind', g: ['#5ee7df', '#4a6cf7'], e: [0.08, 0.42], val: [0.3, 0.75], dance: [0, 0.7], bpm: [60, 105], genres: ['chill', 'lofi', 'lo-fi', 'ambient', 'acoustic', 'jazz', 'soul', 'bossa', 'downtempo', 'folk', 'trip-hop', 'new age', 'easy', 'singer'], words: ['chill', 'calm', 'soft', 'slow', 'sunday', 'rain'] },
    { id: 'hype', name: 'Hype', tag: 'Turn it all the way up', g: ['#ff512f', '#dd2476'], e: [0.68, 1], val: [0.4, 1], dance: [0.55, 1], bpm: [118, 180], genres: ['edm', 'dance', 'hip hop', 'hip-hop', 'rap', 'trap', 'house', 'electronic', 'techno', 'drum', 'dubstep', 'bass', 'rave', 'metal', 'punk'], words: ['hype', 'turn up', 'bangers', 'remix', 'club'] },
    { id: 'focus', name: 'Focus', tag: 'Deep work, no distractions', g: ['#43cea2', '#185a9d'], e: [0.22, 0.55], val: [0.25, 0.7], dance: [0, 0.6], bpm: [70, 125], genres: ['instrumental', 'classical', 'ambient', 'piano', 'lofi', 'lo-fi', 'electronic', 'soundtrack', 'score', 'post-rock', 'study', 'focus', 'new age'], words: ['focus', 'study', 'instrumental', 'piano'] },
    { id: 'latenight', name: 'Late Night', tag: 'Neon lights, empty streets', g: ['#7f00ff', '#e100ff'], e: [0.25, 0.62], val: [0.15, 0.6], dance: [0.3, 0.85], bpm: [70, 118], genres: ['r&b', 'rnb', 'soul', 'synthwave', 'trip-hop', 'downtempo', 'neo soul', 'chillwave', 'night', 'dream', 'electronic', 'lo-fi', 'lofi'], words: ['night', 'midnight', 'dark', 'moon', 'neon', 'city'] },
    { id: 'workout', name: 'Workout', tag: 'Pace, power, repeat', g: ['#f12711', '#f5af19'], e: [0.72, 1], val: [0.35, 1], dance: [0.6, 1], bpm: [125, 180], genres: ['edm', 'dance', 'hip hop', 'hip-hop', 'rap', 'rock', 'metal', 'house', 'techno', 'trap', 'electronic', 'pop', 'punk', 'workout'], words: ['run', 'gym', 'workout', 'power', 'beast'] },
    { id: 'party', name: 'Party', tag: 'Everyone on the floor', g: ['#fc466b', '#3f5efb'], e: [0.6, 0.95], val: [0.5, 1], dance: [0.6, 1], bpm: [100, 140], genres: ['pop', 'dance', 'latin', 'hip hop', 'hip-hop', 'disco', 'funk', 'reggaeton', 'house', 'edm', 'r&b', 'top 40', 'afro', 'party'], words: ['party', 'dance', 'club', 'baila', 'tonight'] },
    { id: 'feelgood', name: 'Feel Good', tag: 'Sunshine in audio form', g: ['#f9d423', '#ff4e50'], e: [0.45, 0.82], val: [0.6, 1], dance: [0.45, 1], bpm: [90, 140], genres: ['pop', 'funk', 'disco', 'reggae', 'soul', 'indie', 'ska', 'motown', 'oldies', 'happy', 'summer', 'country'], words: ['happy', 'sun', 'smile', 'good', 'love', 'summer', 'dance'] },
    { id: 'sad', name: 'In My Feelings', tag: 'Soft, slow, a little sad', g: ['#4b6cb7', '#182848'], e: [0.05, 0.4], val: [0, 0.4], dance: [0, 0.55], bpm: [55, 100], genres: ['ballad', 'acoustic', 'indie', 'singer', 'folk', 'blues', 'sad', 'emo', 'piano', 'country', 'slowcore'], words: ['sad', 'cry', 'tears', 'alone', 'lonely', 'broken', 'goodbye', 'miss', 'heart', 'rain', 'blue'] },
    { id: 'romance', name: 'Romance', tag: 'Candlelight and slow dances', g: ['#ee0979', '#ff6a00'], e: [0.12, 0.55], val: [0.3, 0.7], dance: [0.1, 0.65], bpm: [60, 112], genres: ['r&b', 'rnb', 'soul', 'jazz', 'ballad', 'love', 'bossa', 'latin', 'vocal', 'easy listening', 'romantic'], words: ['love', 'kiss', 'baby', 'heart', 'darling', 'forever', 'romance', 'you'] },
    { id: 'throwback', name: 'Throwback', tag: 'Golden-era classics', g: ['#f7971e', '#ffd200'], e: [0.25, 0.9], bpm: [70, 150], genres: ['oldies', 'classic', 'disco', 'retro', '80s', '90s', 'new wave', 'funk', 'soul', 'motown', 'classic rock', 'britpop', 'grunge'], words: [], years: [1960, 2008] },
    { id: 'roadtrip', name: 'Road Trip', tag: 'Windows down, volume up', g: ['#56ab2f', '#a8e063'], e: [0.45, 0.88], val: [0.45, 1], dance: [0.35, 0.9], bpm: [90, 150], genres: ['rock', 'classic rock', 'country', 'alternative', 'indie', 'pop rock', 'americana', 'folk rock', 'southern', 'alternrock', 'blues'], words: ['road', 'drive', 'highway', 'freedom', 'ride', 'wild', 'home'] },
    { id: 'sleep', name: 'Wind Down', tag: 'Drift off gently', g: ['#2c3e50', '#4ca1af'], e: [0, 0.28], val: [0.2, 0.6], dance: [0, 0.35], bpm: [40, 90], genres: ['ambient', 'new age', 'classical', 'piano', 'meditative', 'sleep', 'instrumental', 'space', 'lullaby', 'drone'], words: ['sleep', 'dream', 'lullaby', 'quiet', 'night', 'peace'] }
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
      // the feel of the song itself: happy or sad (major/minor key, brightness) and how danceable its groove is
      if (t.an.valence != null && vibe.val) s += 0.22 * (rangeFit(t.an.valence, vibe.val, 0.25) - 0.5);
      if (t.an.dance != null && vibe.dance) s += 0.16 * (rangeFit(t.an.dance, vibe.dance, 0.3) - 0.5);
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
  AN.pendingList = () => L.tracks.filter((t) => !t.anFail && (!t.an || (!(t.an.mix && t.an.mix.v === A.MIX_VERSION) && !t.anMixFail)));
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
          if (r) { t.an = r; if (!r.mix) t.anMixFail = true; } else if (t.an) t.anMixFail = true; else t.anFail = true;
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
    cancel() { if (A.voice) A.voice.stop(); if (window.AuroraAndroid) { try { window.AuroraAndroid.stopSpeak(); } catch { /* */ } if (sp._native) { const r = sp._native; sp._native = null; r(false); } sp.speaking = false; dj._unduck(); return; } if (sp.ok && (sp.speaking || speechSynthesis.speaking || speechSynthesis.pending)) { speechSynthesis.cancel(); } sp.speaking = false; dj._unduck(); }
  };
  sp.load();

  // ---------- DJ script writing ----------
  // A real DJ says little, says it with feeling, and matches the room: lines come from the mood of the set, not from
  // the file's tags. Names are used sparingly (mostly just the title), and nothing technical is ever read out.
  A.DJ_STYLES = {
    smooth: { label: 'Smooth', dj: 'Nova', rate: 0.98, pitch: 1.0, speed: 1.0, ack: { up: 'You got it. Lifting it up.', down: 'Sure. Bringing it down.', more: 'More of this? Easy.', change: 'Switching it up for you.' } },
    hype: { label: 'Hype', dj: 'Blaze', rate: 1.06, pitch: 1.04, speed: 1.08, ack: { up: 'Louder? Say no more!', down: 'Alright, quick breather.', more: 'More of this, coming up!', change: 'New direction. Let’s go!' } },
    zen: { label: 'Zen', dj: 'Echo', rate: 0.9, pitch: 0.96, speed: 0.9, ack: { up: 'A little more light, then.', down: 'Softer. Slower.', more: 'Stay with this.', change: 'Let’s drift somewhere new.' } }
  };
  const MOODG = { hype: 'high', workout: 'high', party: 'high', feelgood: 'warm', roadtrip: 'warm', throwback: 'warm', chill: 'mellow', focus: 'mellow', latenight: 'mellow', romance: 'mellow', sad: 'soft', sleep: 'soft' };
  const MOOD_SPEED = { high: 1.05, warm: 1, mellow: 0.95, soft: 0.9 };
  A.djMood = (vibe) => MOODG[(vibe && vibe.id) || vibe] || 'warm';
  const LINES = {
    high: {
      open: ['{dj} here. Let’s get loud.', 'It’s {dj}. You ready? Let’s go.', '{dj} on the decks {time}. Turn it up.', 'Okay, {dj} here, and we are not slowing down {time}.'],
      none: ['Let’s go!', 'Hands up. Here we go.', 'Don’t slow down now.', 'Keep that energy right there.', 'Okay, this is where it gets good.', 'Feel that? That’s the good stuff.', 'Louder. Trust me.', 'No breaks. Keep moving.'],
      title: ['Here’s {t}. Turn it up.', '{t}. Let’s go!', 'This one’s {t}, and it hits.', 'Run it. {t}.'],
      artist: ['{a}, take it away.', 'Big one from {a}.', 'Can’t stop {a} {time}.'],
      up: ['Let’s lift it!', 'Turning it up.', 'Higher now.'], down: ['Quick breather.', 'Pulling back, just for a second.'],
      shout: ['Make some noise!', 'Here it comes!', 'Hands up!', 'Let’s go!', 'Drop it!', 'Are you ready?']
    },
    warm: {
      open: ['Hey, it’s {dj}. Good music, good mood, let’s go.', '{dj} here. Let’s make {time} a good one.', 'Hi, I’m {dj}. Sit back, I’ve got the music.'],
      none: ['Oh, I love this one.', 'Good song, good mood. Let’s keep it going.', 'This one just makes everything better.', 'Sing it if you know it.', 'Windows down for this one.', 'Right where we want to be.'],
      title: ['Here’s {t}.', 'This is {t}. Enjoy it.', '{t}, coming right up.', 'A little {t} for you.'],
      artist: ['A bit of {a} for you.', 'Here’s {a}.', 'Some {a} to keep it rolling.'],
      up: ['Bit more bounce now.', 'Picking it up.'], down: ['Easing off a little.', 'Let’s take it easy for a minute.'],
      shout: ['Here we go!', 'Oh, this one!']
    },
    mellow: {
      open: ['Hey, it’s {dj}. Let’s slow everything down {time}.', '{dj} here. Get comfortable.', 'Hi. It’s {dj}. Nowhere to be, nothing to do. Just this.'],
      none: ['Stay right here for a minute.', 'Mm. Nice and easy.', 'Just let this one breathe.', 'No rush. Settle in.', 'This is a good place to be.', 'Let the night do its thing.'],
      title: ['This is {t}.', 'Here’s {t}. Take your time with it.', 'Easing into {t}.'],
      artist: ['Something gentle from {a}.', '{a}, nice and easy.'],
      up: ['A touch more life.', 'Lifting it, just a little.'], down: ['Softer now.', 'Let’s slow it down even more.'],
      shout: []
    },
    soft: {
      open: ['Hi, it’s {dj}. Take a breath. I’ll keep it gentle.', '{dj} here. Let’s go slow {time}.'],
      none: ['Softly now.', 'Just breathe with this one.', 'Let it all go for a while.', 'Stay close. This one’s gentle.', 'It’s okay to just listen.'],
      title: ['This is {t}.', 'Here’s {t}.', 'Something quiet. {t}.'],
      artist: ['Something soft from {a}.'],
      up: ['A little warmth now.'], down: ['Quieter still.'],
      shout: []
    }
  };
  function timeWord() { const h = new Date().getHours(); return h < 5 ? 'tonight' : h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : h < 21 ? 'this evening' : 'tonight'; }
  function fill(str, c) { return str.replace(/\{(\w+)\}/g, (_, k) => c[k] || '').replace(/\s+/g, ' ').trim(); }
  const shortTitle = (t) => (t.title || '').replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+-\s+.*$/, '').replace(/\s+/g, ' ').trim(); // drop "(feat. …)", "[Remastered]", " - From …"
  const shortArtist = (t) => (t.artist || '').split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|;|\/)\s*/i)[0].trim();
  function pickFresh(arr, s) { // avoid repeating a line the DJ said recently
    const seen = s.said || (s.said = []); const fresh = arr.filter((x) => !seen.includes(x)), x = A.pick(fresh.length ? fresh : arr);
    seen.push(x); if (seen.length > 14) seen.shift(); return x;
  }
  function writeLine(t, prev, s, moment) {
    const g = A.djMood(s.vibe), B = LINES[g], c = { dj: A.DJ_STYLES[s.style].dj, t: shortTitle(t), a: shortArtist(t), time: timeWord() };
    if (moment === 'start') return fill(pickFresh(B.open, s), c);
    if (moment === 'shout') return B.shout.length ? fill(pickFresh(B.shout, s), c) : '';
    const r = Math.random(), unknown = !t.artist || /unknown/i.test(t.artist);
    let line = fill(pickFresh(r < 0.42 ? B.none : r < 0.8 || unknown ? B.title : B.artist, s), c);
    if (prev && t.an && prev.an) { const d = t.an.energy - prev.an.energy; if (d > 0.22 && Math.random() < 0.6) line = pickFresh(B.up, s) + ' ' + line; else if (d < -0.22 && Math.random() < 0.6) line = pickFresh(B.down, s) + ' ' + line; }
    if (Math.random() < 0.18) { // now and then, one small human touch
      const extra = [];
      if (t.liked) extra.push('One of your favorites.');
      if (t.plays === 0) extra.push('You haven’t heard this one yet.');
      if (t.plays > 2 && Date.now() - (t.last || 0) > 60 * 864e5) extra.push('Been a while since this one.');
      if (s.vibe.id === 'throwback' && t.year) extra.push(`Back to ${t.year}.`);
      if (extra.length) line += ' ' + A.pick(extra);
    }
    return line;
  }
  async function llmLine(t, prev, s, moment) {
    const key = await A.safety.secretGet('aiKey'); if (!key) return null;
    const S = A.DJ_STYLES[s.style];
    const prompt = `You are ${S.dj}, a charismatic DJ in the style "${S.label}". Set mood: ${s.vibe.name} (${s.vibe.tag}). ` +
      `${moment === 'start' ? 'You are opening the set.' : `The song that just finished: "${prev ? shortTitle(prev) : ''}".`} ` +
      `Coming in now: "${shortTitle(t)}" by ${shortArtist(t)}. Time of day: ${timeWord()}. ` +
      `Write ONE short spoken line of 4 to 14 words that matches the mood. Speak like a real DJ talking over the music: casual, warm, no emojis, no quotation marks, no stage directions, ` +
      `never mention tempo, BPM, keys or numbers. Mention the song title at most once and only if it sounds natural; usually don't say the artist.`;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: A.store.get('aiModel', 'claude-haiku-5-5'), max_tokens: 80, messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) return null;
      const j = await r.json(); const txt = j.content && j.content[0] && j.content[0].text;
      return txt ? txt.replace(/\s+/g, ' ').replace(/^["“]|["”]$/g, '').trim() : null;
    } catch { return null; } finally { clearTimeout(to); }
  }

  // Ask Claude to turn a free-text request into vibe / genre / artist / energy choices from this library
  async function llmRequest(text) {
    const key = await A.safety.secretGet('aiKey'); if (!key) return null;
    const d = L.derive();
    const genres = d.genres.slice(0, 40).map((g) => g.name), artists = d.artists.slice().sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 80).map((a) => a.name);
    const prompt = `A listener asked their music player's DJ: "${text}"\n` +
      `Vibes: ${A.VIBES.map((v) => v.id + ' (' + v.name + ')').join(', ')}.\nGenres in their library: ${genres.join(', ') || 'none tagged'}.\nArtists in their library: ${artists.join(', ')}.\n` +
      `Reply with JSON only: {"vibe": one vibe id or null, "genres": [genres from the list], "artists": [artists from the list], "energy": number from -1 (much calmer) to 1 (much more energy), "reply": "one short friendly DJ sentence, no emojis"}. Use only names from the lists.`;
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: A.store.get('aiModel', 'claude-haiku-5-5'), max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) return null;
      const j = await r.json(), txt = (j.content && j.content[0] && j.content[0].text) || '', m = /\{[\s\S]*\}/.exec(txt);
      return m ? JSON.parse(m[0]) : null;
    } catch { return null; } finally { clearTimeout(to); }
  }

  // ---------- journeys: the shape of a set's energy over about an hour ----------
  const JLEN = 16;
  A.JOURNEYS = {
    steady: { name: 'Steady', tag: 'Holds the vibe with gentle waves', f: null },
    peak: { name: 'Warm up, peak, cool down', tag: 'Builds to a peak around 40 minutes in, then lands softly', f: (p) => (p < 0.6 ? 0.15 + 0.85 * (p / 0.6) : 1 - 0.75 * ((p - 0.6) / 0.4)) },
    build: { name: 'Build up', tag: 'Starts easy and keeps climbing', f: (p) => 0.1 + 0.9 * p },
    wind: { name: 'Wind down', tag: 'Eases off song by song, then stops', f: (p) => 1 - 0.95 * p }
  };
  A.journeyCurve = (id, vibe) => { // [ [p, energy], ... ] for drawing
    const J = A.JOURNEYS[id] || A.JOURNEYS.steady, [a, b] = vibe.e, lo = Math.max(0, a - 0.12), hi = Math.min(1, b + 0.12), mid = (a + b) / 2;
    return Array.from({ length: 33 }, (_, i) => { const p = i / 32; return [p, J.f ? lo + J.f(p) * (hi - lo) : mid + 0.09 * Math.sin(((p * JLEN) / 9) * Math.PI * 2 - Math.PI / 2)]; });
  };

  // ---------- DJ session ----------
  const dj = A.dj = {
    s: null,
    listeners: new Set(),
    emit(n, d) { dj.listeners.forEach((f) => f(n, d)); },
    get active() { return !!dj.s && P.context.type === 'dj'; },

    start({ vibe, genres = [], style, voice, talk, request, journey } = {}) {
      if (!A.djEnabled()) { A.toast('AI DJ is turned off in Settings'); return false; }
      vibe = typeof vibe === 'string' ? A.vibeById(vibe) : vibe;
      if (!vibe) vibe = A.vibeById(A.vibeOfDay());
      if (L.tracks.length < 3) { A.toast('Add some music first so the DJ has records to spin'); return false; }
      journey = A.JOURNEYS[journey] ? journey : A.store.get('djJourney', 'steady');
      A.store.set('djLast', { vibe: vibe.id, genres, style }); A.store.set('djJourney', journey);
      dj.s = { vibe, journey, genres: new Set(genres.map(nrm)), style: style || A.store.get('djStyle', 'smooth'), talk: talk || A.store.get('djTalk', 'always'), bias: 0, played: new Set(), recentArtists: [], n: 0, started: Date.now(), focus: null, artistFocus: null, dead: false };
      A.store.set('djStyle', dj.s.style);
      const first = dj._pick(); if (!first) { A.toast('Couldn’t find tracks for that vibe'); return false; }
      dj._mark(first);
      P.playContext([first.id], first.id, { type: 'dj', id: vibe.id, name: `DJ ${A.DJ_STYLES[dj.s.style].dj} · ${vibe.name}` }, { noShuffle: true });
      dj.ensure(); dj.emit('start'); return true;
    },
    stop() { if (dj.s) { A.speech.cancel(); dj.s = null; dj.emit('stop'); } },

    _mark(t) { const s = dj.s; s.played.add(t.id); s.recentArtists.push(t.artist); if (s.recentArtists.length > 5) s.recentArtists.shift(); },
    _targetEnergy() {
      const s = dj.s, [a, b] = s.vibe.e, J = A.JOURNEYS[s.journey];
      if (J && J.f) { const lo = Math.max(0, a - 0.12), hi = Math.min(1, b + 0.12); return A.clamp(lo + J.f(Math.min(1, s.n / JLEN)) * (hi - lo) + s.bias * 0.3, 0, 1); }
      const mid = (a + b) / 2, wave = 0.09 * Math.sin((s.n / 9) * Math.PI * 2 - Math.PI / 2); return A.clamp(mid + s.bias * 0.3 + wave, 0, 1);
    },
    progress() { const s = dj.s; return s ? Math.min(1, s.n / JLEN) : 0; },
    setJourney(id) { const s = dj.s; A.store.set('djJourney', id); if (!s || !A.JOURNEYS[id]) return; s.journey = id; s.n = Math.min(s.n, 1); dj.refill(); dj.say(id === 'steady' ? 'Keeping it steady.' : `New plan: ${A.JOURNEYS[id].name.toLowerCase()}.`, { quick: true, duck: true }); dj.emit('vibe'); },
    _pick(prev) {
      const s = dj.s; if (!s) return null;
      const last = prev || P.current, now = P.current;
      let pool = L.tracks.filter((t) => !s.played.has(t.id));
      if (pool.length < 4) { s.played.clear(); pool = L.tracks.slice(); }
      if (pool.length > 2) pool = pool.filter((t) => t !== last && t !== now); // never the same song twice in a row
      const target = dj._targetEnergy();
      const scored = pool.map((t) => {
        let sc = A.vibeScore(t, s.vibe, s.genres);
        if (t.an) sc += 0.28 * (1 - Math.min(1, Math.abs(t.an.energy - target) / 0.4));
        if (s.recentArtists.includes(t.artist)) sc -= 0.4;
        if (last && last.an && t.an) { sc += 0.12 * (1 - Math.min(1, Math.abs(last.an.energy - t.an.energy) / 0.35)); if (last.an.tempo && t.an.tempo) sc += 0.08 * (1 - Math.min(1, Math.abs(last.an.tempo - t.an.tempo) / 35)); }
        // songs that can be beat-matched with the one before them mix far better: give them a nudge
        const ga = last && last.an && last.an.mix, gb = t.an && t.an.mix;
        if (ga && gb) { const q = ga.bpm / gb.bpm, d = Math.min(...[q, q / 2, q * 2].map((x) => Math.abs(x - 1))); sc += d <= 0.06 ? 0.14 * (1 - d / 0.06) : -0.04; }
        // and songs in a compatible key (neighbours on the Camelot wheel) blend without clashing
        if (last && last.an && last.an.key && t.an && t.an.key) sc += 0.1 * (A.keyMatch(last.an.key, t.an.key) - 0.5);
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
      P.order.length = P.pos + 1; if (dj.s.preps) dj.s.preps.clear(); dj.ensure(3); dj.prepare();
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
      if (!did) { dj.askClaude(text); return true; }
      dj.refill(); dj.say(did + '.', { quick: true, duck: true }); dj.emit('vibe'); return true;
    },

    async askClaude(text) {
      const s = dj.s; if (!s) return;
      const fail = () => dj.say('I couldn’t match that to your library, but try a genre, an artist, or a mood like chill or hype.', { quick: true });
      if (!(await A.safety.secretGet('aiKey'))) return fail();
      dj.emit('say', { text: 'Let me dig through your records…', dj: A.DJ_STYLES[s.style].dj });
      const r = await llmRequest(text); if (!r || dj.s !== s) return fail();
      const d = L.derive(), byName = (arr, n) => arr.find((x) => A.norm(x.name) === A.norm(n));
      const v = r.vibe && A.vibeById(r.vibe); if (v) s.vibe = v;
      const gs = (r.genres || []).map((g) => byName(d.genres, g)).filter(Boolean); if (gs.length) s.genres = new Set(gs.map((g) => g.key));
      const ar = (r.artists || []).map((a) => byName(d.artists, a)).filter(Boolean)[0]; if (ar) s.artistFocus = ar.key;
      if (typeof r.energy === 'number') s.bias = A.clamp(r.energy, -1, 1);
      if (!v && !gs.length && !ar && typeof r.energy !== 'number') return fail();
      dj.refill(); dj.say(r.reply || 'On it.', { quick: true, duck: true }); dj.emit('vibe');
    },

    // ----- speaking -----
    // The DJ talks like a radio host: over the quiet start of a song (never across a blend), with the music dipped
    // rather than muted, and short enough to finish before the hook lands.
    _unduck() { if (E.ctx || E.direct) E.setDuck(1, 0.5); dj.emit('talk', false); },
    _speed() { const s = dj.s; return ((s && A.DJ_STYLES[s.style].speed) || 1) * (MOOD_SPEED[A.djMood(s && s.vibe)] || 1); },
    studio() {
      const V = A.voice; if (!V || !V.wanted()) return false;
      if (!V.ready() && V.state !== 'loading' && V.state !== 'error') V.load(); // started on first use, not at app start
      return V.ready();
    },
    _render(text) { // a studio-voice clip for this line, or null (then the system voice reads it live)
      if (!text || A.store.get('djVoiceOn', true) === false || !dj.studio()) return Promise.resolve(null);
      return A.voice.synth(text, { style: (dj.s && dj.s.style) || 'smooth', speed: dj._speed() }).catch(() => null);
    },
    async say(text, { duck = true, quick = false, clip = null, level = 0.42 } = {}) {
      const s = dj.s; const S = A.DJ_STYLES[(s && s.style) || 'smooth'];
      if (!text) return false;
      dj.emit('say', { text, dj: S.dj }); dj.emit('talk', true);
      const token = (dj._tok = (dj._tok || 0) + 1);
      if (duck && (E.ctx || E.direct)) E.setDuck(level, 0.18);
      let spoke = false;
      if (!clip && dj.studio()) clip = await dj._render(text);
      if (dj._tok !== token) return false;
      if (clip) { A.speech.speaking = true; spoke = await A.voice.play(clip); A.speech.speaking = false; }
      else spoke = await A.speech.speak(text, { rate: S.rate * (MOOD_SPEED[A.djMood(s && s.vibe)] || 1), pitch: S.pitch });
      if (!spoke && dj._tok === token) await A.sleep(Math.min(5000, 1200 + text.length * 45));
      if (dj._tok === token) { E.setDuck(1, 0.6); dj.emit('talk', false); setTimeout(() => dj._tok === token && dj.emit('say', null), quick ? 600 : 1200); }
      return spoke;
    },
    // Decide now whether the DJ will talk when the next song comes in, write the line and render it in the
    // background, so it is ready the moment it is needed (and the mixer can leave room for it).
    prepare() {
      const s = dj.s; if (!s || s.talk === 'off' || A.store.get('djVoiceOn', true) === false) return;
      const nid = P.peekNext(), t = nid && L.byId.get(nid), preps = s.preps || (s.preps = new Map()); if (!t || preps.has(nid)) return;
      const n = s.n + 1, freq = s.talk, gap = n - (s.lastTalk || 0);
      const talk = freq === 'always' ? true : freq === 'often' ? gap >= 2 : gap >= 4;
      const prep = { id: nid, talk, line: null, clip: null, shout: null, shoutClip: null };
      preps.set(nid, prep); if (preps.size > 4) preps.delete(preps.keys().next().value);
      if (!talk) return;
      (async () => {
        let line = await llmLine(t, P.current, s, 'trans'); if (preps.get(nid) !== prep) return;
        prep.line = line || writeLine(t, P.current, s, 'trans');
        prep.clip = dj._render(prep.line);
        const sh = writeLine(t, P.current, s, 'shout'); if (sh) { prep.shout = sh; prep.shoutClip = dj._render(sh); }
        const c = await prep.clip; prep.secs = c ? c.secs : null;
        if (A.mixer && preps.get(nid) === prep && P.peekNext() === nid && !A.mixer.fxOn && !E.mixing) A.mixer.replan(); // room for the talk may change the mix-in point
      })();
    },
    // seconds of talking the mixer should leave room for when bringing in this song (0 if the DJ stays quiet)
    talkRoom(id) { const s = dj.s, p = s && s.preps && s.preps.get(id); if (!p || !p.talk || !p.line) return 0; return (p.secs || 0.9 + p.line.split(/\s+/).length * 0.36) + 0.8; },
    // a build-up is running into the drop of the next song: a hype DJ shouts over it, timed to land on the drop
    async onBuild(secsToDrop, nextId) {
      const s = dj.s, p = s && s.preps && s.preps.get(nextId); if (!p || !p.talk || !p.shout) return;
      const clip = await p.shoutClip, len = clip ? clip.secs : 0.4 + p.shout.split(/\s+/).length * 0.3;
      const wait = secsToDrop - len - 0.25; if (wait < 0) return;
      p.shouted = true; dj._keep = true;
      await A.sleep(wait * 1000); if (dj.s !== s) { dj._keep = false; return; }
      await dj.say(p.shout, { clip, duck: false, quick: true }); dj._keep = false;
    },
    async onTrack(track, prev) {
      const s = dj.s; if (!s || s.dead) return;
      const first = s.n === 0; s.n++;
      if (s.journey === 'wind' && s.n === JLEN && !P.sleep) { P.setSleep('end'); A.toast('Wind down: Aurora stops after this song'); }
      dj.ensure(); dj.emit('track', track);
      const p = (s.preps && s.preps.get(track.id)) || null; if (p) s.preps.delete(track.id);
      setTimeout(() => dj.prepare(), 1500);
      if (s.talk === 'off' || A.store.get('djVoiceOn', true) === false) return;
      if (first) { s.lastTalk = s.n; const line = writeLine(track, prev, s, 'start'); dj.say(line, { clip: await dj._render(line) }); return; }
      if (!p || !p.talk || p.shouted) { if (p && p.shouted) s.lastTalk = s.n; return; }
      // wait for the blend to finish: the DJ never talks across two songs
      for (let i = 0; i < 400 && E.mixing; i++) await A.sleep(150);
      if (P.current !== track || dj.s !== s) return;
      await A.sleep(350);
      const clip = await p.clip, line = p.line; if (!line || P.current !== track) return;
      // only if it fits before the hook comes in (otherwise save it: the DJ doesn't talk over the best part)
      const m = A.mixer && A.mixer.grid(track), secs = clip ? clip.secs : 0.9 + line.split(/\s+/).length * 0.36;
      if (m && A.mixer.mode() === 'parts') { const left = (m.bar0 + m.hb * 4 * (60 / m.bpm) - E.time) / (E.deck.el.playbackRate || 1); if (left < secs + 0.3) return; }
      s.lastTalk = s.n; dj.say(line, { clip });
    }
  };
  P.addEventListener('queue', () => { if (dj.active) dj.prepare(); });
})(window.A);
