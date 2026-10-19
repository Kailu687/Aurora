/* Aurora - cloud updates. Checks <updateUrl>/update-manifest.json, asks the user, then installs the new web files.
   - Browser / PWA / Android app: files go into Cache Storage ('aurora-live'), served first by sw.js
   - Desktop app: main process downloads them to its user-data folder and serves them from there */
(function (A) {
  const { $, esc } = A;
  const UP = A.updater = { cfg: {}, status: '', checking: false, listeners: new Set() };
  const say = (s) => { UP.status = s; UP.listeners.forEach((f) => f()); };

  UP.load = async () => { try { UP.cfg = await (await fetch('config.json', { cache: 'no-store' })).json(); } catch { UP.cfg = {}; } };
  UP.url = () => {
    let u = (A.store.get('updateUrl', '') || UP.cfg.updateUrl || '').trim();
    if (!u && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|192\.168\.|\[::1\])/.test(location.hostname)) u = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    if (!u) return '';
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u.replace(/index\.html$/, '').replace(/\/?$/, '/');
  };

  async function getManifest(base) {
    const u = base + 'update-manifest.json?t=' + Date.now();
    if (A.isDesktop) return window.desktop.fetchJSON(u);
    const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // Returns 'none' | 'available' | 'current' | 'error'
  UP.check = async ({ manual = false } = {}) => {
    if (UP.checking) return; const base = UP.url();
    if (!base) { if (manual) { say('Set an update address first.'); A.toast('Enter your update address in Settings first'); } return 'none'; }
    if (!navigator.onLine) { if (manual) say('You’re offline.'); return 'error'; }
    UP.checking = true; if (manual) say('Checking…');
    try {
      const m = await getManifest(base);
      if (!m || typeof m.build !== 'number' || !Array.isArray(m.files)) throw new Error('Not an Aurora update feed');
      if (m.build <= A.VERSION.build) { say(`You’re up to date (v${A.VERSION.name}).`); if (manual) A.toast('You’re on the latest version'); return 'current'; }
      if (!manual && A.store.get('skipBuild', 0) === m.build) { say(`Update v${m.name || m.build} available (skipped).`); return 'available'; }
      say(`Update available: v${m.name || m.build}`);
      UP.prompt(m, base); return 'available';
    } catch (e) { say('Couldn’t check for updates: ' + (e.message || e)); if (manual) A.toast('Update check failed'); return 'error'; }
    finally { UP.checking = false; }
  };

  UP.prompt = async (m, base) => {
    const r = await A.ui.modal({
      title: 'Update available',
      html: `<p>Aurora <b>v${esc(m.name || m.build)}</b> is ready (you have v${esc(A.VERSION.name)}).</p>${m.notes ? `<p class="muted">${esc(m.notes)}</p>` : ''}<p class="faint" style="font-size:13px">Your library and playlists are kept. The app restarts once the update is installed.</p>`,
      buttons: [{ label: 'Skip this version', value: 'skip' }, { label: 'Later', value: null }, { label: 'Update now', cls: 'accent', value: 'go' }]
    });
    if (r === 'skip') { A.store.set('skipBuild', m.build); return; }
    if (r === 'go') UP.apply(m, base);
  };

  UP.apply = async (m, base) => {
    A.toast('Downloading update…', 8000); say('Downloading…');
    try {
      if (A.isDesktop) {
        await window.desktop.applyUpdate(base, m);
      } else {
        if (!('caches' in window)) throw new Error('This browser can’t store updates');
        const got = [];
        for (const f of m.files) {
          const res = await fetch(base + f.path + '?v=' + m.build, { cache: 'reload' });
          if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (f.size && buf.byteLength !== f.size) throw new Error(`${f.path}: size mismatch`);
          got.push([f.path, buf, res.headers.get('content-type') || '']);
        }
        const cache = await caches.open('aurora-live');
        for (const [p, buf, type] of got) {
          const headers = type ? { 'content-type': type } : {};
          const url = new URL(p, location.href).href;
          await cache.put(url, new Response(buf.slice(0), { headers }));
          if (p === 'index.html') { await cache.put(new URL('./', location.href).href, new Response(buf.slice(0), { headers })); }
        }
        await cache.put('/__live-build', new Response(String(m.build)));
      }
      A.store.set('liveBuild', m.build); say('Installed. Restarting…'); A.toast('Updated! Restarting…');
      setTimeout(() => location.reload(), 900);
    } catch (e) { say('Update failed: ' + (e.message || e)); A.toast('Update failed. Nothing was changed.'); }
  };

  // Called on boot: auto check shortly after launch, then every few hours while open
  UP.start = () => {
    if (A.store.get('autoUpdate', true) === false) return;
    setTimeout(() => UP.check(), 5000);
    setInterval(() => UP.check(), 6 * 3600 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (UP._last || 0) > 1800e3) { UP._last = Date.now(); UP.check(); } });
  };
})(window.A);
