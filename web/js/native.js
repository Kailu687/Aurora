/* Aurora - Android bridge.
   Talks to the native side of the Android app (window.AuroraAndroid, injected by MainActivity):
   - notification-bar / lock-screen / Samsung media-panel player (PlayerService)
   - music folder access (Storage Access Framework) and cover lookups over HTTPS
   - text-to-speech for the AI DJ
   The hardware back button is handled natively and calls A.handleBack().
   Outside the Android app (browser, desktop) this file does nothing. */
(function (A) {
  const AA = window.AuroraAndroid;
  A.isNative = !!AA;
  if (!AA) return;
  const P = A.player, E = A.engine, L = A.lib;
  const N = A.native = { sent: 0 };

  const call = (fn, ...args) => { try { return AA[fn](...args); } catch (e) { console.warn('native ' + fn, e); return 'error: ' + e; } };
  N.status = () => { try { return JSON.parse(AA.status()); } catch { return null; } };
  N.requestPermission = () => call('requestPermission');
  N.openSettings = () => call('openSettings');

  // ----- events coming from the Android side -----
  A.nativeEvent = (ev, d) => {
    if (ev === 'http') { const p = A._http && A._http.get(d.id); if (p) { A._http.delete(d.id); d.ok ? p.res(d.body) : p.rej(new Error(d.error || 'http failed')); } return; }
    if (ev === 'folder' && A._folderRes) { const r = A._folderRes; A._folderRes = null; r(d); }
    if (ev === 'mic' && A._micRes) { const r = A._micRes; A._micRes = null; r(!!d); }
  };
  // buttons in the notification / lock screen
  A.nativeCmd = (cmd, arg) => {
    if (cmd === 'play') { P.isLoaded() ? E.resumePlay().catch(() => {}) : P.toggle(); }
    else if (cmd === 'pause') E.pause();
    else if (cmd === 'next') P.next();
    else if (cmd === 'prev') P.prev();
    else if (cmd === 'seek') { P.seekTo(arg); setTimeout(push, 400); }
    else if (cmd === 'ttsdone') { const s = A.speech; s.speaking = false; if (s._native) { const r = s._native; s._native = null; r(true); } }
  };

  // ----- player -> notification -----
  const artCache = new Map();
  async function artB64(t) { // the native side can't read blob: URLs, so hand it a small JPEG
    const url = L.artUrl(t); if (!url) return '';
    if (artCache.has(url)) return artCache.get(url);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = c.height = 360; c.getContext('2d').drawImage(img, 0, 0, 360, 360);
      const d = c.toDataURL('image/jpeg', 0.85).split(',')[1]; artCache.set(url, d); return d;
    } catch { return ''; }
  }
  let artSent = null, tok = 0;
  async function push() {
    const t = P.current; if (!t) return;
    const my = ++tok, loaded = P.isLoaded();
    const payload = {
      title: t.title, artist: t.artist, album: t.album || '', duration: (loaded ? E.duration : 0) || t.duration || 0,
      position: loaded ? E.time : (P.resume ? P.resume.pos : 0), rate: E.rate || 1, playing: !!(loaded && E.playing)
    };
    const artId = t.id + ':' + (L.artUrl(t) ? 1 : 0); // re-send the picture when a cover arrives later
    if (artSent !== artId) { payload.art = await artB64(t); payload.clearArt = !payload.art; artSent = artId; if (my !== tok) return; }
    if (call('update', JSON.stringify(payload)) === 'ok') N.sent++;
  }
  P.addEventListener('track', () => {
    push();
    if (!A.store.get('notifAsked', false)) { A.store.set('notifAsked', true); setTimeout(() => call('requestPermission'), 1500); } // Android 13+ asks once
  });
  P.addEventListener('state', () => { if (P.isLoaded()) push(); });
  E.addEventListener('meta', push);
  setInterval(() => { if (E.playing) push(); }, 5000);
})(window.A);
