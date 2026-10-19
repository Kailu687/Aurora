/* Aurora - UI helpers: colors, modals, menus, reusable HTML builders */
(function (A) {
  const { $, $$, esc, icon, fmt } = A, L = A.lib, P = A.player;
  const U = A.ui = {};

  // ---------- color extraction ----------
  const colorCache = new Map();
  U.colorOf = (url) => {
    if (!url) return Promise.resolve(null);
    if (colorCache.has(url)) return Promise.resolve(colorCache.get(url));
    return new Promise((res) => {
      const img = new Image(); img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d', { willReadFrequently: true });
          x.drawImage(img, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data;
          let r = 0, g = 0, b = 0, w = 0;
          for (let i = 0; i < d.length; i += 4) {
            const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
            const sat = mx ? (mx - mn) / mx : 0, wt = 0.05 + sat * sat * 2 + (mx / 255) * 0.3;
            r += R * wt; g += G * wt; b += B * wt; w += wt;
          }
          let col = [r / w, g / w, b / w];
          // boost vividness and clamp brightness for UI use
          const mx = Math.max(...col), mn = Math.min(...col);
          const avg = (col[0] + col[1] + col[2]) / 3;
          col = col.map((v) => A.clamp(avg + (v - avg) * 1.45, 0, 255));
          const lum = (0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]) / 255;
          const k = lum < 0.32 ? 0.32 / Math.max(lum, 0.05) : lum > 0.78 ? 0.78 / lum : 1; void mx; void mn;
          col = col.map((v) => Math.round(A.clamp(v * k, 0, 255)));
          colorCache.set(url, col); res(col);
        } catch { res(null); }
      };
      img.onerror = () => res(null); img.src = url;
    });
  };
  const rgb2hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; };
  const hsl2rgb = (h, s, l) => { h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [r, g, b].map((v) => Math.round((v + m) * 255)); };
  const ACCENTS = { pink: [250, 45, 108], violet: [138, 92, 255], blue: [10, 132, 255], green: [30, 215, 96], orange: [255, 140, 40], teal: [40, 205, 200] };
  U.ACCENTS = ACCENTS;
  U.applyAccent = (rgb) => {
    const mode = A.store.get('accent', 'dynamic');
    if (mode !== 'dynamic' && ACCENTS[mode]) rgb = ACCENTS[mode];
    if (!rgb) rgb = ACCENTS.pink;
    const [h, s, l] = rgb2hsl(rgb), r2 = hsl2rgb(h + 48, Math.min(1, s + 0.1), Math.min(0.62, Math.max(0.5, l)));
    const st = document.documentElement.style; st.setProperty('--ar', rgb.join(',')); st.setProperty('--ar2', r2.join(','));
    const m = $('meta[name=theme-color]'); if (m) m.content = document.body.classList.contains('light') ? '#e9ecf5' : '#07070c';
  };

  // ---------- ids ----------
  U.artistId = (name) => 'ar' + A.hash(A.norm(name));
  U.albumId = (t) => 'al' + A.hash(A.norm((t.albumArtist || t.artist) + '|' + t.album));
  U.cover = (t, cls = '') => L.coverHTML(L.artUrl(t), t.album || t.title, cls);

  // ---------- modal ----------
  U.modal = ({ title, html, buttons = [{ label: 'Close', value: null }], wide, onOpen }) => new Promise((res) => {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal glass" role="dialog" aria-modal="true" ${wide ? 'style="width:min(720px,100%)"' : ''}>${title ? `<h2>${esc(title)}</h2>` : ''}<div class="mbody">${html || ''}</div><div class="foot">${buttons.map((b, i) => `<button class="btn ${b.cls || 'ghost'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    $('#modal-host').appendChild(bg);
    const done = (v) => { bg.remove(); document.removeEventListener('keydown', key, true); res(v); };
    const collect = () => { const o = {}; $$('[data-f]', bg).forEach((el) => { o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } else if (e.key === 'Enter' && e.target.tagName === 'INPUT' && buttons.length > 1) { e.preventDefault(); const b = buttons[buttons.length - 1]; done(b.value === undefined ? collect() : b.value === 'form' ? collect() : b.value); } };
    document.addEventListener('keydown', key, true);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) done(null); });
    bg.addEventListener('click', (e) => { const b = e.target.closest('.foot .btn'); if (b) { const def = buttons[+b.dataset.i]; done(def.value === 'form' ? collect() : def.value); } });
    bg.close = done; bg.collect = collect;
    if (onOpen) onOpen(bg, done);
    const f = $('input,textarea', bg); if (f) { f.focus(); f.select && f.select(); }
  });
  U.prompt = (title, value = '', label = 'Name') => U.modal({ title, html: `<label>${esc(label)}</label><input class="field" data-f="v" value="${esc(value)}" maxlength="120">`, buttons: [{ label: 'Cancel', value: null }, { label: 'Save', cls: 'accent', value: 'form' }] }).then((r) => (r ? r.v.trim() : null));
  U.confirm = (title, msg, ok = 'Confirm', danger) => U.modal({ title, html: `<p class="muted">${esc(msg)}</p>`, buttons: [{ label: 'Cancel', value: false }, { label: ok, cls: danger ? 'danger' : 'accent', value: true }] });

  // ---------- context menu ----------
  U.menu = (x, y, items) => {
    const m = $('#ctx');
    m.innerHTML = items.map((it, i) => (it === 'hr' ? '<hr>' : `<button data-i="${i}" class="${it.danger ? 'dng' : ''}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`)).join('');
    m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px'; m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
    m.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; m.hidden = true; items[+b.dataset.i].onClick(); };
  };
  U.closeMenu = () => { $('#ctx').hidden = true; };
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) U.closeMenu(); }, true);
  window.addEventListener('blur', U.closeMenu);

  U.pickPlaylist = async (ids) => {
    const items = L.playlists.map((p) => `<button class="pick" data-pid="${p.id}">${L.coverHTML(L.artFor(p), p.id)}<div><b>${esc(p.name)}</b><br><small class="muted">${p.tracks.length} songs</small></div></button>`).join('');
    const r = await U.modal({
      title: 'Add to playlist', html: `<button class="pick" data-pid="__new"><div class="cover ph" style="background:var(--glass2);width:42px;height:42px;border-radius:8px">${icon('plus')}</div><b>New playlist</b></button>${items}`,
      buttons: [{ label: 'Cancel', value: null }],
      onOpen: (bg, done) => bg.addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) done(b.dataset.pid); })
    });
    if (!r) return;
    if (r === '__new') { const n = await U.prompt('New playlist', ''); if (n == null) return; const p = L.newPlaylist(n || 'New playlist', ids); A.toast(`Created "${p.name}"`); return; }
    const p = L.playlists.find((x) => x.id === r); const n = L.addToPlaylist(p, ids); A.toast(n ? `Added to ${p.name}` : `Already in ${p.name}`);
  };

  U.editTrack = async (t) => {
    $('#img-in').value = '';
    const lr = (await A.db.get('kv', 'lrc:' + t.id)) || t.lyrics || '';
    const r = await U.modal({
      title: 'Edit info', wide: true, html: `
      <label>Title</label><input class="field" data-f="title" value="${esc(t.title)}">
      <label>Artist</label><input class="field" data-f="artist" value="${esc(t.artist)}">
      <label>Album</label><input class="field" data-f="album" value="${esc(t.album)}">
      <div style="display:flex;gap:10px"><div style="flex:1"><label>Genre</label><input class="field" data-f="genre" value="${esc(t.genre)}"></div><div style="width:110px"><label>Year</label><input class="field" data-f="year" value="${t.year || ''}" inputmode="numeric"></div></div>
      <label>Lyrics (plain text or LRC with [mm:ss.xx] timestamps)</label><textarea data-f="lyrics" placeholder="[00:12.00] First line...">${esc(lr)}</textarea>
      <div style="margin-top:10px"><button class="btn ghost sm" id="pick-cover">${icon('upload')} Change cover</button> <span class="muted" id="cover-name"></span></div>`,
      buttons: [{ label: 'Cancel', value: null }, { label: 'Save', cls: 'accent', value: 'form' }],
      onOpen: (bg) => {
        $('#pick-cover', bg).onclick = () => { const f = $('#img-in'); f.value = ''; f.onchange = () => { bg._cover = f.files[0]; $('#cover-name', bg).textContent = f.files[0] ? f.files[0].name : ''; }; f.click(); };
      }
    });
    if (!r) return;
    const bg = null; void bg;
    t.title = r.title.trim() || t.title; t.artist = r.artist.trim() || 'Unknown Artist'; t.album = r.album.trim(); t.genre = r.genre.trim(); t.year = parseInt(r.year, 10) || 0;
    await L.saveLyrics(t, r.lyrics); if (!r.lyrics.trim() && t.lyrics) t.lyrics = '';
    const f = $('#img-in').files[0];
    if (f) { const small = await A.shrinkCover(f); if (small) { t.artKey = 'c_' + t.id; await A.db.put('art', small, t.artKey); L.artUrls.set(t.artKey, URL.createObjectURL(small)); } }
    L.touch(t); L.changed(); A.toast('Saved');
  };

  U.trackMenu = (e, t, o = {}) => {
    const liked = !!t.liked;
    const items = [
      { label: 'Play next', icon: 'next', onClick: () => { P.addToQueue([t.id], true); A.toast('Playing next'); } },
      { label: 'Add to queue', icon: 'queue', onClick: () => { P.addToQueue([t.id]); A.toast('Added to queue'); } },
      { label: 'Start song radio', icon: 'wave', onClick: () => { const ids = [t.id, ...A.similar(t, 40).map((x) => x.id)]; P.playContext(ids, 0, { type: 'radio', id: t.id, name: `${t.title} Radio` }, { shuffle: false }); } },
      'hr',
      { label: liked ? 'Remove from Liked Songs' : 'Add to Liked Songs', icon: 'heart', onClick: () => L.toggleLike(t) },
      { label: 'Add to playlist…', icon: 'plus', onClick: () => U.pickPlaylist([t.id]) },
      ...(o.playlist ? [{ label: 'Remove from this playlist', icon: 'x', onClick: () => L.removeFromPlaylist(o.playlist, t.id) }] : []),
      'hr',
      { label: 'Go to artist', icon: 'user', onClick: () => { location.hash = '#/artist/' + U.artistId(t.artist); } },
      ...(t.album ? [{ label: 'Go to album', icon: 'disc', onClick: () => { location.hash = '#/album/' + U.albumId(t); } }] : []),
      { label: 'Edit info & lyrics', icon: 'edit', onClick: () => U.editTrack(t) },
      'hr',
      { label: 'Remove from library', icon: 'trash', danger: true, onClick: async () => { if (await U.confirm('Remove song?', `"${t.title}" will be removed from Aurora (the file itself is not deleted).`, 'Remove', true)) L.remove([t.id]); } }
    ];
    const r = e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
    const x = e.clientX || (r ? r.left : 100), y = e.clientY || (r ? r.bottom : 100);
    U.menu(x, y, items);
  };

  // ---------- html builders ----------
  U.row = (t, i, o = {}) => {
    const playing = P.current && P.current.id === t.id;
    return `<div class="row${playing ? ' playing' : ''}" data-tid="${t.id}" data-i="${i}">
      <div class="idx"><span class="n">${o.num != null ? o.num : i + 1}</span><span class="eqb"><i></i><i></i><i></i></span>${icon('play')}</div>
      <div class="c-title">${U.cover(t)}<div><b class="ellip">${esc(t.title)}</b><small class="ellip"><a href="#/artist/${U.artistId(t.artist)}">${esc(t.artist)}</a></small></div></div>
      <div class="c-album ellip">${t.album ? `<a href="#/album/${U.albumId(t)}">${esc(t.album)}</a>` : ''}</div>
      <div class="c-like"><button class="icon-btn sm${t.liked ? ' liked' : ''}" data-a="like" aria-label="Like">${icon('heart')}</button></div>
      <div class="c-time">${fmt(t.duration)}</div>
      <button class="icon-btn sm" data-a="more" aria-label="More">${icon('more')}</button></div>`;
  };
  U.rows = (tracks, o = {}) => `<div class="rows${o.noAlbum ? ' noalbum' : ''}"><div class="row-head"><span style="text-align:center">#</span><span>Title</span><span class="c-album">Album</span><span></span><span style="text-align:right">${icon('clock')}</span><span></span></div>${tracks.map((t, i) => U.row(t, i, o)).join('')}</div>`;

  U.card = ({ href, cover, title, sub, round, data }) => `<a class="card${round ? ' round' : ''}" href="${href}">${'<div class="cover-wrap">' + cover + (data ? `<button class="go" data-a="play-ctx" ${data}>${icon('play')}</button>` : '') + '</div>'}<b class="ellip">${esc(title)}</b><small>${esc(sub || '')}</small></a>`;

  U.setRange = (el, pct) => { el.style.setProperty('--p', pct + '%'); };
})(window.A);
