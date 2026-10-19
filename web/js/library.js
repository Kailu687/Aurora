/* Aurora - library: scanning, persistence, collections, playlists */
(function (A) {
  const isDesktop = !!(window.desktop && window.desktop.isDesktop);
  A.isDesktop = isDesktop;
  A.desktopUrl = (p) => 'app://local/__lib/' + encodeURIComponent(p);

  const L = A.lib = {
    tracks: [], byId: new Map(), artUrls: new Map(), roots: [], playlists: A.store.get('playlists', []),
    _cache: null, listeners: new Set(), scanning: false
  };
  L.on = (fn) => L.listeners.add(fn);
  const changed = () => { L._cache = null; L.listeners.forEach((f) => f()); };
  L.changed = changed;

  // ---------- load ----------
  L.load = async function () {
    const [tracks, roots, arts, artKeys] = await Promise.all([A.db.getAll('tracks'), A.db.getAll('roots'), A.db.getAll('art'), A.db.keys('art')]);
    L.tracks = tracks; L.byId = new Map(tracks.map((t) => [t.id, t])); L.roots = roots;
    arts.forEach((b, i) => L.artUrls.set(artKeys[i], URL.createObjectURL(b)));
    changed();
  };

  const saveQueue = new Set(); let saveT;
  L.touch = (t) => { saveQueue.add(t.id); clearTimeout(saveT); saveT = setTimeout(flush, 800); };
  async function flush() {
    const ids = [...saveQueue]; saveQueue.clear();
    const vals = ids.map((i) => L.byId.get(i)).filter(Boolean);
    if (vals.length) await A.db.putMany('tracks', vals);
  }
  window.addEventListener('pagehide', flush);
  L.savePlaylists = () => A.store.set('playlists', L.playlists);

  // ---------- art ----------
  L.artUrl = (t) => (t && t.artKey ? L.artUrls.get(t.artKey) || '' : '');
  // If a cover fails to display from its blob URL, re-encode it as a data URL (always works in WebViews)
  L.coverFail = async (img) => {
    if (img._fb) return; img._fb = 1; const src = img.currentSrc || img.src; let key = null;
    for (const [k, u] of L.artUrls) if (u === src) { key = k; break; }
    A.log('cover failed to load, retrying as data URL: ' + (key || String(src).slice(0, 40))); if (!key) return;
    const blob = await A.db.get('art', key); if (!blob) return;
    const d = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
    if (d) { L.artUrls.set(key, d); img.src = d; }
  };
  L.artFor = (item) => { // album/artist/playlist objects -> first track with art
    const ts = item.tracks || []; for (const id of ts) { const t = typeof id === 'string' ? L.byId.get(id) : id; const u = t && L.artUrl(t); if (u) return u; } return '';
  };
  L.coverHTML = (url, seed, cls = '') => url
    ? `<div class="cover ${cls}"><img decoding="async" src="${url}" alt="" onerror="A.lib.coverFail(this)"></div>`
    : `<div class="cover ph ${cls}" style="${A.coverStyle(seed)}">${A.icon('music')}</div>`;

  // ---------- sources ----------
  async function ensureAccess(h, mode = 'read') {
    if (!h || !h.queryPermission) return true;
    if ((await h.queryPermission({ mode })) === 'granted') return true;
    return (await h.requestPermission({ mode })) === 'granted';
  }
  L.reconnectNeeded = async () => {
    if (window.AuroraAndroid) for (const r of L.roots) if (r.saf && !window.AuroraAndroid.hasAccess(r.uri)) return true;
    for (const r of L.roots) if (r.handle && (await r.handle.queryPermission({ mode: 'read' })) !== 'granted') return true;
    return false;
  };
  L.reconnect = async () => { if (window.AuroraAndroid && L.roots.some((r) => r.saf)) { await L.addAndroidFolder(); return; } for (const r of L.roots) if (r.handle) await ensureAccess(r.handle).catch(() => {}); };

  // ----- Android: music folder linked through the Storage Access Framework (served by the app at /_media/) -----
  const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  A.safUrl = (uri) => location.origin + '/_media/' + b64url(uri);
  const mediaUrl = (t, p) => (t.kind === 'saf' ? A.safUrl(p) : A.desktopUrl(p));
  L.pickAndroidFolder = () => new Promise((res) => { A._folderRes = res; A.log('saf: opening folder picker'); const r = window.AuroraAndroid.pickFolder(); if (r !== 'ok') { A._folderRes = null; res(null); } });
  L.addAndroidFolder = async function (onProgress) {
    const d = await L.pickAndroidFolder(); if (!d) return 0;
    if (d.error) throw new Error(d.error);
    return L.scanSafRoot({ id: 's_' + A.hash(d.uri), name: d.name, uri: d.uri, saf: true }, onProgress);
  };
  L.scanSafRoot = async function (root, onProgress) {
    if (!L.roots.find((r) => r.id === root.id)) { L.roots.push(root); await A.db.put('roots', root); }
    A.log('saf: scanning ' + root.name); A.progressNote && A.progressNote('Scanning folder…');
    const t0 = Date.now(); const raw = window.AuroraAndroid.scan(root.uri);
    A.log(`saf: scan returned ${String(raw).length} chars in ${Date.now() - t0} ms`);
    if (/^error/.test(raw)) throw new Error(raw);
    const list = JSON.parse(raw), lrcs = new Map();
    A.log('saf: ' + list.length + ' files found'); A.progressNote && A.progressNote(`Found ${list.length} files, reading tags…`);
    list.filter((f) => /\.lrc$/i.test(f.name)).forEach((f) => lrcs.set(f.rel.replace(/\.[^.]+$/, '').toLowerCase(), f.uri));
    const dirOf = (rel) => rel.slice(0, rel.lastIndexOf('/') + 1), covers = new Map();
    list.filter((f) => /\.(jpe?g|png)$/i.test(f.name)).forEach((f) => { if (!covers.has(dirOf(f.rel))) covers.set(dirOf(f.rel), f.uri); });
    const items = list.filter((f) => A.AUDIO_EXT.test(f.name)).map((f) => ({
      id: 't' + A.hash(f.uri + '|' + f.size), kind: 'saf', path: f.uri, name: f.name, size: f.size, rootId: root.id, rel: f.rel,
      lrc: lrcs.get(f.rel.replace(/\.[^.]+$/, '').toLowerCase()) || null, cover: covers.get(dirOf(f.rel)) || null,
      getSource: async () => A.urlSource(A.safUrl(f.uri), f.size, f.name), getUrl: async () => A.safUrl(f.uri)
    }));
    return finishScan(root, items, onProgress);
  };

  L.fileFor = async function (t) {
    if (t.kind === 'handle') {
      let ok = (await t.handle.queryPermission({ mode: 'read' })) === 'granted';
      if (!ok) { const root = L.roots.find((r) => r.id === t.rootId); if (root) await ensureAccess(root.handle).catch(() => {}); ok = await ensureAccess(t.handle); }
      if (!ok) throw new Error('Permission denied for ' + t.title);
      return t.handle.getFile();
    }
    if (t.kind === 'blob') { const f = await A.db.get('files', t.id); if (!f) throw new Error('File missing'); return f; }
    throw new Error('no file');
  };
  L.urlFor = async function (t) {
    if (t.kind === 'path') return A.desktopUrl(t.path);
    if (t.kind === 'saf') return A.safUrl(t.path);
    return URL.createObjectURL(await L.fileFor(t));
  };
  L.sourceFor = async function (t) {
    if (t.kind === 'path') return A.urlSource(A.desktopUrl(t.path), t.size, t.name);
    if (t.kind === 'saf') return A.urlSource(A.safUrl(t.path), t.size, t.name);
    return A.blobSource(await L.fileFor(t), t.name);
  };

  // ---------- ingest ----------
  // Fast path: songs show up in the library immediately (title/artist guessed from the file name).
  // Tags, cover art and durations are then read quietly in the background (L.enrich), never blocking the UI.
  async function ingest(items, onProgress) {
    const fresh = items.filter((i) => !L.byId.has(i.id));
    const recs = [];
    for (const it of fresh) {
      const fn = A.fromFilename(it.name);
      const t = {
        id: it.id, title: fn.title, artist: fn.artist || 'Unknown Artist', albumArtist: '', album: '', genre: '', year: 0, track: 0, duration: 0, artKey: '',
        kind: it.kind, handle: it.handle || null, path: it.path || '', rootId: it.rootId, rel: it.rel || '', name: it.name, size: it.size,
        added: Date.now() - (recs.length % 1000), plays: 0, last: 0, liked: 0, an: null, lrc: it.lrc || null, cover: it.cover || null, lyrics: '', meta: 0
      };
      if (it.kind === 'blob' && it.blob) await A.db.put('files', it.blob, it.id);
      L.tracks.push(t); L.byId.set(t.id, t); recs.push(t);
    }
    if (recs.length) await A.db.putMany('tracks', recs);
    changed();
    if (onProgress) onProgress(items.length, items.length);
    A.log(`library: added ${recs.length} songs instantly, reading tags in the background`);
    setTimeout(() => L.enrich(), 300);
    return fresh.length;
  }


  // ----- online cover lookup: used only when a file has no embedded picture (Apple's public search catalog) -----
  A._http = A._http || new Map(); let httpN = 0;
  const b64ToBlob = (b64, type) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  const nativeGet = (url, binary) => new Promise((res, rej) => {
    const id = 'h' + (++httpN); A._http.set(id, { res, rej });
    const r = window.AuroraAndroid.httpGet(id, url, !!binary); if (r !== 'ok') { A._http.delete(id); return rej(new Error(r)); }
    setTimeout(() => { if (A._http.has(id)) { A._http.delete(id); rej(new Error('timeout')); } }, 25000);
  });
  A.httpText = async (url) => { if (window.AuroraAndroid && window.AuroraAndroid.httpGet) return nativeGet(url, false); const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
  A.httpBlob = async (url) => { if (window.AuroraAndroid && window.AuroraAndroid.httpGet) return b64ToBlob(await nativeGet(url, true), 'image/jpeg'); const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); };
  A.onlineCover = async (t) => {
    const artist = (t.albumArtist || t.artist || '').split(/[;,&]/)[0].trim(), title = t.title || '';
    const term = encodeURIComponent(`${artist === 'Unknown Artist' ? '' : artist} ${t.album || title}`.trim());
    const j = JSON.parse(await A.httpText(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=8`)), res = j.results || [];
    // strict match: letters-only comparison of title and artist (so "A.R. Rahman" == "A. R. Rahman")
    const sq = (s) => A.norm(s || '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
    const nt = sq(title), na = sq(String(artist).split(/[;,&]/)[0]), nal = sq(t.album);
    const artistOk = (r) => { const x = sq(r.artistName); return na && x && (x.includes(na) || na.includes(x)); };
    const hit = res.find((r) => nt.length > 2 && sq(r.trackName).includes(nt) && artistOk(r)) || (nal.length > 2 ? res.find((r) => sq(r.collectionName).includes(nal) && artistOk(r)) : null);
    if (!hit || !hit.artworkUrl100) return null;
    return A.httpBlob(hit.artworkUrl100.replace(/\d+x\d+bb/, '600x600bb'));
  };
  L.covering = null; let coverBusy = false;
  L.fetchCovers = async function () {
    if (coverBusy || A.store.get('onlineCovers', true) === false || !navigator.onLine) return;
    const need = L.tracks.filter((t) => !t.artKey && t.meta !== 0 && !t.coverTried); if (!need.length) return;
    coverBusy = true;
    try {
      const groups = new Map();
      for (const t of need) { const a1 = (t.albumArtist || t.artist || '').split(/[;,&]/)[0].trim(), k = A.norm(a1) + '|' + (t.album ? A.norm(t.album) : A.norm(t.title)); (groups.get(k) || groups.set(k, []).get(k)).push(t); }
      let done = 0, fails = 0, found = 0; const total = groups.size; L.covering = { done: 0, total }; notifyEnrich();
      for (const [k, ts] of groups) {
        let blob = null, failed = false;
        try { blob = await A.onlineCover(ts[0]); } catch (e) { failed = true; fails++; A.log('cover lookup failed: ' + (e && e.message || e)); }
        if (blob) { const small = await A.shrinkCover(blob, 400); if (small) { const key = 'o' + A.hash(k); await A.db.put('art', small, key); L.artUrls.set(key, URL.createObjectURL(small)); ts.forEach((t) => { t.artKey = key; }); found++; } }
        if (!failed) ts.forEach((t) => { t.coverTried = 1; L.touch(t); }); else ts.forEach((t) => L.touch(t));
        done++; L.covering = { done, total }; notifyEnrich(); if (done % 4 === 0) changed();
        if (fails >= 3) { A.log('cover lookup paused (network?)'); break; }
        await A.sleep(650);
      }
      changed(); A.log(`covers: ${found} of ${total} albums found online`);
    } finally { coverBusy = false; L.covering = null; notifyEnrich(); }
  };
  L.enriching = null; L.enrichListeners = new Set();
  let enrichRun = false;
  const notifyEnrich = () => L.enrichListeners.forEach((f) => f());
  L.enrich = async function () {
    if (enrichRun) return; enrichRun = true;
    try {
      const pending = L.tracks.filter((t) => t.meta === 0); const total = pending.length; if (!total) return;
      let done = 0, idx = 0, lastUi = 0;
      L.enriching = { done: 0, total }; notifyEnrich();
      const worker = async () => {
        while (idx < pending.length) {
          const t = pending[idx++];
          try {
            const m = await A.readMeta(await L.sourceFor(t));
            if (!m.duration) { const u = await L.urlFor(t); m.duration = await A.probeDuration(u); if (u.startsWith('blob:')) URL.revokeObjectURL(u); }
            let artKey = '';
            if (!m.art && t.cover && t.kind === 'saf') { const fk = 'f' + A.hash(t.cover); if (L.artUrls.has(fk)) artKey = fk; else { try { m.art = await (await fetch(A.safUrl(t.cover))).blob(); m._fk = fk; } catch { /* no folder cover */ } } }
            if (m.art) {
              artKey = m._fk || (m.album ? A.hash(A.norm(m.albumArtist || m.artist) + '|' + A.norm(m.album)) : t.id);
              if (!L.artUrls.has(artKey)) {
                const small = await A.shrinkCover(m.art, 400);
                if (small) { await A.db.put('art', small, artKey); L.artUrls.set(artKey, URL.createObjectURL(small)); } else artKey = '';
              }
            }
            Object.assign(t, { title: m.title || t.title, artist: m.artist || t.artist, albumArtist: m.albumArtist || '', album: m.album || '', genre: m.genre || '', year: m.year || 0, track: m.track || 0, duration: m.duration || 0, artKey, lyrics: m.lyrics || '' });
          } catch (e) { console.warn('tags', t.name, e); }
          t.meta = 1; L.touch(t); done++; L.enriching = { done, total };
          if (Date.now() - lastUi > 1500) { lastUi = Date.now(); changed(); notifyEnrich(); await A.idle(); }
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
      changed(); A.log(`library: tags read for ${done} songs`); setTimeout(() => L.fetchCovers(), 500);
    } finally { enrichRun = false; L.enriching = null; notifyEnrich(); }
  };
  // ---------- desktop (Electron) ----------
  L.addDesktopFolder = async function (onProgress) {
    const dir = await window.desktop.pickFolder(); if (!dir) return 0;
    return L.scanDesktopRoot({ id: 'd_' + A.hash(dir), name: dir.split(/[\\/]/).pop() || dir, path: dir }, onProgress);
  };
  L.scanDesktopRoot = async function (root, onProgress) {
    if (!L.roots.find((r) => r.id === root.id)) { L.roots.push(root); await A.db.put('roots', root); }
    const list = await window.desktop.scan(root.path);
    const items = list.map((f) => ({
      id: 't' + A.hash(f.path + '|' + f.size), kind: 'path', path: f.path, name: f.name, size: f.size, rootId: root.id, rel: f.rel, lrc: f.lrc || null,
      getSource: async () => A.urlSource(A.desktopUrl(f.path), f.size, f.name), getUrl: async () => A.desktopUrl(f.path)
    }));
    return finishScan(root, items, onProgress);
  };

  // ---------- File System Access (Chromium) ----------
  L.addFolderHandle = async function (onProgress) {
    const dir = await window.showDirectoryPicker({ mode: 'read', id: 'aurora-music' });
    const root = { id: 'h_' + A.hash(dir.name + Date.now()), name: dir.name, handle: dir };
    for (const r of L.roots) if (r.handle && (await r.handle.isSameEntry(dir).catch(() => false))) { return L.rescan(r, onProgress); }
    L.roots.push(root); await A.db.put('roots', root);
    return L.rescan(root, onProgress);
  };
  L.addDroppedDir = async function (dir, onProgress) {
    for (const r of L.roots) if (r.handle && (await r.handle.isSameEntry(dir).catch(() => false))) return L.rescan(r, onProgress);
    const root = { id: 'h_' + A.hash(dir.name + Date.now()), name: dir.name, handle: dir };
    L.roots.push(root); await A.db.put('roots', root);
    return L.rescan(root, onProgress);
  };
  async function* walk(dir, prefix) {
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.')) continue;
      if (h.kind === 'directory') yield* walk(h, prefix + name + '/'); else yield { h, rel: prefix + name };
    }
  }
  L.rescan = async function (root, onProgress) {
    if (L.scanning) return 0; L.scanning = true;
    try {
      if (root.saf) return await L.scanSafRoot(root, onProgress);
      if (isDesktop) return await L.scanDesktopRoot(root, onProgress);
      if (!(await ensureAccess(root.handle))) { A.toast('Permission needed to read ' + root.name); return 0; }
      const files = [], lrcs = new Map();
      for await (const f of walk(root.handle, '')) {
        if (A.AUDIO_EXT.test(f.rel)) files.push(f);
        else if (/\.lrc$/i.test(f.rel)) lrcs.set(f.rel.replace(/\.[^.]+$/, '').toLowerCase(), f.h);
      }
      const items = [];
      for (const f of files) {
        const file = await f.h.getFile();
        const it = {
          id: 't' + A.hash(root.id + '/' + f.rel + '|' + file.size), kind: 'handle', handle: f.h, name: f.rel.split('/').pop(), size: file.size, rootId: root.id, rel: f.rel,
          lrc: lrcs.get(f.rel.replace(/\.[^.]+$/, '').toLowerCase()) || null,
          getSource: async () => A.blobSource(await f.h.getFile(), f.rel.split('/').pop()), getUrl: async () => URL.createObjectURL(await f.h.getFile())
        };
        const ex = L.byId.get(it.id); if (ex) { ex.handle = f.h; ex.lrc = it.lrc; }
        items.push(it);
      }
      return await finishScan(root, items, onProgress);
    } finally { L.scanning = false; }
  };
  async function finishScan(root, items, onProgress) {
    const n = await ingest(items, onProgress);
    const seen = new Set(items.map((i) => i.id));
    const gone = L.tracks.filter((t) => t.rootId === root.id && !seen.has(t.id));
    if (gone.length && items.length) await L.remove(gone.map((t) => t.id), true);
    return n;
  }

  // ---------- plain files (phones, other browsers) ----------
  L.addFiles = async function (fileList, onProgress) {
    const files = [...fileList].filter((f) => A.AUDIO_EXT.test(f.name) || f.type.startsWith('audio/'));
    const lrcs = new Map([...fileList].filter((f) => /\.lrc$/i.test(f.name)).map((f) => [f.name.replace(/\.[^.]+$/, '').toLowerCase(), f]));
    if (!L.roots.find((r) => r.id === 'local')) { const r = { id: 'local', name: 'Imported files' }; L.roots.push(r); await A.db.put('roots', r); }
    const items = files.map((f) => ({
      id: 't' + A.hash(f.name + '|' + f.size + '|' + f.lastModified), kind: 'blob', blob: f, name: f.name, size: f.size, rootId: 'local', rel: f.webkitRelativePath || f.name,
      lrc: lrcs.get(f.name.replace(/\.[^.]+$/, '').toLowerCase()) || null,
      getSource: async () => A.blobSource(f, f.name), getUrl: async () => URL.createObjectURL(f)
    }));
    for (const it of items) if (it.lrc) { const txt = await it.lrc.text(); await A.db.put('kv', txt, 'lrc:' + it.id); it.lrc = null; }
    return ingest(items, onProgress);
  };

  L.remove = async function (ids, silent) {
    const set = new Set(ids);
    L.tracks = L.tracks.filter((t) => !set.has(t.id)); ids.forEach((i) => L.byId.delete(i));
    await A.db.delMany('tracks', ids); await A.db.delMany('files', ids);
    L.playlists.forEach((p) => { p.tracks = p.tracks.filter((i) => !set.has(i)); }); L.savePlaylists();
    if (!silent) changed(); else L._cache = null;
  };
  L.removeRoot = async function (root) {
    await L.remove(L.tracks.filter((t) => t.rootId === root.id).map((t) => t.id), true);
    L.roots = L.roots.filter((r) => r.id !== root.id); await A.db.del('roots', root.id); changed();
  };
  L.clearAll = async function () {
    await Promise.all(['tracks', 'art', 'files', 'roots'].map((s) => A.db.clear(s)));
    L.tracks = []; L.byId.clear(); L.roots = []; L.artUrls.forEach((u) => URL.revokeObjectURL(u)); L.artUrls.clear(); changed();
  };

  // ---------- derived collections ----------
  L.derive = function () {
    if (L._cache) return L._cache;
    const albums = new Map(), artists = new Map(), genres = new Map();
    for (const t of L.tracks) {
      if (t.album) {
        const k = A.norm((t.albumArtist || t.artist) + '|' + t.album);
        let a = albums.get(k); if (!a) albums.set(k, (a = { key: k, id: 'al' + A.hash(k), name: t.album, artist: t.albumArtist || t.artist, year: t.year, tracks: [] }));
        a.tracks.push(t.id); if (t.year && !a.year) a.year = t.year;
      }
      for (const nm of A.splitArtists(t.artist)) {
        const an = A.artistKey(nm);
        let ar = artists.get(an); if (!ar) artists.set(an, (ar = { key: A.norm(nm), id: 'ar' + A.hash(an), name: nm, tracks: [] }));
        if (ar.tracks[ar.tracks.length - 1] !== t.id) ar.tracks.push(t.id);
      }
      if (t.genre) { const gk = A.norm(t.genre); let g = genres.get(gk); if (!g) genres.set(gk, (g = { key: gk, id: 'g' + A.hash(gk), name: t.genre, tracks: [] })); g.tracks.push(t.id); }
    }
    albums.forEach((a) => a.tracks.sort((x, y) => (L.byId.get(x).track || 999) - (L.byId.get(y).track || 999) || L.byId.get(x).title.localeCompare(L.byId.get(y).title)));
    const dArr = (m) => [...m.values()];
    L._cache = {
      albums: dArr(albums).sort((a, b) => a.name.localeCompare(b.name)),
      artists: dArr(artists).sort((a, b) => a.name.localeCompare(b.name)),
      genres: dArr(genres).sort((a, b) => b.tracks.length - a.tracks.length)
    };
    L._cache.albumById = new Map(L._cache.albums.map((a) => [a.id, a]));
    L._cache.artistById = new Map(L._cache.artists.map((a) => [a.id, a]));
    L._cache.genreById = new Map(L._cache.genres.map((a) => [a.id, a]));
    return L._cache;
  };
  L.get = (ids) => ids.map((i) => L.byId.get(i)).filter(Boolean);
  L.liked = () => L.tracks.filter((t) => t.liked).sort((a, b) => b.liked - a.liked);
  L.recent = (n = 20) => L.tracks.filter((t) => t.last).sort((a, b) => b.last - a.last).slice(0, n);
  L.recentlyAdded = (n = 20) => L.tracks.slice().sort((a, b) => b.added - a.added).slice(0, n);
  L.toggleLike = (t) => { t.liked = t.liked ? 0 : Date.now(); L.touch(t); L.listeners.forEach((f) => f('like', t)); return !!t.liked; };

  L.search = function (q) {
    q = A.norm(q.trim()); if (!q) return null;
    const words = q.split(/\s+/);
    const hit = (s) => words.every((w) => s.includes(w));
    const d = L.derive();
    const tracks = L.tracks.filter((t) => hit(A.norm(t.title + ' ' + t.artist + ' ' + t.album + ' ' + t.genre)));
    tracks.sort((a, b) => (A.norm(b.title).startsWith(q) ? 1 : 0) - (A.norm(a.title).startsWith(q) ? 1 : 0) || b.plays - a.plays);
    return {
      tracks, albums: d.albums.filter((a) => hit(A.norm(a.name + ' ' + a.artist))), artists: d.artists.filter((a) => hit(a.key)),
      playlists: L.playlists.filter((p) => hit(A.norm(p.name))), genres: d.genres.filter((g) => hit(g.key))
    };
  };

  // ---------- playlists ----------
  L.newPlaylist = (name, ids = []) => { const p = { id: 'p' + A.uid(), name: name || 'New playlist', tracks: ids.slice(), created: Date.now() }; L.playlists.unshift(p); L.savePlaylists(); changed(); return p; };
  L.addToPlaylist = (p, ids) => { let n = 0; ids.forEach((i) => { if (!p.tracks.includes(i)) { p.tracks.push(i); n++; } }); L.savePlaylists(); changed(); return n; };
  L.removeFromPlaylist = (p, id) => { p.tracks = p.tracks.filter((i) => i !== id); L.savePlaylists(); changed(); };
  L.deletePlaylist = (p) => { L.playlists = L.playlists.filter((x) => x !== p); L.savePlaylists(); changed(); };

  // ---------- lyrics ----------
  L.lyricsFor = async function (t) {
    try {
      const mine = await A.db.get('kv', 'lrc:' + t.id);
      let text = mine || '';
      if (!text && t.lrc) {
        if (typeof t.lrc === 'string') text = await (await fetch(mediaUrl(t, t.lrc))).text();
        else if (t.lrc.getFile) { if (await ensureAccess(t.lrc).catch(() => false)) text = await (await t.lrc.getFile()).text(); }
      }
      if (!text && t.lyrics) text = t.lyrics;
      return text ? A.parseLRC(text) : null;
    } catch { return null; }
  };
  L.saveLyrics = async (t, text) => { if (text.trim()) await A.db.put('kv', text, 'lrc:' + t.id); else await A.db.del('kv', 'lrc:' + t.id); };

  // ---------- smart mixes ----------
  function seeded(seed) { let s = parseInt(A.hash(seed).slice(0, 7), 36) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  L.mixes = function () {
    if (L.tracks.length < 6) return [];
    const day = new Date().toISOString().slice(0, 10), out = [];
    const sample = (arr, n, key) => { const r = seeded(day + key); return arr.map((t) => [r(), t]).sort((a, b) => a[0] - b[0]).slice(0, n).map((x) => x[1]); };
    const d = L.derive();
    const groups = (d.genres.length >= 2 ? d.genres : d.artists).filter((g) => g.tracks.length >= 4).slice(0, 4);
    groups.forEach((g, i) => out.push({ id: 'mix-dm' + i, name: `Daily Mix ${i + 1}`, sub: g.name, tracks: sample(g.tracks, 40, g.key).map((x) => x.id || x) }));
    const played = L.tracks.filter((t) => t.plays > 0).sort((a, b) => b.plays - a.plays);
    if (played.length >= 4) out.push({ id: 'mix-repeat', name: 'On Repeat', sub: 'Songs you can’t stop playing', tracks: played.slice(0, 40).map((t) => t.id) });
    const fresh = L.tracks.filter((t) => !t.plays);
    if (fresh.length >= 6) out.push({ id: 'mix-discover', name: 'Rediscover', sub: 'Songs you haven’t heard yet', tracks: sample(fresh, 40, 'disc').map((t) => t.id) });
    const an = L.tracks.filter((t) => t.an);
    const calm = an.filter((t) => t.an.energy < 0.38), hype = an.filter((t) => t.an.energy > 0.68);
    if (calm.length >= 5) out.push({ id: 'mix-calm', name: 'Chill Mix', sub: 'Low energy, high comfort', tracks: sample(calm, 40, 'calm').map((t) => t.id) });
    if (hype.length >= 5) out.push({ id: 'mix-hype', name: 'Power Mix', sub: 'High energy only', tracks: sample(hype, 40, 'hype').map((t) => t.id) });
    const decades = new Map(); L.tracks.forEach((t) => { if (t.year > 1950) { const k = Math.floor(t.year / 10) * 10; (decades.get(k) || decades.set(k, []).get(k)).push(t); } });
    [...decades].filter(([, v]) => v.length >= 6).sort((a, b) => b[1].length - a[1].length).slice(0, 2).forEach(([k, v]) => out.push({ id: 'mix-' + k, name: `${k}s Throwback`, sub: 'Time capsule', tracks: sample(v, 40, 'dec' + k).map((t) => t.id) }));
    return out;
  };
})(window.A);
