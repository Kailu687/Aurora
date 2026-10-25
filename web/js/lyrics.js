/* Aurora - lyrics that feel part of the song.
   - Synced lyrics glide: the current line lights up and fills as it is sung, nearby lines stay soft, and gaps in the
     singing show a quiet interlude instead of a stuck line. Tap a line to jump there.
   - Lyrics without timings are shown as plain text, honestly, with no fake highlighting.
   - Find lyrics: looks the song up on LRCLIB (lrclib.net), a free, open lyrics database that needs no account or key,
     and prefers the time-synced version whose length matches your file. Only the title, artist, album and length are sent.
   - Timing nudge per song, a full-screen lyrics view, and a collection of favourite lines. */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine, esc = A.esc, icon = A.icon, $ = A.$, $$ = A.$$;
  const Y = A.lyr = {};
  const sig = (t) => A.norm(t.artist) + '|' + A.norm(t.title);

  // ---------- timing nudge (per song, kept with your settings and backups) ----------
  Y.offset = (t) => (t && (A.store.get('lrcOffsets', {}) || {})[t.id]) || 0;
  Y.nudge = (t, d) => { const o = A.store.get('lrcOffsets', {}) || {}; const v = Math.round(((o[t.id] || 0) + d) * 10) / 10; if (v) o[t.id] = v; else delete o[t.id]; A.store.set('lrcOffsets', o); return v; };

  // ---------- favourite lines ----------
  Y.saved = () => A.store.get('savedLines', []) || [];
  const keyOf = (t, text) => t.id + '|' + text;
  Y.isSaved = (t, text) => Y.saved().some((x) => keyOf({ id: x.id }, x.text) === keyOf(t, text) || (x.s === sig(t) && x.text === text));
  Y.toggleSave = (t, line) => {
    let all = Y.saved(); const on = Y.isSaved(t, line.s);
    if (on) all = all.filter((x) => !((x.id === t.id || x.s === sig(t)) && x.text === line.s));
    else all.unshift({ id: t.id, s: sig(t), title: t.title, artist: t.artist, text: line.s, t: line.t >= 0 ? line.t : -1, at: Date.now() });
    A.store.set('savedLines', all.slice(0, 500)); A.safety.mirror('savedLines', all);
    return !on;
  };

  // ---------- finding lyrics online (LRCLIB) ----------
  const getJSON = async (url) => {
    if (A.isDesktop && window.desktop && window.desktop.fetchJSON) return window.desktop.fetchJSON(url);
    const r = await fetch(url); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  };
  const API = 'https://lrclib.net/api/';
  const qs = (o) => Object.entries(o).filter(([, v]) => v !== '' && v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  const missKey = 'lyrMiss';
  Y.missedRecently = (t) => { const m = A.store.get(missKey, {}) || {}; return m[t.id] && Date.now() - m[t.id] < 7 * 864e5; };
  const noteMiss = (t) => { const m = A.store.get(missKey, {}) || {}; m[t.id] = Date.now(); const ks = Object.keys(m); if (ks.length > 400) delete m[ks[0]]; A.store.set(missKey, m); };
  Y.busy = new Set();
  // Returns { text, synced, drift } or null. Saves the lyrics for the song when found.
  Y.find = async (t) => {
    if (!t || Y.busy.has(t.id)) return null; Y.busy.add(t.id);
    try {
      const artist = (A.splitArtists(t.artist)[0] || t.artist || '').trim(), dur = Math.round(t.duration || 0);
      let hit = null;
      try { hit = await getJSON(API + 'get?' + qs({ track_name: t.title, artist_name: artist, album_name: t.album, duration: dur || '' })); } catch (e) { if (!/404/.test(String(e && e.message))) throw e; }
      if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) {
        let list = []; try { list = (await getJSON(API + 'search?' + qs({ track_name: t.title, artist_name: artist }))) || []; } catch { /* */ }
        if (!list.length) try { list = (await getJSON(API + 'search?' + qs({ q: `${t.title} ${artist}` }))) || []; } catch { /* */ }
        // the closest in length wins; a synced version beats a plain one when lengths are close
        list = list.filter((x) => x && (x.syncedLyrics || x.plainLyrics) && !x.instrumental).map((x) => [Math.abs((x.duration || 0) - dur) - (x.syncedLyrics ? 2.5 : 0), x]).sort((a, b) => a[0] - b[0]);
        hit = list.length && (!dur || Math.abs((list[0][1].duration || dur) - dur) < 12) ? list[0][1] : null;
      }
      if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) { noteMiss(t); return null; }
      const text = hit.syncedLyrics || hit.plainLyrics;
      await L.saveLyrics(t, text);
      return { text, synced: !!hit.syncedLyrics, drift: hit.duration && dur ? Math.round(hit.duration - dur) : 0 };
    } finally { Y.busy.delete(t.id); }
  };
  Y.auto = () => A.store.get('autoLyrics', true);

  // ---------- drawing ----------
  // `l` is the shell's lyrics state: { id, data: {synced, lines:[{t,s}]} | null | undefined, idx }
  Y.html = (l, t) => {
    if (!t) return `<div class="no-lyrics">${icon('mic')}<div>Play a song to see lyrics.</div></div>`;
    if (!l || l.data === undefined || Y.busy.has(t.id)) return `<div class="no-lyrics muted"><div class="ly-dots"><i></i><i></i><i></i></div>${Y.busy.has(t.id) ? 'Looking for lyrics on the web…' : 'Looking for lyrics…'}</div>`;
    if (!l.data) return `<div class="no-lyrics">${icon('mic')}<div><b>No lyrics for this song yet</b><br><span style="font-size:13px">Aurora can look them up for free on LRCLIB, an open lyrics library. Or add a .lrc file next to the song.</span></div><div class="actions" style="justify-content:center"><button class="btn accent sm" data-a="lyr-find">${icon('search')} Find lyrics</button><button class="btn ghost sm" data-a="edit-current">${icon('edit')} Type them in</button></div></div>`;
    const d = l.data;
    if (!d.synced) {
      return `<div class="lyrics plain"><div class="ly-note">${icon('info')}<span>These lyrics aren’t timed to the music.</span><button class="chip" data-a="lyr-find">Find synced lyrics</button></div>${d.lines.map((x, i) => `<p data-i="${i}">${esc(x.s)}<button class="ly-save${Y.isSaved(t, x.s) ? ' on' : ''}" data-a="lyr-save" data-i="${i}" title="Save this line">${icon('heart')}</button></p>`).join('')}</div>`;
    }
    const lines = withGaps(d.lines); l.view = lines;
    const off = Y.offset(t);
    return `<div class="lyrics synced">${lines.map((x, i) => x.gap
      ? `<p class="ly gap" data-i="${i}" data-t="${x.t}"><i></i><i></i><i></i></p>`
      : `<p class="ly" data-i="${i}" data-t="${x.t}"><span class="lt">${esc(x.s)}</span><button class="ly-save${Y.isSaved(t, x.s) ? ' on' : ''}" data-a="lyr-save" data-i="${i}" title="Save this line">${icon('heart')}</button></p>`).join('')}
      <div class="ly-tools"><span>Timing</span><button class="chip" data-a="lyr-off" data-d="-0.5" title="Lyrics appear earlier">−0.5s</button><b id="ly-off">${off > 0 ? '+' : ''}${off.toFixed(1)}s</b><button class="chip" data-a="lyr-off" data-d="0.5" title="Lyrics appear later">+0.5s</button></div></div>`;
  };
  // long pauses in the singing become a breathing "• • •" line instead of keeping the last line lit
  function withGaps(lines) {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const x = lines[i], nx = lines[i + 1];
      if (!x.s.trim()) { out.push({ t: x.t, s: '', gap: true }); continue; }
      out.push(x);
      if (i === 0 && x.t > 8) out.unshift({ t: 0, s: '', gap: true });
      if (nx && nx.t - x.t > 14 && x.s.length < 80) out.push({ t: x.t + Math.min(7, (nx.t - x.t) / 2), s: '', gap: true });
    }
    return out;
  }
  // called every frame with the song time: lights the current line and fills it as it is sung
  Y.sync = (l, time) => {
    if (!l || !l.data || !l.data.synced || !l.view) return;
    const boxes = $$('.lyrics.synced'); if (!boxes.length) return;
    const t = time - Y.offset(P.current), lines = l.view;
    let i = -1; for (let k = 0; k < lines.length; k++) { if (lines[k].t <= t + 0.15) i = k; else break; }
    const cur = lines[i], nx = lines[i + 1];
    const p = cur ? A.clamp((t - cur.t) / Math.max(0.6, Math.min(8, ((nx ? nx.t : cur.t + 4) - cur.t) * 0.92)), 0, 1) : 0;
    boxes.forEach((box) => { const on = box.children[i]; if (on) on.style.setProperty('--lp', (p * 100).toFixed(1) + '%'); });
    if (i === l.idx) return; l.idx = i;
    boxes.forEach((box) => {
      const ps = box.querySelectorAll('p.ly');
      for (let k = 0; k < ps.length; k++) { const dd = Math.min(5, Math.abs(k - i)); ps[k].classList.toggle('on', k === i); ps[k].classList.toggle('past', k < i); ps[k].style.setProperty('--d', i < 0 ? 2 : dd); }
      if (ps[i]) { const sc = box.closest('#side-body, .np-panel'); if (sc && sc.offsetParent) sc.scrollTo({ top: ps[i].offsetTop - sc.clientHeight * (document.body.classList.contains('lyr-full') ? 0.4 : 0.32), behavior: 'smooth' }); }
    });
  };

  // ---------- actions (merged into the shell's click handler) ----------
  const A2 = A.actions;
  A2['lyr-find'] = async () => {
    const t = P.current; if (!t) return;
    const p = Y.find(t); A.lyr.onChange(); // shows "looking…"
    try {
      const r = await p;
      if (!r) A.toast('No lyrics found for this song');
      else A.toast(r.synced ? (Math.abs(r.drift) > 3 ? `Found synced lyrics (made for a version ${Math.abs(r.drift)}s ${r.drift > 0 ? 'longer' : 'shorter'}; nudge the timing if needed)` : 'Found synced lyrics') : 'Found lyrics (not timed)');
    } catch (e) { A.toast('Couldn’t reach the lyrics library. Check your connection.'); }
    A.lyr.onChange(true);
  };
  A2['lyr-save'] = (el) => {
    const t = P.current, l = A.lyr.state && A.lyr.state(); if (!t || !l || !l.data) return;
    const line = (l.data.synced ? l.view : l.data.lines)[+el.dataset.i]; if (!line) return;
    const on = Y.toggleSave(t, line); el.classList.toggle('on', on); A.toast(on ? 'Line saved to your collection' : 'Line removed');
  };
  A2['lyr-off'] = (el) => { const t = P.current; if (!t) return; const v = Y.nudge(t, +el.dataset.d); const b = $('#ly-off'); if (b) b.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + 's'; const l = A.lyr.state && A.lyr.state(); if (l) l.idx = -2; };
  A2['lyr-full'] = () => Y.full(!document.body.classList.contains('lyr-full'));
  A2['line-play'] = (el) => {
    const x = Y.saved()[+el.dataset.i]; if (!x) return; const t = L.byId.get(x.id) || L.tracks.find((o) => sig(o) === x.s); if (!t) { A.toast('That song isn’t in your library any more'); return; }
    P.playContext([t.id], t.id, { type: 'single', name: 'Saved lines' });
    if (x.t > 0) { const go = () => { if (P.current && P.current.id === t.id && P.isLoaded()) E.seek(Math.max(0, x.t - 0.6)); else setTimeout(go, 150); }; setTimeout(go, 150); }
  };
  A2['line-del'] = (el) => { const all = Y.saved(); all.splice(+el.dataset.i, 1); A.store.set('savedLines', all); A.safety.mirror('savedLines', all); A.render(true); };
  A2['line-share'] = (el) => { const x = Y.saved()[+el.dataset.i]; if (x) Y.shareCard(x); };

  // full-screen lyrics: the art steps back and the words take the stage
  Y.full = (on) => {
    if (on && A.openNp) { A.openNp(true); A.lyr.showTab && A.lyr.showTab(); }
    document.body.classList.toggle('lyr-full', !!on);
    const l = A.lyr.state && A.lyr.state(); if (l) l.idx = -2;
  };

  // ---------- favourite lines page ----------
  Y.page = (el) => {
    const all = Y.saved();
    el.innerHTML = `<div class="page"><h1>Saved lines</h1><p class="muted" style="margin-top:-6px">Lines you loved, from the lyrics of your songs. Tap the heart next to any lyric line to keep it here.</p>
      ${all.length ? `<div class="lines">${all.map((x, i) => `<div class="line-card"><blockquote>${esc(x.text)}</blockquote><div class="lc-foot"><div><b>${esc(x.title)}</b><small>${esc(x.artist)}${x.t > 0 ? ' · ' + A.fmt(x.t) : ''}</small></div>
        <button class="icon-btn sm" data-a="line-play" data-i="${i}" title="Play from this line">${icon('play')}</button><button class="icon-btn sm" data-a="line-share" data-i="${i}" title="Share as an image">${icon('upload')}</button><button class="icon-btn sm" data-a="line-del" data-i="${i}" title="Remove">${icon('x')}</button></div></div>`).join('')}</div>`
      : `<div class="empty">${icon('mic')}<div>No saved lines yet. Open the lyrics while a song plays and tap the heart next to a line.</div></div>`}</div>`;
  };
  // a quote card image for sharing
  Y.shareCard = async (x) => {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const cs = getComputedStyle(document.documentElement), a1 = `rgb(${cs.getPropertyValue('--ar')})`, a2 = `rgb(${cs.getPropertyValue('--ar2')})`;
    const t = L.byId.get(x.id), art = t && L.artUrl(t);
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, a1); bg.addColorStop(1, a2); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    if (art) { try { const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = art; }); g.save(); g.beginPath(); g.roundRect ? g.roundRect(90, 110, 180, 180, 24) : g.rect(90, 110, 180, 180); g.clip(); g.drawImage(im, 90, 110, 180, 180); g.restore(); } catch { /* no art */ } }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '700 150px Georgia, serif'; g.fillText('“', 84, 470);
    g.fillStyle = '#fff'; g.font = '800 64px Inter, system-ui, sans-serif';
    const words = x.text.split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const tryL = cur ? cur + ' ' + w : w; if (g.measureText(tryL).width > W - 180) { lines.push(cur); cur = w; } else cur = tryL; } if (cur) lines.push(cur);
    lines.slice(0, 9).forEach((ln, i) => g.fillText(ln, 90, 560 + i * 82));
    g.font = '700 40px Inter, system-ui, sans-serif'; g.fillText(x.title, 90, H - 190); g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '500 34px Inter, system-ui, sans-serif'; g.fillText(x.artist, 90, H - 140);
    g.font = '800 30px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText('AURORA', W - 230, H - 140);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); const file = new File([blob], 'aurora-line.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch { /* cancelled */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'aurora-line.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
})(window.A);
