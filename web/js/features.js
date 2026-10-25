/* Aurora - signature features: smart playlists, Recap stories, DJ journey curves, On This Day */
(function (A) {
  const { $, $$, esc, icon, fmtLong } = A, L = A.lib, P = A.player, U = A.ui;
  const F = A.feat = {};

  // ---------- smart playlist editor ----------
  const condRow = (c = { f: 'genre', op: 'has', v: '' }) => {
    const def = L.SMART_FIELDS[c.f] || L.SMART_FIELDS.genre, ops = L.SMART_OPS[def.type];
    return `<div class="rule"><select class="field" data-r="f">${Object.entries(L.SMART_FIELDS).map(([k, d]) => `<option value="${k}"${k === c.f ? ' selected' : ''}>${esc(d.label)}</option>`).join('')}</select>
      <select class="field" data-r="op">${ops.map(([k, l]) => `<option value="${k}"${k === c.op ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${def.type === 'bool' ? '<span></span>' : `<input class="field" data-r="v" value="${esc(c.v ?? '')}" ${def.type === 'text' ? '' : 'inputmode="decimal"'} placeholder="${def.type === 'text' ? 'e.g. rock' : def.type === 'days' ? 'days' : 'number'}">`}
      <button class="icon-btn sm" data-r="del" aria-label="Remove rule">${icon('x')}</button></div>`;
  };
  const PRESETS = [
    ['Heavy rotation', { match: 'all', conds: [{ f: 'last', op: 'within', v: 30 }, { f: 'plays', op: 'gte', v: 3 }], sort: 'plays', limit: 50 }],
    ['High energy, not played lately', { match: 'all', conds: [{ f: 'energy', op: 'gte', v: 65 }, { f: 'last', op: 'older', v: 30 }], sort: 'random', limit: 60 }],
    ['Never played', { match: 'all', conds: [{ f: 'plays', op: 'lte', v: 0 }], sort: 'added', limit: 100 }],
    ['Liked, before 2010', { match: 'all', conds: [{ f: 'liked', op: 'yes' }, { f: 'year', op: 'lte', v: 2009 }], sort: 'random', limit: 80 }],
    ['Short and upbeat', { match: 'all', conds: [{ f: 'duration', op: 'lte', v: 3.5 }, { f: 'tempo', op: 'gte', v: 115 }], sort: 'random', limit: 60 }]
  ];
  F.smartEditor = async (p) => {
    const rules = p && p.rules ? JSON.parse(JSON.stringify(p.rules)) : { match: 'all', conds: [{ f: 'genre', op: 'has', v: '' }], sort: 'random', limit: 100 };
    let latest = rules;
    const r = await U.modal({
      title: p ? 'Edit smart playlist' : 'New smart playlist', wide: true,
      html: `<label>Name</label><input class="field" data-f="name" value="${esc(p ? p.name : '')}" placeholder="My smart playlist" maxlength="120">
        ${p ? '' : `<div class="actions" style="padding:10px 0 0">${PRESETS.map(([n], i) => `<button class="chip" data-preset="${i}">${esc(n)}</button>`).join('')}</div>`}
        <div class="rule-head">Include songs that match <select class="field" data-f="match"><option value="all"${rules.match !== 'any' ? ' selected' : ''}>all</option><option value="any"${rules.match === 'any' ? ' selected' : ''}>any</option></select> of these rules</div>
        <div id="rules">${(rules.conds.length ? rules.conds : [undefined]).map(condRow).join('')}</div>
        <button class="btn ghost sm" id="add-rule">${icon('plus')} Add rule</button>
        <div class="rule-foot"><label>Order<select class="field" data-f="sort">${[['random', 'Shuffled daily'], ['plays', 'Most played'], ['last', 'Recently played'], ['added', 'Recently added'], ['energy', 'Highest energy'], ['title', 'Title']].map(([k, l]) => `<option value="${k}"${rules.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Up to<input class="field" data-f="limit" inputmode="numeric" value="${rules.limit || 100}" style="width:90px"> songs</label></div>
        <p class="muted" id="rule-count" style="margin:12px 0 0"></p>`,
      buttons: [{ label: 'Cancel', value: null }, { label: p ? 'Save' : 'Create', cls: 'accent', value: 'form' }],
      onOpen: (bg) => {
        const host = $('#rules', bg);
        const read = () => ({ match: $('[data-f=match]', bg).value, sort: $('[data-f=sort]', bg).value, limit: +$('[data-f=limit]', bg).value || 100, seed: rules.seed || A.uid(), conds: $$('.rule', bg).map((row) => ({ f: $('[data-r=f]', row).value, op: $('[data-r=op]', row).value, v: ($('[data-r=v]', row) || {}).value })) });
        const count = () => { latest = read(); const n = L.smartTracks(latest).length; $('#rule-count', bg).textContent = `${n} song${n === 1 ? '' : 's'} match right now. The list updates by itself as your library and listening change.`; };
        $('#add-rule', bg).onclick = () => { host.insertAdjacentHTML('beforeend', condRow()); count(); };
        bg.addEventListener('click', (e) => {
          const del = e.target.closest('[data-r=del]'); if (del) { del.closest('.rule').remove(); count(); }
          const pr = e.target.closest('[data-preset]'); if (pr) { const [n, r] = PRESETS[+pr.dataset.preset]; host.innerHTML = r.conds.map(condRow).join(''); $('[data-f=match]', bg).value = r.match; $('[data-f=sort]', bg).value = r.sort; $('[data-f=limit]', bg).value = r.limit; const nm = $('[data-f=name]', bg); if (!nm.value) nm.value = n; count(); }
        });
        bg.addEventListener('change', (e) => { const f = e.target.closest('[data-r=f]'); if (f) { const row = f.closest('.rule'); row.outerHTML = condRow({ f: f.value, op: L.SMART_OPS[L.SMART_FIELDS[f.value].type][0][0], v: '' }); } count(); });
        bg.addEventListener('input', count); count();
      }
    });
    if (!r) return; r.rules = latest;
    const name = (r.name || '').trim() || 'Smart playlist';
    if (p) { p.name = name; p.rules = r.rules; L.savePlaylists(); L.changed(); A.toast('Smart playlist updated'); return p; }
    const np = L.newPlaylist(name, [], r.rules); location.hash = '#/playlist/' + np.id; A.toast('Smart playlist created'); return np;
  };

  F.rulesText = (r) => {
    const parts = (r.conds || []).filter((c) => c.f && L.SMART_FIELDS[c.f]).map((c) => {
      const d = L.SMART_FIELDS[c.f], name = d.label.replace(/\s*\(.*\)/, '').toLowerCase(), v = c.v;
      if (d.type === 'bool') return c.op === 'yes' ? name : 'not ' + name;
      if (d.type === 'days') return c.op === 'within' ? `${name} in the last ${v} days` : `${name} more than ${v} days ago`;
      if (d.type === 'text') return `${name} ${c.op === 'is' ? 'is' : c.op === 'not' ? 'doesn’t contain' : 'contains'} “${v}”`;
      return `${name} ${c.op === 'gte' ? 'at least' : c.op === 'lte' ? 'at most' : 'exactly'} ${v}${c.f === 'duration' ? ' min' : c.f === 'tempo' ? ' BPM' : ''}`;
    });
    return (parts.length ? parts.join(r.match === 'any' ? ' or ' : ', ') : 'every song') + ` · updates by itself`;
  };

  // ---------- DJ journey curve ----------
  F.journeySVG = (id, vibe, progress = null, cls = '') => {
    const pts = A.journeyCurve(id, vibe), W = cls === 'big' ? 900 : 300, H = cls === 'big' ? 130 : 90, pad = 8;
    const xy = ([p, e]) => [pad + p * (W - pad * 2), H - pad - e * (H - pad * 2)];
    const d = pts.map((pt, i) => (i ? 'L' : 'M') + xy(pt).map((v) => v.toFixed(1)).join(' ')).join(' ');
    const area = d + ` L${W - pad} ${H - pad} L${pad} ${H - pad} Z`;
    let dot = '';
    if (progress != null) { const i = Math.min(pts.length - 1, Math.round(progress * (pts.length - 1))); const [x, y] = xy(pts[i]); dot = `<line x1="${x}" y1="${pad}" x2="${x}" y2="${H - pad}" class="jc-now"/><circle cx="${x}" cy="${y}" r="5.5" class="jc-dot"/>`; }
    const gid = 'jg' + id + (cls ? 'x' : '');
    return `<svg class="journey-svg ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(var(--ar))" stop-opacity=".45"/><stop offset="1" stop-color="rgb(var(--ar))" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#${gid})"/><path d="${d}" class="jc-line"/>${dot}</svg>`;
  };

  // ---------- On This Day card for Home ----------
  F.memoryCard = () => {
    const o = L.onThisDay(); if (o.tracks.length < 1) return '';
    const t = o.tracks[0], more = o.tracks.length - 1;
    return `<a class="memory glass" href="#/mix/mix-onthisday">${U.cover(t)}<div class="mm"><small>${icon('clock')} On this day${o.year && o.year < new Date().getFullYear() ? ' · ' + o.year : ''}</small><b class="ellip">You were playing ${esc(t.title)}</b><span class="muted ellip">${esc(t.artist)}${more > 0 ? ` and ${more} more song${more === 1 ? '' : 's'}` : ''}</span></div>${o.tracks.length >= 3 ? `<button class="go" data-a="play-ctx" data-kind="mix" data-id="mix-onthisday">${icon('play')}</button>` : ''}</a>`;
  };

  // ---------- Recap ----------
  const PERIODS = { month: ['Last 30 days', 30 * 864e5], year: ['This year', null], all: ['All time', Infinity] };
  F.recapData = (period = 'month') => {
    const now = Date.now(), [label, span] = PERIODS[period] || PERIODS.month;
    const from = span === null ? new Date(new Date().getFullYear(), 0, 1).getTime() : span === Infinity ? 0 : now - span;
    const hist = P.hist.filter(([id, at]) => at >= from && L.byId.has(id));
    const per = new Map(), art = new Map(), gen = new Map(), clock = new Array(24).fill(0), days = new Set(); let secs = 0, eSum = 0, eN = 0;
    for (const [id, at] of hist) {
      const t = L.byId.get(id); per.set(id, (per.get(id) || 0) + 1); secs += t.duration || 0;
      A.splitArtists(t.artist).forEach((a) => art.set(a, (art.get(a) || 0) + 1));
      if (t.genre) gen.set(t.genre, (gen.get(t.genre) || 0) + 1);
      const d = new Date(at); clock[d.getHours()]++; days.add(d.toDateString());
      if (t.an) { eSum += t.an.energy; eN++; }
    }
    const top = [...per].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ t: L.byId.get(id), n }));
    const artists = [...art].sort((a, b) => b[1] - a[1]).slice(0, 5), genres = [...gen].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const peak = clock.indexOf(Math.max(...clock)), energy = eN ? eSum / eN : null;
    const night = clock.slice(22).concat(clock.slice(0, 5)).reduce((a, b) => a + b, 0), tot = hist.length || 1;
    const persona = hist.length < 8 ? 'Just getting started' : night / tot > 0.35 ? 'Night Owl' : peak < 11 ? 'Early Bird' : energy != null && energy > 0.62 ? 'Energizer' : energy != null && energy < 0.4 ? 'Mellow Soul' : 'Steady Groover';
    const vibe = energy == null ? null : A.VIBES.slice().sort((a, b) => Math.abs((a.e[0] + a.e[1]) / 2 - energy) - Math.abs((b.e[0] + b.e[1]) / 2 - energy))[0];
    let streak = 0; for (let i = 0; i < 400; i++) { if (days.has(new Date(now - i * 864e5).toDateString())) streak++; else if (i) break; }
    const added = L.tracks.filter((t) => t.added >= from).length;
    return { period, label, plays: hist.length, minutes: Math.round(secs / 60), songs: per.size, top, artists, genres, peak, energy, persona, vibe, streak, days: days.size, added };
  };
  const hourName = (h) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? h + ' AM' : h - 12 + ' PM');
  const slides = (d) => {
    const s = [];
    s.push({ g: ['#7f00ff', '#e100ff'], html: `<small>Your Aurora Recap · ${esc(d.label)}</small><div class="big">${d.minutes.toLocaleString()}</div><h2>minutes of music</h2><p>${d.plays.toLocaleString()} plays across ${d.songs.toLocaleString()} different songs.</p>` });
    if (d.top[0]) { const t = d.top[0].t, art = L.artUrl(t); s.push({ g: ['#ff512f', '#dd2476'], art, html: `<small>Your song</small><div class="rc-cover">${U.cover(t)}</div><h2>${esc(t.title)}</h2><p>${esc(t.artist)} · ${d.top[0].n} plays</p>${d.top.length > 1 ? `<ol class="rc-list">${d.top.slice(1).map((x) => `<li><b>${esc(x.t.title)}</b> <span>${esc(x.t.artist)}</span></li>`).join('')}</ol>` : ''}` }); }
    if (d.artists.length) s.push({ g: ['#43cea2', '#185a9d'], html: `<small>Your artists</small><h2>${esc(d.artists[0][0])}</h2><p>was on ${d.artists[0][1]} times.</p><ol class="rc-list">${d.artists.slice(1).map(([a, n]) => `<li><b>${esc(a)}</b> <span>${n} plays</span></li>`).join('')}</ol>` });
    s.push({ g: ['#4b6cb7', '#182848'], html: `<small>Your listening personality</small><h2>${esc(d.persona)}</h2><p>You press play most around <b>${hourName(d.peak)}</b>.${d.genres.length ? ` Mostly ${d.genres.map((g) => esc(g[0])).join(', ')}.` : ''}</p>` });
    if (d.vibe) s.push({ g: d.vibe.g, html: `<small>Your energy</small><div class="big">${Math.round(d.energy * 100)}%</div><h2>${esc(d.vibe.name)}</h2><p>That’s the vibe your listening matched most. ${esc(d.vibe.tag)}.</p>` });
    s.push({ g: ['#f7971e', '#ffd200'], html: `<small>Your habits</small><div class="big">${d.days}</div><h2>day${d.days === 1 ? '' : 's'} with music</h2><p>${d.streak > 1 ? `Current streak: <b>${d.streak} days</b> in a row. ` : ''}${d.added ? `You added ${d.added} new song${d.added === 1 ? '' : 's'}.` : ''}</p>` });
    s.push({ g: ['#fc466b', '#3f5efb'], end: true, html: `<small>That’s a wrap</small><h2>Thanks for listening</h2><p>Everything here was worked out on your device. Nothing was uploaded.</p><div class="actions" style="justify-content:center"><button class="btn accent" data-rc="play">${icon('play')} Play your top songs</button><button class="btn ghost" data-rc="save">${icon('download')} Save image</button></div>` });
    return s;
  };
  F.recap = (period = 'month') => {
    const d = F.recapData(period);
    if (d.plays < 3) { A.toast('Play a few more songs and your recap will be ready'); return; }
    const S = slides(d); let i = 0, timer;
    const el = document.createElement('div'); el.className = 'recap'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Your recap');
    el.innerHTML = `<div class="rc-bg"></div><div class="rc-bars">${S.map(() => '<i><b></b></i>').join('')}</div><button class="icon-btn rc-x" aria-label="Close">${icon('x')}</button><div class="rc-stage"></div><div class="rc-nav"><button data-rc="prev" aria-label="Previous"></button><button data-rc="next" aria-label="Next"></button></div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
    const show = (n) => {
      i = A.clamp(n, 0, S.length - 1); const sl = S[i]; clearTimeout(timer);
      el.querySelector('.rc-bg').style.background = `linear-gradient(160deg, ${sl.g[0]}, ${sl.g[1]})`;
      const st = el.querySelector('.rc-stage'); st.innerHTML = `<div class="rc-slide">${sl.html}</div>`;
      $$('.rc-bars i', el).forEach((b, k) => { b.className = k < i ? 'done' : k === i ? 'on' : ''; });
      if (!sl.end) timer = setTimeout(() => show(i + 1), 6500);
    };
    const close = () => { clearTimeout(timer); el.classList.remove('in'); document.removeEventListener('keydown', key, true); setTimeout(() => el.remove(), 250); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'ArrowRight') show(i + 1); else if (e.key === 'ArrowLeft') show(i - 1); };
    document.addEventListener('keydown', key, true);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rc], .rc-x'); if (!b) return; e.stopPropagation();
      if (b.classList.contains('rc-x')) return close();
      const a = b.dataset.rc;
      if (a === 'next') { if (i === S.length - 1) close(); else show(i + 1); } else if (a === 'prev') show(i - 1);
      else if (a === 'play') { const ids = [...new Set([...d.top.map((x) => x.t.id), ...P.hist.slice().reverse().map((h) => h[0])])].filter((x) => L.byId.has(x)).slice(0, 50); P.playContext(ids, 0, { type: 'list', name: 'Your Recap' }, { shuffle: false }); close(); }
      else if (a === 'save') F.recapImage(d);
    });
    show(0);
  };
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  F.recapImage = async (d) => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1080, 1920); g.addColorStop(0, '#2a0845'); g.addColorStop(0.5, '#6441a5'); g.addColorStop(1, '#ff2d6c'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
    const font = getComputedStyle(document.body).fontFamily;
    const text = (s, px, y, w = 800, col = '#fff', al = 'left', xx = 90) => { x.font = `${w} ${px}px ${font}`; x.fillStyle = col; x.textAlign = al; let str = String(s); while (x.measureText(str).width > 900 && str.length > 4) str = str.slice(0, -2); if (str !== String(s)) str = str.trim() + '…'; x.fillText(str, xx, y); };
    text('AURORA RECAP · ' + d.label.toUpperCase(), 34, 170, 700, 'rgba(255,255,255,.8)');
    text(d.minutes.toLocaleString(), 210, 400, 900); text('minutes of music', 56, 480, 600, 'rgba(255,255,255,.9)');
    const t = d.top[0] && d.top[0].t; const im = t && (await loadImg(L.artUrl(t)));
    if (t) { if (im) { x.save(); x.beginPath(); x.roundRect ? x.roundRect(90, 560, 360, 360, 28) : x.rect(90, 560, 360, 360); x.clip(); x.drawImage(im, 90, 560, 360, 360); x.restore(); } text('TOP SONG', 30, 610, 700, 'rgba(255,255,255,.7)', 'left', im ? 490 : 90); x.font = `800 52px ${font}`; text(t.title, 52, 680, 800, '#fff', 'left', im ? 490 : 90); text(t.artist, 38, 735, 500, 'rgba(255,255,255,.85)', 'left', im ? 490 : 90); text(d.top[0].n + ' plays', 34, 790, 500, 'rgba(255,255,255,.7)', 'left', im ? 490 : 90); }
    text('TOP ARTISTS', 30, 1040, 700, 'rgba(255,255,255,.7)');
    d.artists.slice(0, 5).forEach(([a], k) => text(`${k + 1}  ${a}`, 50, 1110 + k * 70, 700));
    text('PERSONALITY', 30, 1520, 700, 'rgba(255,255,255,.7)'); text(d.persona, 64, 1590, 800);
    text(`${d.songs} songs · ${d.days} days with music`, 34, 1660, 500, 'rgba(255,255,255,.8)');
    text('Made with Aurora · kailashamarnath.me/Aurora', 28, 1830, 500, 'rgba(255,255,255,.6)');
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], 'aurora-recap.png', { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'My Aurora Recap' }); return; } } catch { /* fall back to a download */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aurora-recap.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); A.toast('Recap image saved');
  };
})(window.A);
