/* Aurora - keeping the user's data safe.
   - Backups: everything that isn't a music file (playlists, likes, play counts, history, edited song info, lyrics you
     typed, settings) as one JSON document. Used for Export / Import and for automatic snapshots.
   - Automatic snapshots: one a day and one before every update, kept inside the app (the last 6). On Windows a copy
     is also written to the Aurora folder in AppData.
   - Mirror: playlists and history live in localStorage; a copy is kept in IndexedDB and put back if localStorage is
     ever cleared on its own. */
(function (A) {
  const S = A.safety = {};
  const KEEP = 6, DAY = 864e5;
  const L = () => A.lib, P = () => A.player;
  const sig = (t) => A.norm(t.artist) + '|' + A.norm(t.title) + '|' + Math.round(t.duration);
  const SKIP_SETTINGS = /^aurora:(history|playlists|aiKey|session|skipBuild|liveBuild|nativeSeen)$/;

  // ---------- mirror ----------
  const mirrorT = {};
  S.mirror = (key, value) => { clearTimeout(mirrorT[key]); mirrorT[key] = setTimeout(() => A.db.put('kv', value, 'mirror:' + key).catch(() => {}), 1500); };
  S.recover = async () => {
    const out = [];
    try {
      if (!L().playlists.length) { const pl = await A.db.get('kv', 'mirror:playlists'); if (Array.isArray(pl) && pl.length) { L().playlists = pl; A.store.set('playlists', pl); out.push('playlists'); } }
      if (!P().hist.length) { const h = await A.db.get('kv', 'mirror:history'); if (Array.isArray(h) && h.length) { P().hist = h; A.store.set('history', h); out.push('history'); } }
    } catch { /* no mirror yet */ }
    if (out.length) { L().changed(); A.log('recovered ' + out.join(', ') + ' from the mirror'); }
    return out;
  };

  // ---------- backup document ----------
  S.collect = async (label = '') => {
    const lib = L(), kv = await A.db.keys('kv').catch(() => []);
    const lyrics = {};
    for (const k of kv.filter((k) => String(k).startsWith('lrc:'))) { const t = lib.byId.get(k.slice(4)); const v = await A.db.get('kv', k); if (t && v) lyrics[t.id] = { s: sig(t), text: v }; }
    return {
      app: 'aurora', v: 2, at: Date.now(), label, version: A.VERSION.name,
      playlists: lib.playlists.map((p) => ({ id: p.id, name: p.name, created: p.created, rules: p.rules || null, tracks: p.rules ? [] : lib.get(p.tracks).map((t) => ({ id: t.id, s: sig(t) })) })),
      tracks: lib.tracks.filter((t) => t.liked || t.plays || t.edited).map((t) => ({ id: t.id, s: sig(t), liked: t.liked, plays: t.plays, last: t.last, edit: t.edited ? { at: t.edited, title: t.title, artist: t.artist, album: t.album, genre: t.genre, year: t.year } : null })),
      history: P().hist.map(([id, at]) => [lib.byId.has(id) ? sig(lib.byId.get(id)) : '', at, id]).filter((h) => h[0]),
      lyrics: Object.values(lyrics).length ? lyrics : undefined,
      settings: Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('aurora:') && !SKIP_SETTINGS.test(k)).map((k) => [k, localStorage.getItem(k)]))
    };
  };

  // Merges a backup into the library. Nothing is deleted: likes and play counts only go up, playlists are matched by
  // id (then by name) so restoring twice never makes duplicates.
  S.restore = async (d) => {
    if (!d || d.app !== 'aurora') throw new Error('Not an Aurora backup');
    const lib = L(), bySig = new Map(lib.tracks.map((t) => [sig(t), t]));
    const find = (x) => (x && typeof x === 'object' ? lib.byId.get(x.id) || bySig.get(x.s) : bySig.get(x)); // v1 backups store bare signatures
    let n = 0;
    (d.tracks || []).forEach((x) => {
      const t = find(x.id ? x : x.s); if (!t) return;
      t.liked = x.liked || t.liked; t.plays = Math.max(t.plays || 0, x.plays || 0); t.last = Math.max(t.last || 0, x.last || 0);
      if (x.edit && (!t.edited || t.edited < x.edit.at)) Object.assign(t, { title: x.edit.title, artist: x.edit.artist, album: x.edit.album, genre: x.edit.genre, year: x.edit.year, edited: x.edit.at });
      lib.touch(t); n++;
    });
    (d.playlists || []).forEach((p) => {
      const ids = (p.tracks || []).map(find).filter(Boolean).map((t) => t.id);
      const ex = lib.playlists.find((x) => p.id && x.id === p.id) || lib.playlists.find((x) => x.name === p.name && !x.rules === !p.rules);
      if (ex) { if (p.rules) ex.rules = p.rules; else ids.forEach((i) => { if (!ex.tracks.includes(i)) ex.tracks.push(i); }); }
      else lib.playlists.push({ id: p.id || 'p' + A.uid(), name: p.name, created: p.created || Date.now(), tracks: ids, ...(p.rules ? { rules: p.rules } : {}) });
    });
    lib.savePlaylists();
    const have = new Set(P().hist.map(([id, at]) => id + '@' + at));
    const hist = (d.history || []).map(([s, at, id]) => { const t = (id && lib.byId.get(id)) || bySig.get(s); return t && [t.id, at]; }).filter((h) => h && !have.has(h[0] + '@' + h[1]));
    P().hist = [...P().hist, ...hist].sort((a, b) => a[1] - b[1]).slice(-2500); A.store.set('history', P().hist); S.mirror('history', P().hist);
    for (const v of Object.values(d.lyrics || {})) { const t = find(v.s); if (t) await A.db.put('kv', v.text, 'lrc:' + t.id); }
    Object.entries(d.settings || {}).forEach(([k, v]) => { if (k.startsWith('aurora:') && !SKIP_SETTINGS.test(k)) { try { localStorage.setItem(k, v); } catch { /* */ } } });
    lib.changed();
    return n;
  };

  // ---------- snapshots ----------
  S.list = async () => (await A.db.keys('kv').catch(() => [])).filter((k) => String(k).startsWith('snap:')).map((k) => +k.slice(5)).sort((a, b) => b - a);
  S.snapshot = async (label = 'Automatic') => {
    if (!L().tracks.length && !L().playlists.length) return null;
    const d = await S.collect(label), json = JSON.stringify(d);
    await A.db.put('kv', json, 'snap:' + d.at);
    const all = await S.list(); for (const at of all.slice(KEEP)) await A.db.del('kv', 'snap:' + at);
    A.store.set('lastSnapshot', d.at);
    if (A.isDesktop && window.desktop.saveSnapshot) window.desktop.saveSnapshot(json).catch(() => {});
    return d;
  };
  S.get = async (at) => { const j = await A.db.get('kv', 'snap:' + at); return j ? JSON.parse(j) : null; };
  S.daily = () => { if (Date.now() - A.store.get('lastSnapshot', 0) > DAY) S.snapshot('Daily').catch((e) => console.warn('snapshot', e)); };

  // ---------- export / import files ----------
  S.exportFile = async () => {
    const d = await S.collect('Exported');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d)], { type: 'application/json' }));
    a.download = `aurora-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  S.importFile = async (file) => {
    try { await S.snapshot('Before import'); await S.restore(JSON.parse(await file.text())); A.toast('Backup restored'); setTimeout(() => location.reload(), 900); }
    catch (e) { A.toast('Import failed: ' + e.message); }
  };

  // ---------- secrets (the Claude API key) ----------
  // Windows keeps it encrypted with the user's account; elsewhere it stays in this app's private storage.
  S.secretGet = async (k) => {
    if (A.isDesktop && window.desktop.secretGet) { const v = await window.desktop.secretGet(k).catch(() => ''); if (v) return v; }
    return A.store.get(k, '');
  };
  S.secretSet = async (k, v) => {
    if (A.isDesktop && window.desktop.secretSet && (await window.desktop.secretSet(k, v).catch(() => false))) { localStorage.removeItem('aurora:' + k); return; }
    A.store.set(k, v);
  };
  S.migrateSecrets = async () => { const v = A.store.get('aiKey', ''); if (v && A.isDesktop && window.desktop.secretSet) await S.secretSet('aiKey', v); };
})(window.A);
