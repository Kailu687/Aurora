/* Aurora - pages & router */
(function (A) {
  const { $, $$, esc, icon, fmt, fmtLong } = A, L = A.lib, P = A.player, E = A.engine, U = A.ui;
  A.actions = {};
  const V = A.views = {};
  const reg = new Map(); let regN = 0; // per-render play contexts
  const regCtx = (ids, meta) => { const k = 'c' + regN++; reg.set(k, { ids, meta }); return k; };
  A.reg = reg;

  let mixCache = null; const mixes = () => (mixCache || (mixCache = L.mixes()));
  L.on(() => { mixCache = null; });

  U.ctxOf = (kind, id) => {
    const d = L.derive();
    switch (kind) {
      case 'album': { const a = d.albumById.get(id); return a && { ids: a.tracks, meta: { type: 'album', id, name: a.name } }; }
      case 'artist': { const a = d.artistById.get(id); return a && { ids: a.tracks, meta: { type: 'artist', id, name: a.name } }; }
      case 'genre': { const a = d.genreById.get(id); return a && { ids: a.tracks, meta: { type: 'genre', id, name: a.name } }; }
      case 'playlist': { const p = L.playlists.find((x) => x.id === id); return p && { ids: p.tracks, meta: { type: 'playlist', id, name: p.name } }; }
      case 'liked': return { ids: L.liked().map((t) => t.id), meta: { type: 'liked', id: 'liked', name: 'Liked Songs' } };
      case 'recent': return { ids: P.hist.slice().reverse().map((h) => h[0]).filter((v, i, a) => L.byId.has(v) && a.indexOf(v) === i), meta: { type: 'recent', id: 'recent', name: 'Recently played' } };
      case 'mix': { const m = mixes().find((x) => x.id === id); return m && { ids: m.tracks, meta: { type: 'mix', id, name: m.name } }; }
      case 'library': return { ids: L.tracks.map((t) => t.id), meta: { type: 'library', id: 'library', name: 'Your Library' } };
      case 'added': return { ids: L.recentlyAdded(60).map((t) => t.id), meta: { type: 'added', id: 'added', name: 'Recently added' } };
    }
  };

  // ---------- helpers ----------
  const mixCover = (m, i) => {
    const art = L.artFor(m); const h = (i * 67 + 330) % 360;
    return `<div class="cover" style="background:linear-gradient(145deg,hsl(${h} 80% 52%),hsl(${(h + 50) % 360} 85% 32%))">${art ? `<img src="${art}" style="opacity:.38;mix-blend-mode:luminosity" alt="">` : ''}<div style="position:absolute;inset:0;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;font-weight:800;font-size:19px;line-height:1.05;letter-spacing:-.02em;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.3)">${esc(m.name)}</div></div>`;
  };
  const trackCard = (t, key) => U.card({ href: 'javascript:void 0', cover: U.cover(t), title: t.title, sub: t.artist, data: `data-reg="${key}" data-id="${t.id}"` }).replace('data-a="play-ctx"', 'data-a="play-reg"').replace('<a class="card"', `<a class="card" data-a="play-reg" data-reg="${key}" data-id="${t.id}"`);
  const albumCard = (a) => U.card({ href: '#/album/' + a.id, cover: L.coverHTML(L.artFor(a), a.id), title: a.name, sub: `${a.artist}${a.year ? ' · ' + a.year : ''}`, data: `data-kind="album" data-id="${a.id}"` });
  const artistCard = (a) => U.card({ href: '#/artist/' + a.id, cover: L.coverHTML(L.artFor(a), a.id), title: a.name, sub: `${a.tracks.length} song${a.tracks.length > 1 ? 's' : ''}`, round: true, data: `data-kind="artist" data-id="${a.id}"` });
  const plCard = (p) => U.card({ href: '#/playlist/' + p.id, cover: L.coverHTML(L.artFor(p), p.id), title: p.name, sub: `${p.tracks.length} songs`, data: `data-kind="playlist" data-id="${p.id}"` });
  const shelf = (title, items, link) => items.length ? `<div class="sec"><h2>${title}</h2>${link ? `<a href="${link}">Show all</a>` : ''}</div><div class="shelf">${items.join('')}</div>` : '';
  const emptyLib = () => `<div class="welcome glass"><div class="orb" style="width:110px;height:110px"></div><h1>Your music, beautifully played</h1><p>Point Aurora at a folder of MP3 / MP4 / M4A files. Everything stays on your device. Then let the AI DJ take over.</p><div class="actions" style="justify-content:center"><button class="btn accent lg" data-a="add-music">${icon('folder')} Add music</button></div><p class="faint" style="font-size:13px">Tip: you can also drag &amp; drop folders and files anywhere in this window.</p></div>`;

  // Progressive rows for long lists
  const mountRows = (host, tracks, o = {}) => {
    const CH = 120; let n = 0;
    host.innerHTML = tracks.length ? `<div class="rows${o.noAlbum ? ' noalbum' : ''}"><div class="row-head"><span style="text-align:center">#</span><span>Title</span><span class="c-album">Album</span><span></span><span style="text-align:right">${icon('clock')}</span><span></span></div><div class="rbody"></div><div class="load-more"></div></div>` : '';
    if (!tracks.length) return;
    const body = $('.rbody', host), sent = $('.load-more', host);
    const more = () => { if (n >= tracks.length) return; body.insertAdjacentHTML('beforeend', tracks.slice(n, n + CH).map((t, i) => U.row(t, n + i, o)).join('')); n += CH; };
    more();
    if (tracks.length > CH) { const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { more(); if (n >= tracks.length) io.disconnect(); } }, { root: $('#view'), rootMargin: '600px' }); io.observe(sent); }
  };
  const heroColor = async (el, url) => { const c = await U.colorOf(url); const h = $('.hero', el); if (h && c) h.style.setProperty('--hr', c.join(',')); };
  const sortTracks = (arr, by) => {
    const a = arr.slice(), c = (f) => (x, y) => f(x) < f(y) ? -1 : f(x) > f(y) ? 1 : 0;
    switch (by) {
      case 'title': return a.sort((x, y) => x.title.localeCompare(y.title));
      case 'artist': return a.sort((x, y) => x.artist.localeCompare(y.artist) || x.album.localeCompare(y.album) || (x.track - y.track));
      case 'added': return a.sort((x, y) => y.added - x.added);
      case 'plays': return a.sort((x, y) => y.plays - x.plays);
      case 'duration': return a.sort(c((t) => t.duration));
      case 'energy': return a.sort((x, y) => ((y.an && y.an.energy) || 0) - ((x.an && x.an.energy) || 0));
    } return a;
  };

  function detail(el, o) {
    const ids = o.tracks.map((t) => t.id), key = regCtx(ids, o.meta);
    const totalDur = o.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    const art = o.art || L.artFor({ tracks: o.tracks });
    el.innerHTML = `<div class="page"><div class="hero">${L.coverHTML(art, o.seed || o.meta.id, o.round ? 'round' : '')}<div class="meta"><div class="kind">${o.kind}</div><h1>${esc(o.title)}</h1><div class="sub">${o.sub || ''}${o.sub ? ' · ' : ''}${o.tracks.length} song${o.tracks.length === 1 ? '' : 's'}${totalDur ? ', ' + fmtLong(totalDur) : ''}</div></div></div>
      <div class="actions"><button class="big-play" data-a="play-reg" data-reg="${key}" aria-label="Play">${icon('play')}</button><button class="icon-btn lg" data-a="shuffle-reg" data-reg="${key}" title="Shuffle play">${icon('shuffle')}</button>${o.extra || ''}
      ${o.sortable ? `<span style="flex:1"></span><select class="field" id="sort-by"><option value="">Default order</option><option value="title">Title</option><option value="artist">Artist</option><option value="added">Recently added</option><option value="plays">Most played</option><option value="duration">Duration</option><option value="energy">Energy</option></select>` : ''}</div>
      <div id="rows-host"></div>${o.after || ''}</div>`;
    const host = $('#rows-host', el);
    const draw = (list) => { const k = regCtx(list.map((t) => t.id), o.meta); host.dataset.reg = k; mountRows(host, list, { noAlbum: o.noAlbum, playlist: o.playlist }); };
    draw(o.tracks); host.dataset.reg = key;
    if (!o.tracks.length) host.innerHTML = `<div class="empty">${icon('music')}<div>${o.emptyMsg || 'Nothing here yet.'}</div></div>`;
    const sel = $('#sort-by', el); if (sel) sel.onchange = () => draw(sortTracks(o.tracks, sel.value));
    heroColor(el, art);
  }

  // ---------- pages ----------
  V.home = (el) => {
    if (!L.tracks.length) { el.innerHTML = `<div class="page">${emptyLib()}</div>`; return; }
    const h = new Date().getHours(), greet = h < 5 ? 'Still up?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    const d = L.derive(), recent = L.recent(30);
    const tiles = [];
    tiles.push(`<a class="tile" href="#/liked"><div class="cover ph" style="background:linear-gradient(135deg,#5b3cff,#b57dff)">${icon('heart')}</div><b class="ellip">Liked Songs</b><button class="go" data-a="play-ctx" data-kind="liked" data-id="liked">${icon('play')}</button></a>`);
    if (A.djEnabled()) tiles.push(`<a class="tile" href="#/dj"><div class="cover ph" style="background:linear-gradient(135deg,var(--accent),var(--accent2))">${icon('spark')}</div><b class="ellip">AI DJ · ${esc(A.vibeById(A.vibeOfDay()).name)}</b><button class="go" data-a="dj-surprise">${icon('play')}</button></a>`);
    L.playlists.slice(0, 2).forEach((p) => tiles.push(`<a class="tile" href="#/playlist/${p.id}">${L.coverHTML(L.artFor(p), p.id)}<b class="ellip">${esc(p.name)}</b><button class="go" data-a="play-ctx" data-kind="playlist" data-id="${p.id}">${icon('play')}</button></a>`));
    d.albums.filter((a) => L.artFor(a)).slice(0, 6 - tiles.length).forEach((a) => tiles.push(`<a class="tile" href="#/album/${a.id}">${L.coverHTML(L.artFor(a), a.id)}<b class="ellip">${esc(a.name)}</b><button class="go" data-a="play-ctx" data-kind="album" data-id="${a.id}">${icon('play')}</button></a>`));
    const rk = regCtx(recent.map((t) => t.id), { type: 'recent', name: 'Recently played' });
    const ak = regCtx(L.recentlyAdded(20).map((t) => t.id), { type: 'added', name: 'Recently added' });
    const topArtists = d.artists.slice().sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12);
    const albums = d.albums.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 14);
    const vibeCards = A.VIBES.map((v) => `<button class="card" data-a="dj-start" data-id="${v.id}" style="padding:0"><div class="cover" style="background:linear-gradient(135deg,${v.g[0]},${v.g[1]})"><div style="position:absolute;inset:0;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;font-weight:800;font-size:20px;letter-spacing:-.02em">${esc(v.name)}<small style="font-weight:500;font-size:12px;opacity:.9;margin:2px 0 0">${esc(v.tag)}</small></div></div></button>`);
    el.innerHTML = `<div class="page"><h1>${greet}</h1><div class="tiles">${tiles.join('')}</div>
      ${A.djEnabled() ? shelf('Spin up the AI DJ', vibeCards, '#/dj') : ''}
      ${shelf('Made for you', mixes().map((m, i) => `<a class="card" href="#/mix/${m.id}"><div class="cover-wrap">${mixCover(m, i)}<button class="go" data-a="play-ctx" data-kind="mix" data-id="${m.id}">${icon('play')}</button></div><b class="ellip">${esc(m.name)}</b><small>${esc(m.sub)}</small></a>`))}
      ${shelf('Recently played', recent.slice(0, 14).map((t) => trackCard(t, rk)), '#/recent')}
      ${shelf('Albums', albums.map(albumCard), '#/library/albums')}
      ${shelf('Artists', topArtists.map(artistCard), '#/library/artists')}
      ${shelf('Recently added', L.recentlyAdded(14).map((t) => trackCard(t, ak)))}</div>`;
  };

  V.search = (el, q) => {
    q = decodeURIComponent(q || ''); const inp = $('#q'); if (document.activeElement !== inp) inp.value = q;
    if (!q.trim()) {
      const d = L.derive();
      const g = d.genres.slice(0, 12).map((x, i) => { const h = (i * 53 + 10) % 360; return `<a class="genre-tile" href="#/genre/${x.id}" style="background:linear-gradient(135deg,hsl(${h} 75% 52%),hsl(${(h + 40) % 360} 80% 36%))">${esc(x.name)}<small>${x.tracks.length} songs</small></a>`; }).join('');
      const v = A.VIBES.map((x) => `<button class="genre-tile" data-a="dj-start" data-id="${x.id}" style="background:linear-gradient(135deg,${x.g[0]},${x.g[1]})">${esc(x.name)}<small>${esc(x.tag)}</small></button>`).join('');
      el.innerHTML = `<div class="page"><h1>Search</h1>${g ? `<div class="sec"><h2>Browse your genres</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${g}</div>` : ''}${A.djEnabled() ? `<div class="sec"><h2>Start a DJ set</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${v}</div>` : ''}</div>`;
      return;
    }
    const r = L.search(q), key = regCtx(r.tracks.map((t) => t.id), { type: 'search', name: `Search: ${q}` });
    const top = r.artists[0] || r.albums[0];
    el.innerHTML = `<div class="page"><h1 style="font-size:28px">Results for “${esc(q)}”</h1>
      ${r.tracks.length || r.artists.length || r.albums.length ? '' : `<div class="empty">${icon('search')}<div>No matches. Try another spelling?</div></div>`}
      ${r.tracks.length ? `<div class="sec"><h2>Songs</h2><button data-a="play-reg" data-reg="${key}">Play all</button></div><div id="rows-host" data-reg="${key}"></div>` : ''}
      ${shelf('Artists', r.artists.slice(0, 12).map(artistCard))}${shelf('Albums', r.albums.slice(0, 12).map(albumCard))}${shelf('Playlists', r.playlists.map(plCard))}
      ${r.genres.length ? `<div class="sec"><h2>Genres</h2></div><div class="actions">${r.genres.map((g) => `<a class="chip" href="#/genre/${g.id}">${esc(g.name)}</a>`).join('')}</div>` : ''}</div>`;
    void top; const host = $('#rows-host', el); if (host) mountRows(host, r.tracks.slice(0, 300));
  };

  V.library = (el, tab) => {
    tab = tab || 'playlists'; const d = L.derive();
    const tabs = ['playlists', 'albums', 'artists', 'genres', 'songs'];
    let body = '';
    if (tab === 'playlists') {
      body = `<div class="grid"><a class="card" href="#/liked"><div class="cover-wrap"><div class="cover ph" style="background:linear-gradient(135deg,#5b3cff,#b57dff)">${icon('heart')}</div><button class="go" data-a="play-ctx" data-kind="liked" data-id="liked">${icon('play')}</button></div><b>Liked Songs</b><small>${L.liked().length} songs</small></a>${L.playlists.map(plCard).join('')}<button class="card" data-a="new-playlist"><div class="cover ph" style="background:var(--glass2)">${icon('plus')}</div><b>Create playlist</b><small>Make your own mix</small></button></div>`;
    } else if (tab === 'albums') body = d.albums.length ? `<div class="grid">${d.albums.map(albumCard).join('')}</div>` : `<div class="empty">${icon('disc')}<div>No albums found. Albums appear when your files have album tags.</div></div>`;
    else if (tab === 'artists') body = `<div class="grid">${d.artists.map(artistCard).join('')}</div>`;
    else if (tab === 'genres') body = d.genres.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${d.genres.map((x, i) => { const h = (i * 53 + 10) % 360; return `<a class="genre-tile" href="#/genre/${x.id}" style="background:linear-gradient(135deg,hsl(${h} 75% 52%),hsl(${(h + 40) % 360} 80% 36%))">${esc(x.name)}<small>${x.tracks.length} songs</small></a>`; }).join('')}</div>` : `<div class="empty">${icon('music')}<div>No genre tags found in your files.</div></div>`;
    else body = '<div id="rows-host"></div>';
    el.innerHTML = `<div class="page"><h1>Your Library</h1><div class="actions">${tabs.map((t) => `<a class="chip${t === tab ? ' on' : ''}" href="#/library/${t}">${t[0].toUpperCase() + t.slice(1)}</a>`).join('')}${tab === 'songs' ? `<span style="flex:1"></span><select class="field" id="sort-by"><option value="title">Title</option><option value="artist">Artist</option><option value="added">Recently added</option><option value="plays">Most played</option><option value="duration">Duration</option><option value="energy">Energy</option></select>` : ''}</div>${L.tracks.length ? body : emptyLib()}</div>`;
    if (tab === 'songs' && L.tracks.length) {
      const sel = $('#sort-by', el), host = $('#rows-host', el), saved = A.store.get('songSort', 'title'); sel.value = saved;
      const draw = () => { const list = sortTracks(L.tracks, sel.value); host.dataset.reg = regCtx(list.map((t) => t.id), { type: 'library', name: 'Your Library' }); mountRows(host, list); };
      sel.onchange = () => { A.store.set('songSort', sel.value); draw(); }; draw();
    }
  };

  V.album = (el, id) => { const a = L.derive().albumById.get(id); if (!a) return V.notfound(el); const ts = L.get(a.tracks); detail(el, { kind: 'Album', title: a.name, sub: `<a href="#/artist/${U.artistId(a.artist)}"><b>${esc(a.artist)}</b></a>${a.year ? ' · ' + a.year : ''}`, tracks: ts, meta: { type: 'album', id, name: a.name }, noAlbum: true }); };
  V.artist = (el, id) => {
    const a = L.derive().artistById.get(id); if (!a) return V.notfound(el); const ts = L.get(a.tracks);
    const albums = L.derive().albums.filter((x) => L.byId.get(x.tracks[0]) && A.norm(L.byId.get(x.tracks[0]).artist) === a.key);
    const top = ts.slice().sort((x, y) => y.plays - x.plays).slice(0, 5);
    detail(el, { kind: 'Artist', title: a.name, sub: `${albums.length} album${albums.length === 1 ? '' : 's'}`, tracks: ts, round: true, meta: { type: 'artist', id, name: a.name }, sortable: true, after: shelf('Albums', albums.map(albumCard)) + (top[0] && top[0].plays ? `<div class="sec"><h2>Most played</h2></div>${top.map((t) => `<div class="faint" style="font-size:13px">${esc(t.title)} · ${t.plays} plays</div>`).join('')}` : '') });
  };
  V.genre = (el, id) => { const g = L.derive().genreById.get(id); if (!g) return V.notfound(el); detail(el, { kind: 'Genre', title: g.name, tracks: L.get(g.tracks), meta: { type: 'genre', id, name: g.name }, sortable: true }); };
  V.mix = (el, id) => { const m = mixes().find((x) => x.id === id); if (!m) return V.notfound(el); detail(el, { kind: 'Made for you', title: m.name, sub: esc(m.sub), tracks: L.get(m.tracks), meta: { type: 'mix', id, name: m.name } }); };
  V.liked = (el) => detail(el, { kind: 'Playlist', title: 'Liked Songs', tracks: L.liked(), meta: { type: 'liked', id: 'liked', name: 'Liked Songs' }, art: '', seed: 'liked', emptyMsg: 'Tap the heart on any song to save it here.', sortable: true });
  V.recent = (el) => { const c = U.ctxOf('recent'); detail(el, { kind: 'History', title: 'Recently played', tracks: L.get(c.ids).slice(0, 150), meta: c.meta, emptyMsg: 'Play something and it’ll show up here.' }); };
  V.playlist = (el, id) => {
    const p = L.playlists.find((x) => x.id === id); if (!p) return V.notfound(el);
    detail(el, { kind: 'Playlist', title: p.name, tracks: L.get(p.tracks), meta: { type: 'playlist', id, name: p.name }, playlist: p, emptyMsg: 'Empty playlist. Use ⋯ on any song → Add to playlist.', sortable: true, extra: `<button class="icon-btn lg" data-a="playlist-menu" data-id="${id}" title="More">${icon('more')}</button><button class="btn ghost sm" data-a="playlist-add" data-id="${id}">${icon('plus')} Add songs</button>` });
  };
  V.notfound = (el) => { el.innerHTML = `<div class="page"><div class="empty">${icon('search')}<div>Couldn’t find that. It may have been removed.</div><a class="btn accent" href="#/">Go home</a></div></div>`; };

  // ---------- DJ page ----------
  const dsel = V.djSel = { vibe: (A.store.get('djLast', {}) || {}).vibe || A.vibeOfDay(), genres: new Set(((A.store.get('djLast', {}) || {}).genres) || []), style: A.store.get('djStyle', 'smooth'), talk: A.store.get('djTalk', 'always') };
  V.dj = (el) => {
    const dj = A.dj, st = A.analysis;
    if (!A.djEnabled()) { el.innerHTML = `<div class="page"><div class="empty"><div class="orb" style="filter:grayscale(1);opacity:.5"></div><h2>AI DJ is turned off</h2><div>Turn it on to get DJ-style sets with spoken intros.</div><button class="btn accent" data-a="toggle-dj">Enable AI DJ</button></div></div>`; return; }
    const note = () => { if (!st.enabled) return ''; const left = st.pendingList().length; return left ? `<div class="banner"><span>${icon('wave')} The DJ is listening to your library to learn each song’s energy &amp; tempo. <b>${L.tracks.length - left}/${L.tracks.length}</b> done. Sets get sharper as this fills up.</span></div>` : ''; };
    if (dj.active) {
      const s = dj.s, S = A.DJ_STYLES[s.style], cur = P.current, ups = P.upcoming.slice(0, 3).map((i) => L.byId.get(i)).filter(Boolean);
      el.innerHTML = `<div class="page"><div class="dj-hero" style="background:linear-gradient(135deg,${s.vibe.g[0]}55,${s.vibe.g[1]}55)"><div class="orb${A.speech.speaking ? ' talk' : ''}" id="big-orb"></div><div style="flex:1;min-width:220px"><div class="faint" style="font-weight:800;letter-spacing:.1em;text-transform:uppercase;font-size:12px">DJ ${esc(S.dj)} · live</div><h1>${esc(s.vibe.name)}</h1><p>${esc(s.vibe.tag)}${s.genres.size ? ' · ' + [...s.genres].map(esc).join(', ') : ''}</p>
        <div class="actions"><button class="btn ghost" data-a="dj-stop">${icon('x')} End set</button></div></div></div>
        <div class="dj-live"><div class="dj-say"><small>${esc(S.dj)} says</small><div id="dj-live-text" style="margin-top:4px;font-weight:550">${cur ? `Now spinning <b>${esc(cur.title)}</b> by ${esc(cur.artist)}.` : ''}</div></div>
        <div class="dj-ctrls"><button class="btn ghost" data-a="dj-nudge" data-id="up">${icon('zap')} Hype it up</button><button class="btn ghost" data-a="dj-nudge" data-id="down">${icon('moon')} Chill it down</button><button class="btn ghost" data-a="dj-nudge" data-id="more">${icon('wave')} More like this</button><button class="btn ghost" data-a="dj-nudge" data-id="change">${icon('shuffle')} Change it up</button><button class="btn ghost" data-a="next">${icon('next')} Skip</button></div>
        <form class="dj-ask" data-a-submit="dj-ask"><input id="dj-ask" placeholder="Ask your DJ: “play some jazz”, “more energy”, “something sad”, an artist…" autocomplete="off"><button class="btn accent" type="submit">Ask</button></form></div>
        <div class="sec"><h2>Switch vibe</h2></div><div class="actions">${A.VIBES.map((v) => `<button class="chip${v.id === s.vibe.id ? ' on' : ''}" data-a="dj-vibe" data-id="${v.id}">${esc(v.name)}</button>`).join('')}</div>
        ${ups.length ? `<div class="sec"><h2>Up next</h2></div>${U.rows(ups, { noAlbum: true }).replace('class="rows', 'data-reg="" class="rows')}` : ''}${note()}</div>`;
      return;
    }
    const topG = L.derive().genres.slice(0, 14);
    el.innerHTML = `<div class="page"><div class="dj-hero"><div class="orb"></div><div style="flex:1;min-width:240px"><h1>AI DJ</h1><p>Pick a vibe. Your DJ reads the mood of every song in your library — energy, tempo, genre — builds a set that flows, and talks you through it like the radio.</p>
      <div class="actions"><button class="btn accent lg" data-a="dj-go">${icon('spark')} Start DJ</button><button class="btn ghost lg" data-a="dj-surprise">Surprise me</button></div></div></div>
      <div class="sec"><h2>1 · Choose a vibe</h2></div><div class="vibes">${A.VIBES.map((v) => `<button class="vibe${v.id === dsel.vibe ? ' on' : ''}" data-a="dj-pick" data-id="${v.id}" style="background:linear-gradient(135deg,${v.g[0]},${v.g[1]})"><b>${esc(v.name)}</b><small>${esc(v.tag)}</small></button>`).join('')}</div>
      ${topG.length ? `<div class="sec"><h2>2 · Narrow by genre <span class="faint" style="font-size:13px;font-weight:500">(optional)</span></h2></div><div class="actions">${topG.map((g) => `<button class="chip${dsel.genres.has(A.norm(g.name)) ? ' on' : ''}" data-a="dj-genre" data-id="${esc(A.norm(g.name))}">${esc(g.name)}</button>`).join('')}</div>` : ''}
      <div class="sec"><h2>${topG.length ? '3' : '2'} · Your DJ</h2></div>
      <div class="panel"><div class="set-row"><div>Style<small>Changes the personality &amp; voice delivery</small></div><div class="seg">${Object.entries(A.DJ_STYLES).map(([k, v]) => `<button class="${dsel.style === k ? 'on' : ''}" data-a="dj-style" data-id="${k}">${v.label} · ${v.dj}</button>`).join('')}</div></div>
      <div class="set-row"><div>Talk time<small>How often the DJ speaks between songs</small></div><div class="seg">${[['always', 'Every song'], ['often', 'Often'], ['rare', 'Rarely'], ['off', 'Music only']].map(([k, l]) => `<button class="${dsel.talk === k ? 'on' : ''}" data-a="dj-talk" data-id="${k}">${l}</button>`).join('')}</div></div></div>
      ${note()}${A.speech.ok ? '' : `<div class="banner"><span>Your browser has no speech synthesis, so the DJ will show captions instead of talking.</span></div>`}</div>`;
  };

  // ---------- stats ----------
  V.stats = (el) => {
    const ts = L.tracks; if (!ts.length) { el.innerHTML = `<div class="page"><h1>Your Stats</h1>${emptyLib()}</div>`; return; }
    const plays = ts.reduce((s, t) => s + t.plays, 0), secs = ts.reduce((s, t) => s + t.plays * t.duration, 0), libSecs = ts.reduce((s, t) => s + t.duration, 0);
    const topT = ts.slice().sort((a, b) => b.plays - a.plays).filter((t) => t.plays).slice(0, 8);
    const am = new Map(), gm = new Map();
    ts.forEach((t) => { if (!t.plays) return; am.set(t.artist, (am.get(t.artist) || 0) + t.plays); if (t.genre) gm.set(t.genre, (gm.get(t.genre) || 0) + t.plays); });
    const topA = [...am].sort((a, b) => b[1] - a[1]).slice(0, 6), topG = [...gm].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const clock = new Array(24).fill(0), days = new Array(14).fill(0), now = Date.now();
    P.hist.forEach(([, at]) => { clock[new Date(at).getHours()]++; const dd = Math.floor((now - at) / 864e5); if (dd < 14) days[13 - dd]++; });
    const mx = (a) => Math.max(1, ...a);
    const an = ts.filter((t) => t.an && t.plays); const avgE = an.length ? an.reduce((s, t) => s + t.an.energy * t.plays, 0) / an.reduce((s, t) => s + t.plays, 0) : null;
    const peak = clock.indexOf(Math.max(...clock)); const night = clock.slice(22).concat(clock.slice(0, 5)).reduce((a, b) => a + b, 0), tot = clock.reduce((a, b) => a + b, 0) || 1;
    let persona = 'Just getting started'; if (tot > 8) persona = night / tot > 0.35 ? 'Night Owl' : peak < 11 ? 'Early Bird' : avgE != null && avgE > 0.62 ? 'Energizer' : avgE != null && avgE < 0.4 ? 'Mellow Soul' : 'Steady Groover';
    const bar = (v, m, lbl) => `<i style="height:${Math.max(3, (v / m) * 100)}%" title="${lbl}: ${v}"></i>`;
    const list = (arr, unit) => arr.length ? arr.map((x, i) => `<div class="set-row" style="padding:8px 0"><span><b style="color:var(--accent);margin-right:10px">${i + 1}</b>${esc(x[0])}</span><span class="muted">${x[1]} ${unit}</span></div>`).join('') : '<div class="muted">Not enough plays yet.</div>';
    el.innerHTML = `<div class="page"><h1>Your Stats</h1><p class="muted">Everything is computed on this device. Nothing is uploaded.</p>
      <div class="stat-grid"><div class="stat"><b>${ts.length}</b><span>songs in library</span></div><div class="stat"><b>${fmtLong(libSecs)}</b><span>of music</span></div><div class="stat"><b>${plays}</b><span>plays</span></div><div class="stat"><b>${fmtLong(secs)}</b><span>listened</span></div><div class="stat"><b style="font-size:26px">${persona}</b><span>your listening personality${avgE != null ? ` · avg energy ${Math.round(avgE * 100)}%` : ''}</span></div></div>
      <div class="panel"><h3>Last 14 days</h3><div class="bars">${days.map((v, i) => bar(v, mx(days), `${13 - i} days ago`)).join('')}</div></div>
      <div class="panel"><h3>Listening clock</h3><div class="bars">${clock.map((v, h) => bar(v, mx(clock), h + ':00')).join('')}</div><div class="bar-lbl">${clock.map((_, h) => `<span>${h % 3 === 0 ? h : ''}</span>`).join('')}</div></div>
      <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))"><div class="panel" style="margin:0"><h3>Top artists</h3>${list(topA, 'plays')}</div><div class="panel" style="margin:0"><h3>Top genres</h3>${list(topG, 'plays')}</div></div>
      <div class="sec"><h2>Top songs</h2></div><div id="rows-host"></div></div>`;
    const host = $('#rows-host', el); host.dataset.reg = regCtx(topT.map((t) => t.id), { type: 'list', name: 'Top songs' }); mountRows(host, topT);
  };

  // ---------- settings ----------
  const sw = (k, on) => `<button class="switch${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-a="toggle-set" data-k="${k}"></button>`;
  V.settings = (el) => {
    const roots = L.roots, st = A.analysis, left = st.pendingList().length, voices = A.speech.voices;
    const cf = E.crossfade, theme = A.store.get('theme', 'dark'), acc = A.store.get('accent', 'dynamic');
    el.innerHTML = `<div class="page"><h1>Settings</h1>
      <div class="panel"><h3>Library</h3>${roots.length ? roots.map((r) => `<div class="root-item">${icon(r.id === 'local' ? 'music' : 'folder')}<b class="ellip">${esc(r.name)}${r.path ? `<small class="muted" style="font-weight:400"> ${esc(r.path)}</small>` : ''}</b><span class="muted">${L.tracks.filter((t) => t.rootId === r.id).length} songs</span>${r.id !== 'local' ? `<button class="btn ghost sm" data-a="rescan" data-id="${r.id}">Rescan</button>` : ''}<button class="icon-btn sm" data-a="remove-root" data-id="${r.id}" title="Remove">${icon('trash')}</button></div>`).join('') : '<p class="muted">No folders yet.</p>'}
        <div class="actions"><button class="btn accent" data-a="add-music">${icon('folder')} Add music</button>${A.isNative || A.isDesktop || window.showDirectoryPicker ? '' : `<button class="btn ghost" data-a="add-files">${icon('upload')} Add files</button>`}<button class="btn danger" data-a="clear-lib">Clear library</button></div>
        ${A.isDesktop || window.AuroraAndroid || window.showDirectoryPicker ? '<p class="faint" style="font-size:13px">Folders are linked, not copied. New songs are picked up when you press Rescan.</p>' : '<p class="faint" style="font-size:13px">This browser can’t keep a live link to a folder, so songs you add are saved inside Aurora’s local storage.</p>'}</div>
      <div class="panel"><h3>Playback</h3>
        <div class="set-row"><div>Crossfade<small>Blend the end of a song into the next</small></div><div class="ctl"><span id="cf-v" class="muted">${cf ? cf + 's' : 'Off'}</span><input class="range" type="range" min="0" max="12" step="1" value="${cf}" data-set="crossfade"></div></div>
        <div class="set-row"><div>Normalize volume<small>Evens out loud and quiet songs</small></div>${sw('normalize', E.normalize)}</div>
        <div class="set-row"><div>Autoplay similar songs<small>Keep playing when your queue runs out</small></div>${sw('autoplay', P.autoplay)}</div>
        <div class="set-row"><div>Find missing album covers online<small>Songs without a picture get one from Apple’s public music catalog (only artist and album names are sent) and it’s saved on this device</small></div>${sw('onlineCovers', A.store.get('onlineCovers', true) !== false)}</div>
        <div class="set-row"><div>Playback speed</div><div class="ctl"><select data-set="speed">${[0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((s) => `<option value="${s}"${s === E.rate ? ' selected' : ''}>${s}x</option>`).join('')}</select></div></div>
        <div class="set-row"><div>Sleep timer<small>${P.sleep ? (P.sleep.end ? 'Stops after this song' : 'Active') : 'Fade out and stop'}</small></div><div class="ctl"><select data-set="sleep"><option value="">Off</option>${[15, 30, 45, 60, 90].map((m) => `<option value="${m}">${m} min</option>`).join('')}<option value="end">End of song</option></select></div></div></div>
      ${E.direct ? '' : `<div class="panel"><h3>Equalizer</h3><div class="actions">${Object.keys(A.EQ_PRESETS).map((n) => `<button class="chip" data-a="eq-preset" data-id="${esc(n)}">${esc(n)}</button>`).join('')}</div><div class="eq">${A.EQ_FREQS.map((f, i) => `<label><input type="range" min="-12" max="12" step="1" value="${E.eqGains[i]}" data-eq="${i}" orient="vertical"><span>${f >= 1000 ? f / 1000 + 'k' : f}</span></label>`).join('')}</div></div>`}
      <div class="panel"><h3>AI DJ</h3>
        <div class="set-row"><div>Enable AI DJ<small>Turn the whole DJ feature on or off. Off hides it everywhere and stops background analysis.</small></div>${sw('djEnabled', A.djEnabled())}</div>
        <div class="set-row"><div>DJ voice<small>Spoken intros between songs</small></div>${sw('djVoiceOn', A.store.get('djVoiceOn', true))}</div>
        <div class="set-row"><div>Voice<small>${A.isNative ? 'Uses your phone’s text-to-speech voice' : `Uses your system’s voices${voices.length ? '' : ' (none found)'}`}</small></div><div class="ctl">${A.isNative ? '' : `<select data-set="djVoice" style="max-width:240px"><option value="">Auto (best available)</option>${voices.map((v) => `<option value="${esc(v.name)}"${v.name === A.store.get('djVoice', '') ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select>`}<button class="btn ghost sm" data-a="test-voice">Test</button></div></div>
        <div class="set-row"><div>Vibe analysis<small>${left ? `Analyzing… ${L.tracks.length - left}/${L.tracks.length}` : 'All songs analyzed'} · reads energy &amp; tempo locally</small></div><div class="ctl">${left ? '' : '<button class="btn ghost sm" data-a="reanalyze">Redo</button>'}${sw('analyze', st.enabled)}</div></div>
        <div class="set-row"><div>Smarter DJ lines (optional)<small>Paste an Anthropic API key to have Claude write the DJ’s patter. Only song titles are sent. Stored on this device only.</small></div><div class="ctl"><input type="password" class="field" id="ai-key" placeholder="sk-ant-…" value="${esc(A.store.get('aiKey', ''))}" style="width:200px"></div></div></div>
      <div class="panel"><h3>Appearance</h3>
        <div class="set-row"><div>Theme</div><div class="seg">${['dark', 'light'].map((t) => `<button class="${theme === t ? 'on' : ''}" data-a="set-theme" data-id="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <div class="set-row"><div>Accent color<small>Dynamic follows the album artwork</small></div><div class="colors"><button class="chip${acc === 'dynamic' ? ' on' : ''}" data-a="set-accent" data-id="dynamic">Dynamic</button>${Object.entries(U.ACCENTS).map(([k, c]) => `<button class="swatch${acc === k ? ' on' : ''}" data-a="set-accent" data-id="${k}" style="background:rgb(${c})" title="${k}"></button>`).join('')}</div></div>
        <div class="set-row"><div>Glass blur<small>Lower is lighter on older devices</small></div><input class="range" type="range" min="6" max="48" value="${A.store.get('blur', 26)}" data-set="blur"></div>
        <div class="set-row"><div>Animated background</div>${sw('bgAnim', A.store.get('bgAnim', true))}</div></div>
      ${A.isNative ? `<div class="panel"><h3>Notification player</h3><div class="set-row"><div>Playback controls<small id="nt-status">Checking…</small></div><div class="ctl"><button class="btn ghost sm" data-a="nt-perm">Allow</button><button class="btn ghost sm" data-a="nt-settings">Open settings</button></div></div><p class="faint" style="font-size:13px;margin:6px 0 0">Shows the player in the notification bar, on the lock screen and in Samsung’s media panel while a song plays.</p></div>` : ''}
      <div class="panel"><h3>Cloud updates</h3>
        <div class="set-row"><div>Version<small id="up-status">${esc(A.updater.status || `Aurora v${A.VERSION.name} (build ${A.VERSION.build})`)}</small></div><div class="ctl"><button class="btn ghost sm" data-a="check-update">Check for updates</button></div></div>
        <div class="set-row"><div>Check automatically<small>When the app opens, you’ll be asked before anything is installed</small></div>${sw('autoUpdate', A.store.get('autoUpdate', true) !== false)}</div></div>
      <div class="panel"><h3>Reset</h3><div class="set-row"><div>Reset to defaults<small>Puts every setting back to how it was on first launch (theme, equalizer, crossfade, DJ options, API key…). Your songs, playlists, likes and history are kept.</small></div><button class="btn danger sm" data-a="reset-defaults">Reset to defaults</button></div></div>
      <div class="panel"><h3>Backup</h3><p class="muted" style="margin:0 0 10px">Playlists, likes, play counts and settings. Music files are not included.</p><div class="actions" style="padding:0"><button class="btn ghost" data-a="export">${icon('download')} Export</button><button class="btn ghost" data-a="import">${icon('upload')} Import</button></div></div>
      <div class="panel"><h3>Keyboard shortcuts</h3><div class="kbd-grid">${[['Play / pause', 'Space'], ['Next / previous', 'Shift + → / ←'], ['Seek ±5s', '→ / ←'], ['Volume', '↑ / ↓'], ['Mute', 'M'], ['Like', 'L'], ['Shuffle', 'S'], ['Repeat', 'R'], ['Queue', 'Q'], ['Lyrics', 'Y'], ['Now playing', 'F'], ['Search', '/ or Ctrl+K'], ['AI DJ', 'D']].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div></div>
      <p class="faint" style="text-align:center">Aurora ${esc(A.VERSION.name)} · made for local music</p></div>`;
    // direct bindings
    $$('[data-set]', el).forEach((c) => {
      const k = c.dataset.set;
      c.addEventListener('input', () => {
        const v = c.value;
        if (k === 'crossfade') { E.setCrossfade(+v); $('#cf-v', el).textContent = +v ? v + 's' : 'Off'; }
        else if (k === 'blur') { A.store.set('blur', +v); document.documentElement.style.setProperty('--blur', v + 'px'); }
      });
      c.addEventListener('change', () => {
        const v = c.value;
        if (k === 'speed') E.setRate(+v); else if (k === 'sleep') { P.setSleep(v === 'end' ? 'end' : v ? +v : null); A.toast(v ? 'Sleep timer set' : 'Sleep timer off'); }
        else if (k === 'djVoice') A.store.set('djVoice', v);
      });
    });
    $$('[data-eq]', el).forEach((c) => c.addEventListener('input', () => E.setEQ(+c.dataset.eq, +c.value)));
    if (A.isNative) {
      const nt = $('#nt-status', el);
      if (nt) { const s = A.native.status(); nt.textContent = !s ? 'Unavailable' : s.permission && s.enabled ? 'On. Controls appear while music plays.' : 'Off. Tap Allow, or open settings and switch notifications on for Aurora.'; }
    }
    const ups = () => { const s = $('#up-status', el); if (s && A.updater.status) s.textContent = A.updater.status; };
    A.updater.listeners.clear(); A.updater.listeners.add(ups);
    const key = $('#ai-key', el); if (key) key.addEventListener('change', () => { A.store.set('aiKey', key.value.trim()); A.toast(key.value.trim() ? 'API key saved on this device' : 'API key removed'); });
  };

  // ---------- router ----------
  const routes = { '': V.home, search: V.search, library: V.library, album: V.album, artist: V.artist, genre: V.genre, mix: V.mix, liked: V.liked, recent: V.recent, playlist: V.playlist, dj: V.dj, stats: V.stats, settings: V.settings };
  A.route = { name: 'home', arg: '' };
  A.render = (soft) => {
    const raw = (location.hash || '#/').replace(/^#\/?/, ''); const [name, ...rest] = raw.split('/'); const arg = rest.join('/');
    const el = $('#view'); const top = soft ? el.scrollTop : 0;
    reg.clear(); regN = 0; A.route = { name: name || 'home', arg };
    if (name !== 'search' && $('#q').value && document.activeElement !== $('#q')) $('#q').value = '';
    try { (routes[name] || V.notfound)(el, arg); }
    catch (e) { console.error('render error', e); el.innerHTML = `<div class="page"><div class="empty">${icon('info')}<div>Something went wrong showing this page.</div><a class="btn accent" href="#/">Back to Home</a></div></div>`; }
    if (soft) { el.querySelectorAll('.page').forEach((p) => (p.style.animation = 'none')); el.scrollTop = top; } else el.scrollTop = 0;
    $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === (name || 'home') || (name === 'liked' && a.dataset.nav === 'library')));
    document.body.dataset.route = name || 'home';
    renderSidePlaylists();
  };
  function renderSidePlaylists() {
    const host = $('#side-playlists'); if (!host) return;
    const cur = A.route.name === 'playlist' ? A.route.arg : A.route.name === 'liked' ? 'liked' : '';
    host.innerHTML = `<a class="pl-item${cur === 'liked' ? ' on' : ''}" href="#/liked"><div class="cover ph" style="background:linear-gradient(135deg,#5b3cff,#b57dff)">${icon('heart')}</div><div><b>Liked Songs</b><small>${L.liked().length} songs</small></div></a>` +
      L.playlists.map((p) => `<a class="pl-item${cur === p.id ? ' on' : ''}" href="#/playlist/${p.id}">${L.coverHTML(L.artFor(p), p.id)}<div><b>${esc(p.name)}</b><small>${p.tracks.length} songs</small></div></a>`).join('');
  }
  A.renderSidePlaylists = renderSidePlaylists;
})(window.A);

