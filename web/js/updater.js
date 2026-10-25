/* Aurora - cloud updates. Checks <updateUrl>/update-manifest.json, checks its signature, downloads the new web files
   in the background and installs them the next time Aurora starts (or straight away with "Restart now").
   - Browser / PWA / Android app: files are staged in Cache Storage ('aurora-staged'), then moved to 'aurora-live',
     which sw.js serves first
   - Desktop app: the main process downloads, checks and stages them in its user-data folder
   Updates only ever replace app files. Songs, playlists, likes, history and settings live elsewhere and are kept. */
(function (A) {
  const { esc } = A;
  const UP = A.updater = { cfg: {}, status: '', checking: false, listeners: new Set(), ready: null, native: null };
  const say = (s) => { UP.status = s; UP.listeners.forEach((f) => f()); };
  const LIVE = 'aurora-live', STAGED = 'aurora-staged';
  // Public half of the Aurora update signing key (ECDSA P-256, SPKI, base64). Updates not signed with the matching
  // private key are refused. Stamped by tools/publish-web.js from the key it signs with.
  const UPDATE_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEwfLIbeph/bWLpFKGZXqOw8fZ9DmydoKExAz+FEWyMXHyzIsWeNVV0pdxOKZ+2yea2cOd01aiPDA6Oq8kiAh5Rg==';
  // Android app builds and Windows versions from before the app could report its own version
  const LEGACY_ANDROID_BUILD = 19, LEGACY_WINDOWS_VERSION = '1.6.2';
  // the oldest installed app (Android build / Windows version) that this version of Aurora's features work with
  const NATIVE_MIN = { android: 20, windows: '1.7.0' };
  A.DOWNLOADS_URL = 'https://kailashamarnath.me/Aurora/downloads/';

  UP.load = async () => { try { UP.cfg = await (await fetch('config.json', { cache: 'no-store' })).json(); } catch { UP.cfg = {}; } };
  // Update sources in order of preference: a user override, config.json (your domain), the fallback address
  // (the github.io address keeps working even if the custom domain changes), or this site itself when served online.
  const clean = (u) => { u = (u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return u.replace(/index\.html$/, '').replace(/\/?$/, '/'); };
  UP.bases = () => {
    const own = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|192\.168\.|\[::1\])/.test(location.hostname) ? location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '') : '';
    return [...new Set([A.store.get('updateUrl', ''), UP.cfg.updateUrl, UP.cfg.updateUrlFallback, own].map(clean).filter(Boolean))];
  };
  UP.url = () => UP.bases()[0] || '';

  // ---------- signatures ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  A.signedPayload = (m) => JSON.stringify({ name: m.name, build: m.build, notes: m.notes, published: m.published, files: m.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })), native: m.native || null });
  UP.verify = async (m) => {
    if (!m || typeof m.build !== 'number' || !Array.isArray(m.files)) throw new Error('Not an Aurora update feed');
    if (!m.sig) throw new Error('Update is not signed');
    if (!(window.crypto && crypto.subtle)) throw new Error('This device can’t check update signatures');
    const key = await crypto.subtle.importKey('spki', b64(UPDATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64(m.sig), new TextEncoder().encode(A.signedPayload(m)));
    if (!ok) throw new Error('Update signature is not valid');
    return true;
  };

  async function getManifest(base) {
    const u = base + 'update-manifest.json?t=' + Date.now();
    if (A.isDesktop) return window.desktop.fetchJSON(u);
    const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  // ---------- new Android app / Windows installer ----------
  const vcmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
  A.vcmp = vcmp;
  UP.shell = async () => {
    if (A.isDesktop) { let v = LEGACY_WINDOWS_VERSION; try { if (window.desktop.shellInfo) v = (await window.desktop.shellInfo()).version; } catch { /* old shell */ } return { os: 'windows', version: v }; }
    if (window.AuroraAndroid) { let b = LEGACY_ANDROID_BUILD; try { if (window.AuroraAndroid.appBuild) b = +window.AuroraAndroid.appBuild() || b; } catch { /* old app */ } return { os: 'android', build: b }; }
    return null;
  };
  UP.checkNative = async (m) => {
    const sh = await UP.shell(); const n = m && m.native; UP.native = null;
    if (!sh || !n) return null;
    const rel = sh.os === 'android' ? n.android : n.windows; if (!rel) return null;
    const newer = sh.os === 'android' ? rel.build > sh.build : vcmp(rel.version, sh.version) > 0;
    if (!newer) return null;
    // Most updates arrive inside the app by themselves. Only ask people to install a new app when the one they
    // have is too old for this version's features; otherwise just mention it quietly in Settings.
    const needed = sh.os === 'android' ? sh.build < NATIVE_MIN.android : vcmp(sh.version, NATIVE_MIN.windows) < 0;
    UP.native = { os: sh.os, version: rel.version, url: rel.url || A.DOWNLOADS_URL, notes: rel.notes || '', needed };
    if (needed && A.store.get('nativeSeen', '') !== sh.os + rel.version) A.updater.showNativeBanner();
    return UP.native;
  };
  UP.showNativeBanner = () => {
    const n = UP.native; if (!n || document.getElementById('native-up')) return;
    const b = document.createElement('div'); b.id = 'native-up'; b.className = 'up-chip glass';
    b.innerHTML = `<div><b>New ${n.os === 'android' ? 'Android app' : 'Windows app'} · v${esc(n.version)}</b><small>${esc(n.notes || 'Some new features need the new app. Install it over this one: your music and playlists stay.')}</small></div><a class="btn accent sm" href="${esc(n.url)}" target="_blank" rel="noopener">${n.os === 'android' ? 'Download' : 'Get it'}</a><button class="icon-btn sm" aria-label="Dismiss">${A.icon('x')}</button>`;
    b.querySelector('a').addEventListener('click', () => A.store.set('nativeSeen', n.os + n.version));
    b.querySelector('button').addEventListener('click', () => { A.store.set('nativeSeen', n.os + n.version); b.remove(); });
    document.body.appendChild(b);
  };

  // Returns 'none' | 'available' | 'current' | 'error'
  UP.check = async ({ manual = false } = {}) => {
    if (UP.checking) return; const bases = UP.bases();
    if (!bases.length) { if (manual) say('No update source is configured.'); return 'none'; }
    if (!navigator.onLine) { if (manual) say('You’re offline.'); return 'error'; }
    UP.checking = true; if (manual) say('Checking…');
    try {
      let m = null, base = '', lastErr = null;
      for (const b of bases) { try { m = await getManifest(b); base = b; break; } catch (e) { lastErr = e; } }
      if (!m) throw lastErr || new Error('No update source reachable');
      await UP.verify(m);
      UP.checkNative(m).catch(() => {});
      const have = Math.max(A.VERSION.build, UP.ready ? UP.ready.build : 0);
      if (m.build <= have) { say(UP.ready ? `v${UP.ready.name} is ready. It installs when Aurora restarts.` : `You’re up to date (v${A.VERSION.name}).`); if (manual) A.toast(UP.ready ? 'Update ready: restart to finish' : 'You’re on the latest version'); return 'current'; }
      if (!manual && A.store.get('skipBuild', 0) === m.build) { say(`Update v${m.name || m.build} available (skipped).`); return 'available'; }
      say(`Update available: v${m.name || m.build}`);
      if (!manual && A.store.get('updateMode', 'auto') === 'auto') await UP.download(m, base, { quiet: true });
      else UP.prompt(m, base);
      return 'available';
    } catch (e) { say('Couldn’t check for updates: ' + (e.message || e)); if (manual) A.toast('Update check failed'); return 'error'; }
    finally { UP.checking = false; }
  };

  UP.prompt = async (m, base) => {
    const r = await A.ui.modal({
      title: 'Update available',
      html: `<p>Aurora <b>v${esc(m.name || m.build)}</b> is ready (you have v${esc(A.VERSION.name)}).</p>${m.notes ? `<p class="muted">${esc(m.notes)}</p>` : ''}<p class="faint" style="font-size:13px">Your library, playlists, likes and history are kept. A backup is saved on this device before anything is installed.</p>`,
      buttons: [{ label: 'Skip this version', value: 'skip' }, { label: 'Later', value: null }, { label: 'Update now', cls: 'accent', value: 'go' }]
    });
    if (r === 'skip') { A.store.set('skipBuild', m.build); return; }
    if (r === 'go') { if (await UP.download(m, base)) UP.restart(); }
  };

  // Download every file, check its size and SHA-256 against the signed list, then stage the set.
  UP.download = async (m, base, { quiet = false } = {}) => {
    if (!quiet) { A.toast('Downloading update…', 8000); }
    say('Downloading v' + (m.name || m.build) + '…');
    try {
      if (A.safety) await A.safety.snapshot('Before update to v' + (m.name || m.build)).catch(() => {});
      if (A.isDesktop) {
        if (window.desktop.downloadUpdate) await window.desktop.downloadUpdate(base);
        else await window.desktop.applyUpdate(base, m); // Windows app from before v1.7: installs straight away, active on reload
      } else {
        if (!('caches' in window)) throw new Error('This browser can’t store updates');
        const got = [];
        for (const f of m.files) {
          const res = await fetch(base + f.path + '?v=' + m.build, { cache: 'reload' });
          if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (buf.byteLength !== f.size) throw new Error(`${f.path}: size mismatch`);
          if (hex(await crypto.subtle.digest('SHA-256', buf)) !== f.sha256) throw new Error(`${f.path}: checksum mismatch`);
          got.push([f.path, buf, res.headers.get('content-type') || '']);
        }
        await caches.delete(STAGED); const cache = await caches.open(STAGED);
        for (const [p, buf, type] of got) await cache.put(new URL(p, location.href).href, new Response(buf, { headers: type ? { 'content-type': type } : {} }));
        await cache.put('/__staged-build', new Response(JSON.stringify({ build: m.build, name: m.name })));
      }
      UP.ready = { build: m.build, name: m.name || String(m.build) };
      say(`v${UP.ready.name} is ready. It installs when Aurora restarts.`);
      UP.showReady();
      return true;
    } catch (e) { say('Update failed: ' + (e.message || e)); if (!quiet) A.toast('Update failed. Nothing was changed.'); return false; }
  };

  // Moves a staged update into place. Web / Android: done here, then the page reloads. Desktop: the app restarts.
  async function promoteStaged() {
    const st = await caches.open(STAGED); const meta = await st.match('/__staged-build'); if (!meta) return null;
    const info = JSON.parse(await meta.text());
    if (info.build <= A.VERSION.build) { await caches.delete(STAGED); return null; }
    const reqs = (await st.keys()).filter((r) => !new URL(r.url).pathname.startsWith('/__'));
    await caches.delete(LIVE); const live = await caches.open(LIVE);
    for (const r of reqs) {
      const res = await st.match(r); const buf = await res.arrayBuffer(); const headers = { 'content-type': res.headers.get('content-type') || '' };
      await live.put(r.url, new Response(buf.slice(0), { headers }));
      if (new URL(r.url).pathname.endsWith('/index.html')) await live.put(new URL('./', r.url).href, new Response(buf.slice(0), { headers }));
    }
    await live.put('/__live-build', new Response(String(info.build))); await live.put('/__boot-tries', new Response('0'));
    await caches.delete(STAGED); A.store.set('liveBuild', info.build);
    return info;
  }
  UP.restart = async () => {
    say('Installing…');
    if (A.isDesktop) { if (window.desktop.relaunch) return window.desktop.relaunch(); return location.reload(); }
    try { await promoteStaged(); } catch (e) { A.toast('Update failed. Nothing was changed.'); return; }
    A.toast('Updated! Restarting…'); setTimeout(() => location.reload(), 600);
  };
  // Called first thing on start-up: an update downloaded last time is installed now, before the app draws anything.
  UP.bootApply = async () => {
    if (A.isDesktop || !('caches' in window)) return false;
    try { if (!(await caches.has(STAGED))) return false; const info = await promoteStaged(); if (info) { location.reload(); return true; } } catch (e) { console.warn('staged update', e); }
    return false;
  };
  UP.bootOk = () => {
    try { if (A.isDesktop && window.desktop.bootOk) window.desktop.bootOk(); else if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'boot-ok' }); } catch { /* */ }
  };

  UP.showReady = () => {
    if (!UP.ready || document.getElementById('up-ready')) return;
    const b = document.createElement('div'); b.id = 'up-ready'; b.className = 'up-chip glass';
    b.innerHTML = `<div><b>Aurora v${esc(UP.ready.name)} is ready</b><small>It installs next time you open Aurora. Your music and playlists stay as they are.</small></div><button class="btn accent sm" data-x="go">Restart now</button><button class="icon-btn sm" data-x="close" aria-label="Later">${A.icon('x')}</button>`;
    b.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (!x) return; b.remove(); if (x.dataset.x === 'go') UP.restart(); });
    document.body.appendChild(b);
  };

  // ---------- what's new ----------
  UP.whatsNew = async ({ force = false } = {}) => {
    const seen = A.store.get('seenVersion', '');
    A.store.set('seenVersion', A.VERSION.name);
    if (!force && (seen === A.VERSION.name || (!seen && !A.lib.tracks.length))) return;
    let log = []; try { log = await (await fetch('changelog.json', { cache: 'no-store' })).json(); } catch { /* none */ }
    const entries = log.filter((e) => force ? true : !seen || vcmp(e.version, seen) > 0).slice(0, force ? 6 : 3);
    if (!entries.length) return;
    A.ui.modal({
      title: force ? 'What’s new in Aurora' : `What’s new in v${A.VERSION.name}`, wide: true,
      html: `<div class="whatsnew">${entries.map((e) => `<div class="wn-v"><div class="wn-h"><b>v${esc(e.version)}</b><span class="faint">${esc(e.date || '')}</span></div><ul>${(e.notes || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('')}</div><p class="faint" style="font-size:13px">Your library, playlists, likes and history carried over.</p>`,
      buttons: [{ label: 'Nice', cls: 'accent', value: null }]
    });
  };

  // Called on boot: auto check shortly after launch, then every few hours while open
  UP.start = () => {
    if (A.store.get('autoUpdate', true) === false) return;
    setTimeout(() => UP.check(), 5000);
    setInterval(() => UP.check(), 6 * 3600 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (UP._last || 0) > 1800e3) { UP._last = Date.now(); UP.check(); } });
  };
})(window.A);
