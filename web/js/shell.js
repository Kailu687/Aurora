/* Aurora - app shell: player bar, now-playing, panels, actions, import, boot */
(function (A) {
  const { $, $$, esc, icon, fmt } = A, L = A.lib, P = A.player, E = A.engine, U = A.ui, ACT = A.actions;
  const isMobile = () => matchMedia('(max-width: 820px)').matches;
  const ls = { side: '', npTab: isMobile() ? 'art' : 'lyrics', lyr: null };

  // ---------- static icons ----------
  function initIcons() {
    const set = (id, n) => { const e = $('#' + id); if (e) e.innerHTML = icon(n); };
    set('tb-back', 'left'); set('tb-fwd', 'right'); set('tb-search-ic', 'search'); set('tb-settings', 'gear'); set('side-close', 'x');
    set('pb-prev', 'prev'); set('pb-next', 'next'); set('pb-lyrics', 'mic'); set('pb-queue', 'queue'); set('pb-sound', 'sliders'); set('pb-expand', 'expand');
    set('np-close', 'down'); set('np-like', 'heart'); set('np-more', 'more'); set('np-prev', 'prev'); set('np-next', 'next'); set('np-t-lyrics', 'mic'); set('np-t-sound', 'sliders'); set('np-t-queue', 'queue'); set('drop-ic', 'upload');
    const labels = { home: ['home', 'Home'], search: ['search', 'Search'], library: ['library', 'Your Library'], dj: ['spark', 'AI DJ'], stats: ['chart', 'Stats'] };
    $$('#nav a').forEach((a) => { const [i, l] = labels[a.dataset.nav]; a.innerHTML = icon(i) + `<span>${l}</span>`; });
    const short = { home: ['home', 'Home'], search: ['search', 'Search'], dj: ['spark', 'DJ'], library: ['library', 'Library'] };
    $$('#mobilenav a').forEach((a) => { const [i, l] = short[a.dataset.nav]; a.innerHTML = icon(i) + `<span>${l}</span>`; });
    $('#side-playlists').previousElementSibling && ($('[data-a=new-playlist]').innerHTML = icon('plus'));
    $('#btn-add').innerHTML = icon('folder') + ' Add music'; $('#btn-install').innerHTML = icon('download') + ' Install app';
    $('#nav-settings').innerHTML = icon('gear') + '<span>Settings</span>';
  }

  // ---------- AI DJ on/off ----------
  A.applyDjMode = () => {
    const on = A.djEnabled(); document.body.classList.toggle('no-dj', !on);
    if (!on) { if (A.dj.s) A.dj.stop(); if (ls.npTab === 'dj') ls.npTab = 'lyrics'; if (ls.side === 'dj') { ls.side = 'queue'; } if (A.route.name === 'dj' && false) location.hash = '#/'; }
    else A.analysis.start();
    renderSide(); renderNpPanel();
  };
  // true viewport height (WebViews often misreport 100vh/100dvh)
  const fitHeight = () => document.documentElement.style.setProperty('--app-h', (window.visualViewport ? window.visualViewport.height : innerHeight) + 'px');

  // ---------- theme ----------
  A.setTheme = (t) => { A.store.set('theme', t); document.body.classList.toggle('light', t === 'light'); $('#tb-theme').innerHTML = icon(t === 'light' ? 'moon' : 'sun'); U.applyAccent(U._lastColor); };

  // ---------- player UI ----------
  const els = {};
  function cacheEls() { ['pb-track', 'pb-play', 'pb-shuffle', 'pb-repeat', 'pb-seek', 'pb-cur', 'pb-dur', 'pb-vol', 'pb-mute', 'np-play', 'np-shuffle', 'np-repeat', 'np-seek', 'np-cur', 'np-dur', 'np-vol', 'np-mute', 'np-title', 'np-artist', 'np-art', 'np-bg', 'np-like', 'np-from', 'mini-fill', 'np'].forEach((id) => (els[id] = $('#' + id))); }
  const likeBtn = (t) => `<button class="icon-btn${t && t.liked ? ' liked' : ''}" data-a="like-current" aria-label="Like">${icon('heart')}</button>`;

  function updateTrackUI() {
    const t = P.current; if (!t) { els['pb-track'].innerHTML = `<div class="muted" style="padding-left:6px">Nothing playing</div>`; return; }
    els['pb-track'].innerHTML = `${U.cover(t)}<div class="t"><b class="ellip">${esc(t.title)}</b><small class="ellip">${esc(t.artist)}</small></div>${likeBtn(t)}`;
    els['np-title'].textContent = t.title; els['np-artist'].innerHTML = `<a href="#/artist/${U.artistId(t.artist)}" data-a="close-np">${esc(t.artist)}</a>${t.album ? ` · <a href="#/album/${U.albumId(t)}" data-a="close-np">${esc(t.album)}</a>` : ''}`;
    const art = L.artUrl(t);
    els['np-art'].innerHTML = U.cover(t); els['np-bg'].style.backgroundImage = art ? `url("${art}")` : 'none';
    els['np-bg'].style.background = art ? '' : `linear-gradient(135deg, rgba(var(--ar),.6), rgba(var(--ar2),.6))`;
    if (art) els['np-bg'].style.backgroundImage = `url("${art}")`;
    els['np-from'].textContent = P.context.name || 'Your Library';
    document.title = `${t.title} · ${t.artist}`;
    U.colorOf(art).then((c) => { U._lastColor = c; U.applyAccent(c); });
    syncLikes(); markPlaying(); loadLyrics(); renderSide(); renderNpPanel();
    if (A.route.name === 'dj') A.render(true);
  }
  function markPlaying() {
    $$('.row.playing').forEach((r) => r.classList.remove('playing'));
    if (P.current) $$(`.row[data-tid="${P.current.id}"]`).forEach((r) => r.classList.add('playing'));
  }
  function syncLikes() {
    const t = P.current; const on = !!(t && t.liked);
    $$('[data-a=like-current]').forEach((b) => b.classList.toggle('liked', on));
  }
  function updateStateUI() {
    const playing = E.playing, ic = icon(playing ? 'pause' : 'play');
    els['pb-play'].innerHTML = ic; els['np-play'].innerHTML = ic;
    document.body.classList.toggle('paused', !playing); els.np.classList.toggle('paused', !playing);
    ['pb', 'np'].forEach((p) => {
      els[p + '-shuffle'].innerHTML = icon('shuffle'); els[p + '-shuffle'].classList.toggle('on', P.shuffle);
      els[p + '-repeat'].innerHTML = icon('repeat'); els[p + '-repeat'].classList.toggle('on', P.repeat !== 'off'); els[p + '-repeat'].classList.toggle('rep1', P.repeat === 'one');
    });
  }
  function updateVol() {
    const v = E.muted ? 0 : E.volume, ic = icon(v === 0 ? 'mute' : 'vol');
    ['pb', 'np'].forEach((p) => { els[p + '-vol'].value = Math.round(v * 100); U.setRange(els[p + '-vol'], v * 100); els[p + '-mute'].innerHTML = ic; });
  }
  let seeking = false;
  function bindSeek(inp, cur) {
    inp.addEventListener('pointerdown', () => { seeking = true; });
    const dur = () => (P.isLoaded() ? E.duration : P.current ? P.current.duration : 0);
    inp.addEventListener('input', () => { U.setRange(inp, inp.value / 10); els[cur].textContent = fmt((inp.value / 1000) * dur()); });
    inp.addEventListener('change', () => { seeking = false; P.seekTo((inp.value / 1000) * dur()); });
    window.addEventListener('pointerup', () => setTimeout(() => (seeking = false), 50));
  }
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const loaded = P.isLoaded();
    const d = loaded ? E.duration : (P.current ? P.current.duration : 0), t = loaded ? E.time : (P.resume ? P.resume.pos : 0);
    if (!seeking) {
      const pct = d ? (t / d) * 100 : 0;
      ['pb', 'np'].forEach((p) => { els[p + '-seek'].value = pct * 10; U.setRange(els[p + '-seek'], pct); els[p + '-cur'].textContent = fmt(t); els[p + '-dur'].textContent = fmt(d); });
      els['mini-fill'].style.width = pct + '%';
    }
    if (document.body.classList.contains('np-open')) drawViz();
    syncLyrics(t);
  }

  // ---------- visualizer ----------
  let vctx, vcan;
  function drawViz() {
    vcan = vcan || $('#viz'); vctx = vctx || vcan.getContext('2d');
    const w = vcan.width, h = vcan.height; vctx.clearRect(0, 0, w, h);
    const bars = E.getBars(56); if (!bars) return;
    const n = bars.length, gw = w / n, cs = getComputedStyle(document.documentElement);
    const c1 = `rgb(${cs.getPropertyValue('--ar')})`, c2 = `rgb(${cs.getPropertyValue('--ar2')})`;
    const g = vctx.createLinearGradient(0, h, 0, 0); g.addColorStop(0, c1); g.addColorStop(1, c2); vctx.fillStyle = g;
    for (let i = 0; i < n; i++) { const v = Math.pow(bars[i], 1.25) * h * 0.95, x = i * gw + gw * 0.18, bw = gw * 0.64; vctx.beginPath(); vctx.roundRect ? vctx.roundRect(x, h - v, bw, v, 5) : vctx.rect(x, h - v, bw, v); vctx.fill(); }
    // pulse the orb with bass
    const bass = (bars[1] + bars[2] + bars[3]) / 3; els['np-art'].style.transform = !E.playing ? '' : `scale(${(0.98 + bass * 0.06).toFixed(3)})`;
  }

  // ---------- queue / lyrics / DJ panels ----------
  const trk = (id) => L.byId.get(id);
  function qItem(t, kind, idx, now) {
    return `<div class="q-item${now ? ' now' : ''}" draggable="${now ? 'false' : 'true'}" data-qk="${kind}" data-qi="${idx}" data-tid="${t.id}">${U.cover(t)}<div class="m"><b class="ellip">${esc(t.title)}</b><small class="ellip">${esc(t.artist)}</small></div>${now ? '' : `<button class="icon-btn sm" data-a="q-remove" aria-label="Remove">${icon('x')}</button>`}</div>`;
  }
  function renderQueue(host) {
    const cur = P.current; if (!cur) { host.innerHTML = `<div class="no-lyrics">${icon('queue')}<div>Your queue is empty.<br>Play something to get started.</div></div>`; return; }
    const uq = P.userQueue.map(trk).filter(Boolean), up = P.upcoming.map(trk).filter(Boolean).slice(0, 80);
    host.innerHTML = `<div class="q-sec">Now playing</div>${qItem(cur, 'now', 0, true)}
      ${uq.length ? `<div class="q-sec"><span>Next in queue</span><button class="muted" data-a="q-clear-user">Clear</button></div>${uq.map((t, i) => qItem(t, 'user', i)).join('')}` : ''}
      ${up.length ? `<div class="q-sec"><span>Next from ${esc(P.context.name || 'library')}</span></div>${up.map((t, i) => qItem(t, 'ctx', i)).join('')}` : ''}
      ${!uq.length && !up.length ? `<div class="no-lyrics"><div>That’s the end of the queue.${P.autoplay ? '<br>Autoplay will keep the music going.' : ''}</div></div>` : ''}`;
  }
  async function loadLyrics() {
    const t = P.current; if (!t) { ls.lyr = null; return; }
    ls.lyr = { id: t.id, data: undefined, idx: -1 }; const id = t.id;
    const data = await L.lyricsFor(t);
    if (ls.lyr && ls.lyr.id === id) { ls.lyr.data = data || null; renderSide(); renderNpPanel(); }
  }
  function renderLyrics(host) {
    const l = ls.lyr; if (!P.current) { host.innerHTML = `<div class="no-lyrics">${icon('mic')}<div>Play a song to see lyrics.</div></div>`; return; }
    if (!l || l.data === undefined) { host.innerHTML = '<div class="no-lyrics muted">Looking for lyrics…</div>'; return; }
    if (!l.data) { host.innerHTML = `<div class="no-lyrics">${icon('mic')}<div><b>No lyrics for this song</b><br><span style="font-size:13px">Put a .lrc file next to the song, or paste lyrics yourself.</span></div><button class="btn ghost sm" data-a="edit-current">${icon('edit')} Add lyrics</button></div>`; return; }
    host.innerHTML = `<div class="lyrics${l.data.synced ? '' : ' plain'}">${l.data.lines.map((x, i) => `<p data-i="${i}" ${x.t >= 0 ? `data-t="${x.t}"` : ''}>${esc(x.s)}</p>`).join('')}</div>`;
    l.idx = -1;
  }
  function syncLyrics(t) {
    const l = ls.lyr; if (!l || !l.data || !l.data.synced) return;
    const vis = $$('.lyrics:not(.plain)'); if (!vis.length) return;
    const lines = l.data.lines; let i = -1; for (let k = 0; k < lines.length; k++) { if (lines[k].t <= t + 0.25) i = k; else break; }
    if (i === l.idx) return; l.idx = i;
    vis.forEach((box) => { const ps = box.children; for (let k = 0; k < ps.length; k++) { ps[k].classList.toggle('on', k === i); ps[k].classList.toggle('past', k < i); } if (ps[i]) { const sc = box.closest('#side-body, .np-panel'); if (sc && sc.offsetParent) sc.scrollTo({ top: ps[i].offsetTop - sc.clientHeight * 0.32, behavior: 'smooth' }); } });
  }
  function renderDJPanel(host) {
    const dj = A.dj;
    if (dj.active) {
      const s = dj.s, S = A.DJ_STYLES[s.style];
      host.innerHTML = `<div class="np-pad"><div class="dj-hero" style="padding:16px;gap:16px;margin:0 0 12px"><div class="orb sm" style="width:64px;height:64px"></div><div><b style="font-size:18px">${esc(s.vibe.name)}</b><div class="muted">DJ ${esc(S.dj)} is live</div></div></div><div class="dj-ctrls"><button class="chip" data-a="dj-nudge" data-id="up">${icon('zap')} Hype</button><button class="chip" data-a="dj-nudge" data-id="down">${icon('moon')} Chill</button><button class="chip" data-a="dj-nudge" data-id="more">More like this</button><button class="chip" data-a="dj-nudge" data-id="change">Change it up</button><button class="chip" data-a="dj-stop">End</button></div>
        <form class="dj-ask" data-a-submit="dj-ask" style="margin-top:12px"><input placeholder="Ask the DJ…" autocomplete="off"><button class="btn accent sm" type="submit">Ask</button></form>
        <div class="q-sec">Switch vibe</div><div class="dj-ctrls">${A.VIBES.map((v) => `<button class="chip${v.id === s.vibe.id ? ' on' : ''}" data-a="dj-vibe" data-id="${v.id}">${esc(v.name)}</button>`).join('')}</div></div>`;
    } else host.innerHTML = `<div class="np-pad"><div class="no-lyrics"><div class="orb" style="width:96px;height:96px"></div><div><b>AI DJ</b><br><span style="font-size:13px">Pick a vibe and let the DJ mix your library.</span></div><div class="dj-ctrls" style="justify-content:center">${A.VIBES.slice(0, 6).map((v) => `<button class="chip" data-a="dj-start" data-id="${v.id}">${esc(v.name)}</button>`).join('')}</div><a class="btn accent" href="#/dj" data-a="close-np">All vibes</a></div></div>`;
  }
  function renderInfo(host) {
    const t = P.current; if (!t) { host.innerHTML = ''; return; }
    const rows = [['Album', t.album], ['Genre', t.genre], ['Year', t.year || ''], ['Plays', t.plays], ['Length', fmt(t.duration)], ['Tempo', t.an && t.an.tempo ? t.an.tempo + ' BPM' : ''], ['Energy', t.an ? Math.round(t.an.energy * 100) + '%' : 'Analyzing…'], ['File', t.name]].filter((r) => r[1] !== '' && r[1] != null);
    host.innerHTML = `<div class="np-pad">${rows.map(([a, b]) => `<div class="set-row"><span class="muted">${a}</span><span style="text-align:right;word-break:break-all">${esc(b)}</span></div>`).join('')}<div class="actions"><button class="btn ghost sm" data-a="edit-current">${icon('edit')} Edit info</button></div></div>`;
  }
  function renderSide() {
    if (!ls.side) return; const host = $('#side-body');
    $$('#side .side-tabs button[data-id]').forEach((b) => b.classList.toggle('on', b.dataset.id === ls.side));
    ({ queue: renderQueue, lyrics: renderLyrics, dj: renderDJPanel }[ls.side])(host);
  }
  function renderNpPanel() {
    if (!els.np.classList.contains('open')) return; const host = $('#np-panel');
    $$('.np-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.id === ls.npTab));
    els.np.classList.toggle('panel-open', ls.npTab !== 'art' || !isMobile());
    ({ art: renderInfo, lyrics: renderLyrics, queue: renderQueue, dj: renderDJPanel }[ls.npTab])(host);
  }
  A.renderSide = renderSide;

  function openSide(tab) {
    const app = $('#app');
    if (app.classList.contains('side-open') && ls.side === tab) { app.classList.remove('side-open'); ls.side = ''; return; }
    ls.side = tab; app.classList.add('side-open'); renderSide();
    $('#pb-lyrics').classList.toggle('on', tab === 'lyrics'); $('#pb-queue').classList.toggle('on', tab === 'queue');
  }
  let npPushed = false;
  function openNp(open = true, noBack = false) {
    const was = els.np.classList.contains('open');
    els.np.classList.toggle('open', open); els.np.setAttribute('aria-hidden', !open); document.body.classList.toggle('np-open', open);
    if (open) { if (!P.current) { els.np.classList.remove('open'); document.body.classList.remove('np-open'); return; } renderNpPanel(); }
    // browsers/PWA: make the phone's back gesture close the player instead of leaving the app
    if (!A.isNative) {
      if (open && !was) { try { history.pushState({ aurNp: 1 }, ''); npPushed = true; } catch { /* */ } }
      else if (!open && was && npPushed) { npPushed = false; if (!noBack) history.back(); }
    }
  }
  // Android/hardware back: close the top-most thing, else go to the previous screen. Returns false at the home screen.
  const navStack = [location.hash || '#/'];
  A.handleBack = () => {
    const modal = $$('.modal-bg').pop(); if (modal) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; }
    if (!$('#ctx').hidden) { U.closeMenu(); return true; }
    if (els.np.classList.contains('open')) { openNp(false); return true; }
    if ($('#app').classList.contains('side-open') && ls.side) { ACT['close-side'](); return true; }
    if (navStack.length > 1) { navStack.pop(); const prev = navStack[navStack.length - 1]; navStack.pop(); location.hash = prev; return true; }
    if (A.route.name !== 'home') { location.hash = '#/'; return true; }
    return false;
  };
  window.addEventListener('hashchange', () => { const h = location.hash || '#/'; const top = navStack[navStack.length - 1]; if (top !== h) { if (h.startsWith('#/search') && top.startsWith('#/search')) navStack[navStack.length - 1] = h; else navStack.push(h); } if (navStack.length > 60) navStack.shift(); });
  window.addEventListener('popstate', () => { if (npPushed && els.np.classList.contains('open')) { npPushed = false; openNp(false); } });

  // ---------- DJ bubble ----------
  function bindDJ() {
    const bub = $('#dj-bubble'); let hide;
    A.dj.listeners.add((ev, d) => {
      if (ev === 'say') {
        clearTimeout(hide);
        if (!d) { bub.classList.remove('show'); return; }
        $('#dj-name').textContent = 'DJ ' + d.dj; $('#dj-text').textContent = d.text; bub.classList.add('show');
        const lt = $('#dj-live-text'); if (lt) lt.textContent = d.text;
        hide = setTimeout(() => bub.classList.remove('show'), 4000 + d.text.length * 70);
      } else if (ev === 'talk') { $$('#dj-orb, #big-orb').forEach((o) => o.classList.toggle('talk', !!d)); }
      else if (['start', 'stop', 'vibe', 'nudge'].includes(ev)) { if (A.route.name === 'dj') A.render(true); renderSide(); renderNpPanel(); }
    });
  }

  // ---------- importing ----------
  let scanBox;
  function progress(done, total) {
    if (!scanBox) { scanBox = document.createElement('div'); scanBox.className = 'scan glass'; document.body.appendChild(scanBox); }
    scanBox.innerHTML = `<b>Adding your music…</b><div class="muted stage" style="font-size:13px">${total ? `${done} of ${total} songs` : 'Looking through the folder…'}</div><div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>`;
  }
  A.progressNote = (t) => { if (scanBox) { const d = scanBox.querySelector('.stage'); if (d) d.textContent = t; } };
  const endProgress = () => { if (scanBox) { scanBox.remove(); scanBox = null; } };
  async function runImport(fn) {
    try { progress(0, 0); const n = await fn(progress); endProgress(); A.toast(n ? `Added ${n} song${n === 1 ? '' : 's'}` : 'Library is up to date'); A.analysis.start(); }
    catch (e) { endProgress(); if (e && e.name !== 'AbortError') { console.error(e); A.toast('Couldn’t import: ' + (e.message || e)); } }
    checkReconnect();
  }
  A.addMusic = async () => {
    if (A.isDesktop) return runImport((p) => L.addDesktopFolder(p));
    if (window.AuroraAndroid && window.AuroraAndroid.pickFolder) { // Android app: link a folder, songs are played straight from it
      A.toast('Choose your music folder, then tap “Use this folder”', 4500); return runImport((p) => L.addAndroidFolder(p));
    }
    const touch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (window.showDirectoryPicker && !touch) return runImport((p) => L.addFolderHandle(p));
    if (touch) { // phones can't pick folders: open the file picker straight away (multi-select)
      A.toast('Select your songs. Tip: choose one, then “Select all”', 4500); $('#file-in').click(); return;
    }
    const r = await U.modal({ title: 'Add music', html: '<p class="muted">Choose a folder, or pick individual audio files. Songs are stored privately inside this browser.</p>', buttons: [{ label: 'Pick files', cls: 'accent', value: 'files' }, { label: 'Pick folder', cls: 'ghost', value: 'dir' }, { label: 'Cancel', value: null }] });
    if (r === 'files') $('#file-in').click(); else if (r === 'dir') $('#dir-in').click();
  };
  async function checkReconnect() {
    let b = $('#reconnect');
    const need = !A.isDesktop && (await L.reconnectNeeded().catch(() => false)) && L.tracks.length;
    if (!need) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'reconnect'; b.className = 'banner'; b.style.margin = '0 20px'; b.innerHTML = `<span>${icon('folder')} Your browser needs permission again to read your music folder.</span><button class="btn accent sm" data-a="reconnect">Reconnect</button>`; $('#topbar').after(b); }
  }
  async function handleDrop(e) {
    e.preventDefault(); $('#drop').hidden = true;
    const items = [...(e.dataTransfer.items || [])]; const files = [...(e.dataTransfer.files || [])];
    if (A.isDesktop) {
      const dirs = [], loose = [];
      items.forEach((it, i) => { const en = it.webkitGetAsEntry && it.webkitGetAsEntry(); const f = files[i]; if (en && en.isDirectory && f) dirs.push(window.desktop.pathFor(f)); else if (f) loose.push(f); });
      for (const d of dirs) await runImport((p) => L.scanDesktopRoot({ id: 'd_' + A.hash(d), name: d.split(/[\\/]/).pop(), path: d }, p));
      if (loose.length) await runImport((p) => L.addFiles(loose, p)); return;
    }
    const hs = items.map((it) => (it.getAsFileSystemHandle ? it.getAsFileSystemHandle() : null));
    if (hs.some(Boolean)) {
      const loose = [];
      for (const hp of hs) { const h = await hp; if (!h) continue; if (h.kind === 'directory') await runImport((p) => L.addDroppedDir(h, p)); else loose.push(await h.getFile()); }
      if (loose.length) await runImport((p) => L.addFiles(loose, p)); return;
    }
    if (files.length) runImport((p) => L.addFiles(files, p));
  }

  // ---------- backup ----------
  const sig = (t) => A.norm(t.artist) + '|' + A.norm(t.title) + '|' + Math.round(t.duration);
  function exportData() {
    const data = {
      app: 'aurora', v: 1, at: Date.now(),
      playlists: L.playlists.map((p) => ({ name: p.name, tracks: L.get(p.tracks).map(sig) })),
      tracks: L.tracks.filter((t) => t.liked || t.plays).map((t) => ({ s: sig(t), liked: t.liked, plays: t.plays, last: t.last })),
      history: P.hist.map(([id, at]) => [L.byId.has(id) ? sig(L.byId.get(id)) : '', at]).filter((h) => h[0]),
      settings: Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('aurora:') && !/history|playlists|aiKey/.test(k)).map((k) => [k, localStorage.getItem(k)]))
    };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = 'aurora-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function importData(file) {
    try {
      const d = JSON.parse(await file.text()); if (d.app !== 'aurora') throw new Error('Not an Aurora backup');
      const map = new Map(L.tracks.map((t) => [sig(t), t]));
      d.tracks.forEach((x) => { const t = map.get(x.s); if (t) { t.liked = x.liked || t.liked; t.plays = Math.max(t.plays, x.plays || 0); t.last = Math.max(t.last, x.last || 0); L.touch(t); } });
      d.playlists.forEach((p) => { const ids = p.tracks.map((s) => map.get(s)).filter(Boolean).map((t) => t.id); L.newPlaylist(p.name, ids); });
      const hist = (d.history || []).map(([s, at]) => [map.get(s) && map.get(s).id, at]).filter((h) => h[0]); P.hist = [...P.hist, ...hist].sort((a, b) => a[1] - b[1]); A.store.set('history', P.hist);
      Object.entries(d.settings || {}).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* */ } });
      L.changed(); A.toast('Backup restored'); setTimeout(() => location.reload(), 900);
    } catch (e) { A.toast('Import failed: ' + e.message); }
  }

  // ---------- sound popover ----------
  function soundModal() {
    U.modal({
      title: 'Sound & timer', html: `
      <div class="sound-row"><span>Speed</span><div class="actions" style="padding:0">${[0.75, 1, 1.25, 1.5, 2].map((s) => `<button class="chip sp${s === E.rate ? ' on' : ''}" data-sp="${s}">${s}x</button>`).join('')}</div></div>
      <div class="sound-row"><span>Crossfade</span><input class="range" type="range" min="0" max="12" value="${E.crossfade}" id="m-cf"><b id="m-cfv">${E.crossfade ? E.crossfade + 's' : 'Off'}</b></div>
      <div class="sound-row"><span>Sleep</span><div class="actions" style="padding:0">${[['Off', 0], ['15m', 15], ['30m', 30], ['60m', 60], ['End of song', 'end']].map(([l, v]) => `<button class="chip sl" data-sl="${v}">${l}</button>`).join('')}</div></div>
      <div class="sound-row"><span>EQ preset</span><div class="actions" style="padding:0">${Object.keys(A.EQ_PRESETS).map((n) => `<button class="chip eqp" data-eqp="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>
      <p class="faint" style="font-size:13px">Fine-tune the 10-band equalizer in <a href="#/settings" style="text-decoration:underline" id="m-set">Settings</a>.</p>`,
      buttons: [{ label: 'Done', cls: 'accent', value: null }],
      onOpen: (bg, done) => {
        $('#m-cf', bg).oninput = (e) => { E.setCrossfade(+e.target.value); $('#m-cfv', bg).textContent = +e.target.value ? e.target.value + 's' : 'Off'; };
        $('#m-set', bg).onclick = () => done(null);
        bg.addEventListener('click', (e) => {
          const sp = e.target.closest('.sp'), sl = e.target.closest('.sl'), ep = e.target.closest('.eqp');
          if (sp) { E.setRate(+sp.dataset.sp); $$('.sp', bg).forEach((b) => b.classList.toggle('on', b === sp)); }
          if (sl) { const v = sl.dataset.sl; P.setSleep(v === 'end' ? 'end' : +v || null); A.toast(+v || v === 'end' ? 'Sleep timer on' : 'Sleep timer off'); $$('.sl', bg).forEach((b) => b.classList.toggle('on', b === sl)); }
          if (ep) { E.setEQAll(A.EQ_PRESETS[ep.dataset.eqp]); A.toast('EQ: ' + ep.dataset.eqp); $$('.eqp', bg).forEach((b) => b.classList.toggle('on', b === ep)); }
        });
      }
    });
  }

  // ---------- actions ----------
  const rowOf = (el) => el.closest('[data-tid]');
  const ctxFrom = (el) => { const host = el.closest('[data-reg]'); return host && A.reg.get(host.dataset.reg); };
  Object.assign(ACT, {
    toggle: () => P.toggle(), prev: () => P.prev(), next: () => P.next(), shuffle: () => P.toggleShuffle(), repeat: () => P.cycleRepeat(), mute: () => E.toggleMute(),
    'like-current': () => { if (P.current) { L.toggleLike(P.current); } },
    'open-np': (el, e) => { if (e.target.closest('[data-a=like-current]')) return; openNp(true); }, 'close-np': (el) => openNp(false, el && el.tagName === 'A'),
    back: () => history.back(), fwd: () => history.forward(),
    theme: () => A.setTheme(document.body.classList.contains('light') ? 'dark' : 'light'), settings: () => { location.hash = '#/settings'; },
    'side-tab': (el) => openSide(el.dataset.id), 'close-side': () => { $('#app').classList.remove('side-open'); ls.side = ''; },
    'np-tab': (el) => { ls.npTab = el.dataset.id; if (ls.npTab === 'art' && !isMobile()) ls.npTab = 'art'; renderNpPanel(); },
    'np-more': (el, e) => P.current && U.trackMenu({ clientX: e.clientX, clientY: e.clientY, currentTarget: el }, P.current),
    sound: soundModal,
    like: (el) => { const r = rowOf(el), t = r && trk(r.dataset.tid); if (t) L.toggleLike(t); },
    more: (el, e) => { const r = rowOf(el), t = r && trk(r.dataset.tid); if (!t) return; const pl = A.route.name === 'playlist' ? L.playlists.find((p) => p.id === A.route.arg) : null; U.trackMenu({ clientX: e.clientX, clientY: e.clientY, currentTarget: el }, t, { playlist: pl }); },
    'play-ctx': (el) => { const c = U.ctxOf(el.dataset.kind, el.dataset.id); if (c) P.playContext(c.ids, null, c.meta); },
    'play-reg': (el) => { const c = A.reg.get(el.dataset.reg); if (!c) return; P.playContext(c.ids, el.dataset.id || null, c.meta); },
    'shuffle-reg': (el) => { const c = A.reg.get(el.dataset.reg); if (c && c.ids.length) P.playContext(c.ids, null, c.meta, { shuffle: true }); },
    'new-playlist': async () => { const n = await U.prompt('New playlist', ''); if (n == null) return; const p = L.newPlaylist(n || 'New playlist'); location.hash = '#/playlist/' + p.id; },
    'playlist-menu': (el, e) => {
      const p = L.playlists.find((x) => x.id === el.dataset.id); if (!p) return;
      U.menu(e.clientX, e.clientY, [
        { label: 'Rename', icon: 'edit', onClick: async () => { const n = await U.prompt('Rename playlist', p.name); if (n) { p.name = n; L.savePlaylists(); L.changed(); } } },
        { label: 'Add all to queue', icon: 'queue', onClick: () => { P.addToQueue(p.tracks); A.toast('Added to queue'); } },
        { label: 'Delete playlist', icon: 'trash', danger: true, onClick: async () => { if (await U.confirm('Delete playlist?', `"${p.name}" will be deleted. Songs stay in your library.`, 'Delete', true)) { L.deletePlaylist(p); location.hash = '#/library'; } } }]);
    },
    'playlist-add': async (el) => {
      const p = L.playlists.find((x) => x.id === el.dataset.id); if (!p) return;
      await U.modal({
        title: 'Add songs', html: `<input class="field" id="pa-q" placeholder="Search your library…"><div id="pa-list" style="margin-top:10px;max-height:46vh;overflow:auto"></div>`, buttons: [{ label: 'Done', cls: 'accent', value: null }],
        onOpen: (bg) => {
          const draw = () => { const q = $('#pa-q', bg).value; const res = q.trim() ? L.search(q).tracks : L.recentlyAdded(40); $('#pa-list', bg).innerHTML = res.slice(0, 60).map((t) => `<button class="pick" data-id="${t.id}">${U.cover(t)}<div style="flex:1;min-width:0"><b class="ellip">${esc(t.title)}</b><br><small class="muted">${esc(t.artist)}</small></div>${p.tracks.includes(t.id) ? icon('check') : icon('plus')}</button>`).join(''); };
          $('#pa-q', bg).oninput = A.debounce(draw, 120); draw();
          bg.addEventListener('click', (e) => { const b = e.target.closest('.pick'); if (b) { L.addToPlaylist(p, [b.dataset.id]); b.lastElementChild.outerHTML = icon('check'); } });
        }
      });
    },
    'add-music': () => A.addMusic(), 'add-files': () => $('#file-in').click(),
    rescan: (el) => { const r = L.roots.find((x) => x.id === el.dataset.id); if (r) runImport((p) => L.rescan(r, p)); },
    'remove-root': async (el) => { const r = L.roots.find((x) => x.id === el.dataset.id); if (r && await U.confirm('Remove folder?', `All songs from "${r.name}" will be removed from Aurora. Your files are not touched.`, 'Remove', true)) { await L.removeRoot(r); A.render(true); } },
    'clear-lib': async () => { if (await U.confirm('Clear library?', 'This removes every song from Aurora (not from your disk). Playlists will be emptied.', 'Clear', true)) { E.stop(); await L.clearAll(); P.current = null; updateTrackUI(); A.render(true); } },
    reconnect: async () => { await L.reconnect(); checkReconnect(); },
    'q-remove': (el) => { const r = el.closest('.q-item'); P.removeFromQueue(r.dataset.qk, +r.dataset.qi); },
    'q-clear-user': () => { P.userQueue = []; P.emit('queue'); },
    'edit-current': () => P.current && U.editTrack(P.current),
    'toggle-set': (el) => {
      const k = el.dataset.k, on = !el.classList.contains('on'); el.classList.toggle('on', on);
      if (k === 'normalize') E.setNormalize(on); else if (k === 'autoplay') { P.autoplay = on; A.store.set('autoplay', on); } else if (k === 'djVoiceOn') A.store.set('djVoiceOn', on);
      else if (k === 'djEnabled') { A.store.set('djEnabled', on); A.applyDjMode(); A.toast(on ? 'AI DJ enabled' : 'AI DJ turned off'); A.render(true); }
      else if (k === 'autoUpdate') A.store.set('autoUpdate', on);
      else if (k === 'onlineCovers') { A.store.set('onlineCovers', on); if (on) { L.tracks.forEach((t) => { t.coverTried = 0; }); L.fetchCovers(); } }
      else if (k === 'analyze') A.analysis.setEnabled(on); else if (k === 'bgAnim') { A.store.set('bgAnim', on); document.body.classList.toggle('calm', !on); }
    },
    'eq-preset': (el) => { E.setEQAll(A.EQ_PRESETS[el.dataset.id]); $$('[data-eq]').forEach((i) => (i.value = E.eqGains[+i.dataset.eq])); },
    'set-theme': (el) => { A.setTheme(el.dataset.id); A.render(true); },
    'set-accent': (el) => { A.store.set('accent', el.dataset.id); U.applyAccent(U._lastColor); A.render(true); },
    'test-voice': () => A.dj.say('Hey, it’s your DJ. Testing, one, two. How do I sound?', { duck: false }),
    reanalyze: () => { A.analysis.reset(); A.toast('Re-analyzing your library'); A.render(true); },
    export: exportData, import: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = () => i.files[0] && importData(i.files[0]); i.click(); },
    install: async () => {
      if (A._installEvt) { A._installEvt.prompt(); A._installEvt = null; return; }
      U.modal({ title: 'Install Aurora', html: '<p class="muted">On <b>iPhone / iPad</b>: tap the Share button, then <b>Add to Home Screen</b>.<br><br>On <b>Android</b>: open the browser menu (⋮) and choose <b>Install app</b> / <b>Add to Home screen</b>.<br><br>On <b>desktop Chrome / Edge</b>: click the install icon at the right of the address bar.</p>', buttons: [{ label: 'Got it', cls: 'accent', value: null }] });
    },
    'toggle-dj': () => { A.store.set('djEnabled', true); A.applyDjMode(); A.toast('AI DJ enabled'); A.render(true); },
    'check-update': () => A.updater.check({ manual: true }),
    'nt-settings': () => { if (A.native) { A.native.openSettings(); setTimeout(() => A.render(true), 800); } },
    'nt-perm': () => { if (A.native) { A.native.requestPermission(); setTimeout(() => A.render(true), 1500); } },
    'reset-defaults': async () => {
      if (!(await U.confirm('Reset to defaults?', 'All settings go back to their defaults and the app reloads. Songs, playlists, likes and history are kept.', 'Reset', true))) return;
      const keep = new Set(['aurora:playlists', 'aurora:history', 'aurora:session']);
      Object.keys(localStorage).filter((k) => k.startsWith('aurora:') && !keep.has(k)).forEach((k) => localStorage.removeItem(k));
      try { if (A.dj.s) A.dj.stop(); } catch { /* */ }
      A.toast('Settings reset'); setTimeout(() => location.reload(), 600);
    },
    // --- DJ ---
    'dj-pick': (el) => { V().djSel.vibe = el.dataset.id; A.render(true); },
    'dj-genre': (el) => { const s = V().djSel.genres, g = el.dataset.id; s.has(g) ? s.delete(g) : s.add(g); A.render(true); },
    'dj-style': (el) => { V().djSel.style = el.dataset.id; A.store.set('djStyle', el.dataset.id); A.render(true); },
    'dj-talk': (el) => { V().djSel.talk = el.dataset.id; A.store.set('djTalk', el.dataset.id); A.render(true); },
    'dj-go': () => { const s = V().djSel; A.store.set('djTalk', s.talk); A.dj.start({ vibe: s.vibe, genres: [...s.genres], style: s.style, talk: s.talk }); },
    'dj-surprise': () => { const v = A.pick(A.VIBES).id; V().djSel.vibe = v; A.dj.start({ vibe: v, style: V().djSel.style, talk: V().djSel.talk }); if (A.route.name !== 'dj') location.hash = '#/dj'; },
    'dj-start': (el) => { A.dj.start({ vibe: el.dataset.id, style: V().djSel.style, talk: V().djSel.talk }); if (A.route.name !== 'dj' && !isMobile()) location.hash = '#/dj'; },
    'dj-stop': () => { A.dj.stop(); A.render(true); renderSide(); renderNpPanel(); },
    'dj-nudge': (el) => A.dj.nudge(el.dataset.id), 'dj-vibe': (el) => A.dj.setVibe(el.dataset.id)
  });
  const V = () => A.views;
  const SUBMIT = { 'dj-ask': (form) => { const i = $('input', form); if (A.dj.request(i.value)) i.value = ''; } };

  // ---------- global events ----------
  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-a]'); 
      if (el) { const f = ACT[el.dataset.a]; if (f) { if (el.closest('a') && el.tagName !== 'A') { e.preventDefault(); } if (el.dataset.a !== 'close-np' || el.tagName !== 'A') e.stopPropagation(); f(el, e); if (el.dataset.a === 'close-np' && el.tagName === 'A') { /* let link navigate */ } return; } }
      const row = e.target.closest('.row[data-tid], .q-item[data-tid]');
      if (row && !e.target.closest('a, button')) {
        if (row.classList.contains('q-item')) { if (row.dataset.qk !== 'now') P.jumpToQueue(row.dataset.qk, +row.dataset.qi); return; }
        const t = trk(row.dataset.tid); if (!t) return;
        if (row.closest('.dj-live') || row.closest('#view') && A.route.name === 'dj') return;
        if (P.current && P.current.id === t.id && row.classList.contains('playing')) { P.toggle(); return; }
        const c = ctxFrom(row); if (c) P.playContext(c.ids, t.id, c.meta); else P.playTrackNow(t);
      }
      const ly = e.target.closest('.lyrics:not(.plain) p[data-t]'); if (ly) E.seek(+ly.dataset.t);
    });
    document.addEventListener('submit', (e) => { const f = e.target.closest('[data-a-submit]'); if (f) { e.preventDefault(); SUBMIT[f.dataset.aSubmit](f); } });
    document.addEventListener('contextmenu', (e) => { const r = e.target.closest('.row[data-tid], .q-item[data-tid]'); if (r) { e.preventDefault(); const t = trk(r.dataset.tid); const pl = A.route.name === 'playlist' ? L.playlists.find((p) => p.id === A.route.arg) : null; t && U.trackMenu(e, t, { playlist: pl }); } });
    // long-press for context menu on touch
    let lp, lpx, lpy; document.addEventListener('touchstart', (e) => { const r = e.target.closest('.row[data-tid]'); if (!r) return; lpx = e.touches[0].clientX; lpy = e.touches[0].clientY; lp = setTimeout(() => { const t = trk(r.dataset.tid); t && U.trackMenu({ clientX: lpx, clientY: lpy }, t); navigator.vibrate && navigator.vibrate(12); }, 520); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((n) => document.addEventListener(n, () => clearTimeout(lp), { passive: true }));

    $('#q').addEventListener('input', A.debounce((e) => { const v = e.target.value; if (v.trim() || A.route.name === 'search') location.replace('#/search/' + encodeURIComponent(v)); }, 160));
    $('#q').addEventListener('focus', () => { if (A.route.name !== 'search') location.hash = '#/search'; });
    $('#pb-vol').addEventListener('input', (e) => E.setVolume(e.target.value / 100)); $('#np-vol').addEventListener('input', (e) => E.setVolume(e.target.value / 100));
    bindSeek($('#pb-seek'), 'pb-cur'); bindSeek($('#np-seek'), 'np-cur');
    window.addEventListener('hashchange', () => A.render());

    // queue drag & drop
    let drag = null;
    document.addEventListener('dragstart', (e) => { const q = e.target.closest && e.target.closest('.q-item[draggable=true]'); if (q) { drag = q; q.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'q'); } });
    document.addEventListener('dragover', (e) => { if (!drag) return; const q = e.target.closest('.q-item[draggable=true]'); if (q && q.dataset.qk === drag.dataset.qk) { e.preventDefault(); $$('.q-item.over').forEach((x) => x.classList.remove('over')); q.classList.add('over'); } });
    document.addEventListener('drop', (e) => { if (!drag) return; const q = e.target.closest('.q-item[draggable=true]'); if (q && q.dataset.qk === drag.dataset.qk && q !== drag) { e.preventDefault(); P.moveInQueue(drag.dataset.qk, +drag.dataset.qi, +q.dataset.qi); } });
    document.addEventListener('dragend', () => { if (drag) drag.classList.remove('dragging'); $$('.q-item.over').forEach((x) => x.classList.remove('over')); drag = null; });

    // file import by drop
    let dc = 0; const hasFiles = (e) => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dc++; $('#drop').hidden = false; } });
    window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dc <= 0) { dc = 0; $('#drop').hidden = true; } });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', (e) => { dc = 0; if (hasFiles(e)) handleDrop(e); });
    $('#file-in').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) runImport((p) => L.addFiles(f, p)); };
    $('#dir-in').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) runImport((p) => L.addFiles(f, p)); };

    // keyboard
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase(); const typing = ['input', 'textarea', 'select'].includes(tag) && e.target.type !== 'range';
      if (e.key === 'Escape') { if (els.np.classList.contains('open')) openNp(false); else if ($('#app').classList.contains('side-open')) ACT['close-side'](); U.closeMenu(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === ' ') { e.preventDefault(); P.toggle(); }
      else if (k === 'ArrowRight') { e.preventDefault(); e.shiftKey ? P.next() : E.seek(E.time + 5); }
      else if (k === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? P.prev() : E.seek(E.time - 5); }
      else if (k === 'ArrowUp') { e.preventDefault(); E.setVolume(E.volume + 0.05); } else if (k === 'ArrowDown') { e.preventDefault(); E.setVolume(E.volume - 0.05); }
      else if (/^m$/i.test(k)) E.toggleMute(); else if (/^l$/i.test(k)) ACT['like-current']();
      else if (/^s$/i.test(k)) P.toggleShuffle(); else if (/^r$/i.test(k)) P.cycleRepeat();
      else if (/^q$/i.test(k)) openSide('queue'); else if (/^y$/i.test(k)) openSide('lyrics');
      else if (/^f$/i.test(k)) openNp(!els.np.classList.contains('open')); else if (/^d$/i.test(k) && A.djEnabled()) location.hash = '#/dj';
      else if (k === '/') { e.preventDefault(); $('#q').focus(); }
    });
  }

  // ---------- boot ----------
  async function boot() {
    document.body.classList.toggle('electron', A.isDesktop);
    document.documentElement.style.setProperty('--blur', A.store.get('blur', 26) + 'px');
    document.body.classList.toggle('calm', A.store.get('bgAnim', true) === false);
    fitHeight(); window.addEventListener('resize', fitHeight); window.addEventListener('orientationchange', () => setTimeout(fitHeight, 250)); if (window.visualViewport) window.visualViewport.addEventListener('resize', fitHeight);
    document.body.classList.toggle('no-dj', !A.djEnabled()); document.body.classList.toggle('direct', E.direct);
    cacheEls(); initIcons(); A.setTheme(A.store.get('theme', 'dark')); U.applyAccent(null);
    updateStateUI(); updateVol(); updateTrackUI(); bindGlobal(); bindDJ();
    try { await L.load(); } catch (e) { console.error(e); A.toast('Storage unavailable — library won’t persist'); }
    // Android: songs used to be copied into the app. Remove those copies now that folders are linked instead.
    if (window.AuroraAndroid && window.AuroraAndroid.scan) {
      const copied = L.tracks.filter((t) => t.kind === 'blob');
      if (copied.length) { try { await L.remove(copied.map((t) => t.id), true); await A.db.clear('files'); L.roots = L.roots.filter((r) => r.id !== 'local'); await A.db.del('roots', 'local'); } catch (e) { console.warn('cleanup', e); } }
    }
    if (!location.hash) location.hash = '#/'; A.render();
    if (P.restoreSession()) { updateTrackUI(); updateStateUI(); } // pick up where the last session stopped (paused)

    P.addEventListener('track', updateTrackUI); P.addEventListener('state', updateStateUI); P.addEventListener('queue', () => { renderSide(); renderNpPanel(); if (A.route.name === 'dj') { /* up-next */ } });
    P.addEventListener('sleep', () => {});
    E.addEventListener('vol', updateVol);
    let rt; const soft = () => { clearTimeout(rt); rt = setTimeout(() => { if (!['settings'].includes(A.route.name) || !document.activeElement || !document.activeElement.closest('#view')) A.render(true); }, 450); };
    L.on((ev, t) => { if (ev === 'like') { $$(`.row[data-tid="${t.id}"] [data-a=like]`).forEach((b) => b.classList.toggle('liked', !!t.liked)); syncLikes(); A.renderSidePlaylists(); if (A.route.name === 'liked') soft(); } else { soft(); } });
    A.analysis.listeners.add(A.debounce(() => { if (A.route.name === 'dj' && !A.dj.active) A.render(true); }, 2000));
    requestAnimationFrame(frame);
    // quiet background tag reading: small chip, never blocks anything
    L.enrichListeners.add(() => {
      let chip = $('#enrich-chip'); const e = L.enriching || L.covering;
      if (!e) { if (chip) chip.remove(); return; }
      if (!chip) { chip = document.createElement('div'); chip.id = 'enrich-chip'; chip.className = 'glass'; document.body.appendChild(chip); }
      chip.textContent = `${L.enriching ? 'Reading song details' : 'Finding album covers'} ${e.done}/${e.total}`;
    });
    setTimeout(() => L.enrich(), 1500);
    setTimeout(() => L.fetchCovers(), 8000);
    checkReconnect();
    setTimeout(() => A.analysis.start(), 2500);
    A.updater.load().then(() => A.updater.start());
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); // ask the OS not to evict the song library
    if ('serviceWorker' in navigator && !A.isDesktop && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A._installEvt = e; $('#btn-install').hidden = false; });
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (!A.isDesktop && !standalone) $('#btn-install').hidden = false;
    // keep screen awake-ish metadata for devices that support it
    if (window.desktop && window.desktop.onMediaKey) window.desktop.onMediaKey((k) => { if (k === 'play') P.toggle(); else if (k === 'next') P.next(); else if (k === 'prev') P.prev(); });
  }
  boot();
})(window.A);

