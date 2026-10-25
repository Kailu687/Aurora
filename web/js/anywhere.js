/* Aurora Anywhere - music that follows you around the computer without taking over the screen.
   - Mini player: a small floating player that stays on top of other windows, with the artwork, the line being sung,
     a seek bar and the controls. On Windows the Aurora window itself shrinks into it (playback never stops); in Chrome
     and Edge it opens as a Picture-in-Picture window. Hover it to see more.
   - Keyboard shortcuts you can change, and on Windows global shortcuts that work while you're in another app. */
(function (A) {
  const L = A.lib, P = A.player, E = A.engine, U = A.ui, $ = A.$, $$ = A.$$, esc = A.esc, icon = A.icon;
  const W = A.anywhere = {};

  // ---------- mini player ----------
  const mini = document.createElement('div'); mini.id = 'mini'; mini.className = 'miniplayer';
  mini.innerHTML = `<div class="mp-drag"><span>Aurora</span></div><div class="mp-main"><div class="mp-art"></div><div class="mp-meta"><b class="ellip" id="mp-title"></b><small class="ellip" id="mp-artist"></small><div class="mp-lyric ellip" id="mp-lyric"></div></div>
    <div class="mp-btns"><button class="icon-btn sm" data-mp="prev" title="Previous">${icon('prev')}</button><button class="icon-btn mp-play" data-mp="toggle" title="Play / pause">${icon('play')}</button><button class="icon-btn sm" data-mp="next" title="Next">${icon('next')}</button><button class="icon-btn sm" data-mp="like" title="Like">${icon('heart')}</button><button class="icon-btn sm" data-mp="expand" title="Back to the full player">${icon('expand')}</button></div></div>
    <div class="mp-seek" data-mp="seek"><i id="mp-fill"></i></div>`;
  document.body.appendChild(mini);
  const mpDo = { prev: () => P.prev(), next: () => P.next(), toggle: () => P.toggle(), like: () => A.actions['like-current'] && A.actions['like-current'](), expand: () => W.mini(false) };
  mini.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mp]'); if (!b) return;
    if (b.dataset.mp === 'seek') { const r = b.getBoundingClientRect(), d = P.isLoaded() ? E.duration : 0; if (d) E.seek(((e.clientX - r.left) / r.width) * d); return; }
    mpDo[b.dataset.mp] && mpDo[b.dataset.mp]();
  });
  function paint() {
    const t = P.current;
    $('#mp-title', mini).textContent = t ? t.title : 'Nothing playing'; $('#mp-artist', mini).textContent = t ? t.artist : 'Press play in Aurora';
    $('.mp-art', mini).innerHTML = t ? U.cover(t) : '';
    $('.mp-play', mini).innerHTML = icon(E.playing ? 'pause' : 'play');
    $('[data-mp=like]', mini).classList.toggle('liked', !!(t && t.liked));
  }
  function tick() {
    if (!W.on) return;
    const d = P.isLoaded() ? E.duration : 0; $('#mp-fill', mini).style.width = d ? (E.time / d) * 100 + '%' : '0';
    const l = A.lyr && A.lyr.state && A.lyr.state(), line = l && l.view && l.idx >= 0 ? l.view[l.idx] : null;
    const el = $('#mp-lyric', mini), txt = line && !line.gap ? line.s : ''; if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('on', !!txt); }
  }
  setInterval(tick, 250);
  P.addEventListener('track', () => { paint(); if (W.on && A.lyr && A.lyr.onChange) A.lyr.onChange(true); }); P.addEventListener('state', paint); L.on((ev) => { if (ev === 'like') paint(); });

  let pip = null;
  W.supported = () => !!(A.isDesktop && window.desktop.setMini) || 'documentPictureInPicture' in window;
  W.mini = async (on = !W.on) => {
    if (on === W.on) return;
    if (A.isDesktop && window.desktop.setMini) {
      W.on = on; document.body.classList.toggle('mini', on); if (on && A.openNp) A.openNp(false);
      await window.desktop.setMini(on); paint(); tick(); return;
    }
    if ('documentPictureInPicture' in window) {
      if (!on) { if (pip) pip.close(); return; }
      try {
        pip = await window.documentPictureInPicture.requestWindow({ width: 440, height: 150 });
        [...document.styleSheets].forEach((s) => { try { const st = pip.document.createElement('style'); st.textContent = [...s.cssRules].map((r) => r.cssText).join('\n'); pip.document.head.appendChild(st); } catch { const ln = pip.document.createElement('link'); ln.rel = 'stylesheet'; ln.href = s.href; pip.document.head.appendChild(ln); } });
        pip.document.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || '');
        pip.document.body.className = document.body.className + ' mini in-pip'; pip.document.body.appendChild(mini); W.on = true; paint(); tick();
        pip.addEventListener('pagehide', () => { document.body.appendChild(mini); W.on = false; pip = null; });
      } catch (e) { A.toast('The mini player needs a click to open'); }
      return;
    }
    A.toast('The mini player works in the Windows app, Chrome and Edge');
  };
  // keep the pop-out's colours in step with the song
  new MutationObserver(() => { if (pip) pip.document.documentElement.setAttribute('style', document.documentElement.getAttribute('style') || ''); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  A.actions.mini = () => W.mini();

  // ---------- keyboard shortcuts ----------
  A.KEY_ACTIONS = {
    toggle: ['Play / pause', ' '], next: ['Next song', 'Shift+ArrowRight'], prev: ['Previous song', 'Shift+ArrowLeft'],
    fwd: ['Forward 5 seconds', 'ArrowRight'], back: ['Back 5 seconds', 'ArrowLeft'], volUp: ['Volume up', 'ArrowUp'], volDown: ['Volume down', 'ArrowDown'],
    mute: ['Mute', 'm'], like: ['Like the song', 'l'], shuffle: ['Shuffle', 's'], repeat: ['Repeat', 'r'],
    queue: ['Queue', 'q'], lyrics: ['Lyrics', 'y'], lyrFull: ['Full-screen lyrics', 'Shift+y'], np: ['Now Playing', 'f'], visuals: ['Change visuals', 'v'],
    mini: ['Mini player', 'i'], search: ['Search', '/'], dj: ['AI DJ', 'd'], flow: ['Flow Architect', 'g']
  };
  A.GLOBAL_DEFAULTS = { toggle: 'CommandOrControl+Alt+Space', next: 'CommandOrControl+Alt+Right', prev: 'CommandOrControl+Alt+Left', mini: 'CommandOrControl+Alt+M', like: 'CommandOrControl+Alt+L' };
  W.keymap = () => { const m = {}; for (const [k, v] of Object.entries(A.KEY_ACTIONS)) m[k] = v[1]; return Object.assign(m, A.store.get('keymap', {}) || {}); };
  const comboOf = (e) => { let k = e.key; if (k === 'Spacebar') k = ' '; if (k.length === 1) k = k.toLowerCase(); return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey && k !== ' ' ? 'Shift+' : '') + k; };
  W.label = (c) => (c ? c.replace(/^ $|\+ $/, (m) => m.replace(' ', 'Space')).replace('ArrowRight', '→').replace('ArrowLeft', '←').replace('ArrowUp', '↑').replace('ArrowDown', '↓').split('+').map((p) => (p.length === 1 ? p.toUpperCase() : p)).join(' + ') : '—');
  const ACT = A.actions;
  W.run = (a) => ({
    toggle: () => P.toggle(), next: () => P.next(), prev: () => P.prev(), fwd: () => E.seek(E.time + 5), back: () => E.seek(E.time - 5),
    volUp: () => E.setVolume(E.volume + 0.05), volDown: () => E.setVolume(E.volume - 0.05), mute: () => E.toggleMute(), like: () => ACT['like-current'](),
    shuffle: () => P.toggleShuffle(), repeat: () => P.cycleRepeat(), queue: () => ACT['side-tab']({ dataset: { id: 'queue' } }), lyrics: () => ACT['side-tab']({ dataset: { id: 'lyrics' } }),
    lyrFull: () => ACT['lyr-full'](), np: () => A.openNp(!document.body.classList.contains('np-open')), visuals: () => ACT['pulse-cycle'](), mini: () => W.mini(),
    search: () => $('#q').focus(), dj: () => { if (A.djEnabled()) location.hash = '#/dj'; }, flow: () => { location.hash = '#/flow'; }
  }[a] || (() => {}))();
  // Returns true when the key was ours
  W.handle = (e) => {
    const c = comboOf(e), m = W.keymap(); const a = Object.keys(m).find((k) => m[k] && m[k].toLowerCase() === c.toLowerCase());
    if (!a) return false; e.preventDefault(); W.run(a); return true;
  };

  // global shortcuts (Windows app): work while another app is in front
  W.globalMap = () => Object.assign({}, A.GLOBAL_DEFAULTS, A.store.get('globalKeys', {}) || {});
  W.applyGlobal = async () => {
    if (!(A.isDesktop && window.desktop.setGlobalKeys)) return null;
    const on = A.store.get('globalOn', true); return window.desktop.setGlobalKeys(on ? W.globalMap() : {});
  };
  if (A.isDesktop && window.desktop.onGlobalKey) { window.desktop.onGlobalKey((a) => W.run(a)); setTimeout(W.applyGlobal, 1500); }
  if (A.isDesktop && window.desktop.onMiniChanged) window.desktop.onMiniChanged((on) => { W.on = on; document.body.classList.toggle('mini', on); paint(); });

  // the shortcuts editor
  const accelOf = (e) => { const parts = []; if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl'); if (e.altKey) parts.push('Alt'); if (e.shiftKey) parts.push('Shift'); let k = e.key; if (/^(Control|Alt|Shift|Meta)$/.test(k)) return null; k = { ' ': 'Space', ArrowRight: 'Right', ArrowLeft: 'Left', ArrowUp: 'Up', ArrowDown: 'Down' }[k] || (k.length === 1 ? k.toUpperCase() : k); if (parts.length < 2) return ''; parts.push(k); return parts.join('+'); };
  W.editor = () => {
    const desk = A.isDesktop && window.desktop.setGlobalKeys;
    const row = (k, lbl, val, g) => `<div class="set-row"><div>${esc(lbl)}</div><div class="ctl"><button class="kbd-btn" data-kk="${k}" data-g="${g ? 1 : ''}">${esc(g ? (val || '—').replace('CommandOrControl', 'Ctrl') : W.label(val))}</button></div></div>`;
    const body = () => `<div class="kbd-edit"><p class="muted" style="margin:0 0 8px">Click a shortcut, then press the new keys. Backspace clears it, Esc cancels.</p>${Object.entries(A.KEY_ACTIONS).map(([k, [l]]) => row(k, l, W.keymap()[k])).join('')}
      ${desk ? `<h3 style="margin:18px 0 6px">Anywhere on your computer</h3><div class="set-row"><div>Global shortcuts<small>Work while you are in another app. Use at least two of Ctrl, Alt and Shift.</small></div><button class="switch${A.store.get('globalOn', true) ? ' on' : ''}" data-a="global-on" role="switch"></button></div>${Object.keys(A.GLOBAL_DEFAULTS).map((k) => row(k, A.KEY_ACTIONS[k][0], W.globalMap()[k], true)).join('')}` : ''}
      <div class="actions" style="margin-top:14px"><button class="btn ghost sm" data-a="keys-reset">Reset to defaults</button></div></div>`;
    let host; U.modal({ title: 'Keyboard shortcuts', html: body(), wide: true, onOpen: (bg) => { host = bg; } });
    const redraw = () => { const b = host.querySelector('.kbd-edit'); if (b) b.outerHTML = body(); };
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-kk]'); if (!b) return;
      $$('.kbd-btn.wait', host).forEach((x) => x.classList.remove('wait')); b.classList.add('wait'); b.textContent = 'Press keys…';
      const glob = !!b.dataset.g;
      const cap = (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (/^(Control|Alt|Shift|Meta)$/.test(ev.key)) return;
        document.removeEventListener('keydown', cap, true);
        if (ev.key === 'Escape') { redraw(); return; }
        if (glob) {
          const acc = ev.key === 'Backspace' ? '' : accelOf(ev); if (acc === '') { if (ev.key !== 'Backspace') { A.toast('Use at least two of Ctrl, Alt and Shift'); redraw(); return; } }
          const gm = A.store.get('globalKeys', {}) || {}; gm[b.dataset.kk] = acc || ''; A.store.set('globalKeys', gm);
          W.applyGlobal().then((r) => { if (r && r.failed && r.failed.length) A.toast('Another app already uses ' + r.failed.join(', ')); });
        } else {
          const km = A.store.get('keymap', {}) || {}, c = ev.key === 'Backspace' ? '' : comboOf(ev), cur = W.keymap();
          for (const [k, v] of Object.entries(cur)) if (c && k !== b.dataset.kk && v && v.toLowerCase() === c.toLowerCase()) km[k] = ''; // one key, one job
          km[b.dataset.kk] = c; A.store.set('keymap', km);
        }
        redraw();
      };
      document.addEventListener('keydown', cap, true);
    });
  };
  Object.assign(A.actions, {
    'keys-edit': () => W.editor(),
    'keys-reset': (el) => { A.store.set('keymap', {}); A.store.set('globalKeys', {}); W.applyGlobal(); const m = el.closest('.modal-bg'); if (m && m.close) m.close(null); W.editor(); },
    'global-on': (el) => { const on = !el.classList.contains('on'); el.classList.toggle('on', on); A.store.set('globalOn', on); W.applyGlobal(); }
  });
})(window.A);
