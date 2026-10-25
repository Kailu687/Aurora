// Aurora desktop shell. Serves the web app from a private app:// scheme (so WebAudio, IndexedDB and
// range-seeking all behave like a real origin) and exposes the user's music folders via app://local/__lib/.
const { app, BrowserWindow, protocol, dialog, ipcMain, shell, globalShortcut, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const WEB = path.join(__dirname, '..', 'web');
const AUDIO = /\.(mp3|m4a|mp4|m4b|aac|wav|flac|ogg|oga|opus|webm|weba)$/i;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const userFile = (name) => path.join(app.getPath('userData'), name);
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJSON = (f, v) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, f); };

// ---- music folders the user picked (or dropped). Only files inside them are ever served or scanned. ----
const allowed = { roots: new Set(), files: new Set(), migrated: false };
const normDir = (p) => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '') + path.sep;
function loadAllowed() {
  const s = readJSON(userFile('folders.json'), null);
  if (s) { (s.roots || []).forEach((r) => allowed.roots.add(r)); (s.files || []).forEach((f) => allowed.files.add(f)); allowed.migrated = true; }
}
const saveAllowed = () => { try { writeJSON(userFile('folders.json'), { roots: [...allowed.roots], files: [...allowed.files].slice(-2000) }); allowed.migrated = true; } catch { /* read-only profile */ } };
function allowPath(p) {
  if (!p || !path.isAbsolute(p)) return;
  let st; try { st = fs.statSync(p); } catch { return; }
  if (st.isDirectory()) allowed.roots.add(path.resolve(p)); else allowed.files.add(path.resolve(p).toLowerCase());
  saveAllowed();
}
function isAllowed(file) {
  const f = path.resolve(file).toLowerCase();
  if (allowed.files.has(f)) return true;
  for (const r of allowed.roots) if (f.startsWith(normDir(r))) return true;
  return false;
}

// ---- cloud updates: downloaded web files live in userData/web-live and win over the bundled ones ----
// Every update feed must be signed with the Aurora update key. The public half is pinned here, in the installed
// program, so a hacked website or GitHub account can't push code to anyone's PC.
const UPDATE_KEY = fs.existsSync(path.join(__dirname, 'update-key.txt')) ? fs.readFileSync(path.join(__dirname, 'update-key.txt'), 'utf8').trim() : '';
const signedPayload = (m) => JSON.stringify({ name: m.name, build: m.build, notes: m.notes, published: m.published, files: m.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })), native: m.native || null });
function verifyManifest(m) {
  if (!UPDATE_KEY) throw new Error('This copy of Aurora has no update key');
  if (!m || typeof m.build !== 'number' || !Array.isArray(m.files) || !m.sig) throw new Error('Update is not signed');
  const key = crypto.createPublicKey({ key: Buffer.from(UPDATE_KEY, 'base64'), format: 'der', type: 'spki' });
  const ok = crypto.verify('sha256', Buffer.from(signedPayload(m)), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig, 'base64'));
  if (!ok) throw new Error('Update signature is not valid');
  return true;
}
const bundledBuild = () => { try { return parseInt(/build:\s*(\d+)/.exec(fs.readFileSync(path.join(WEB, 'js', 'version.js'), 'utf8'))[1], 10); } catch { return 0; } };
const liveDir = () => userFile('web-live');
const stagedDir = () => userFile('web-staged');
let liveOn = false;
// Runs once at start-up: installs an update that was downloaded earlier, drops one that keeps failing to start,
// and drops one that is older than the version this installer shipped with.
function prepareLive() {
  const bb = bundledBuild();
  try {
    const sm = readJSON(path.join(stagedDir(), 'meta.json'), null);
    if (sm && sm.build > bb) { fs.rmSync(liveDir(), { recursive: true, force: true }); fs.renameSync(stagedDir(), liveDir()); }
    else fs.rmSync(stagedDir(), { recursive: true, force: true });
  } catch { /* nothing staged */ }
  const metaF = path.join(liveDir(), 'meta.json'), m = readJSON(metaF, null);
  if (!m) return (liveOn = false);
  if (m.build <= bb || (m.tries || 0) >= 3) { fs.rmSync(liveDir(), { recursive: true, force: true }); return (liveOn = false); }
  m.tries = (m.tries || 0) + 1; try { writeJSON(metaF, m); } catch { /* */ }
  return (liveOn = true);
}
function bootOk() {
  if (!liveOn) return;
  const metaF = path.join(liveDir(), 'meta.json'), m = readJSON(metaF, null);
  if (m && m.tries) { m.tries = 0; try { writeJSON(metaF, m); } catch { /* */ } }
}
async function fetchBuf(url) {
  if (!/^https:\/\//i.test(url)) throw new Error('Updates only come over HTTPS');
  const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
// Downloads and checks the whole update, then puts it in web-staged. It becomes active on the next start
// (or straight away when the user presses Restart). Nothing in the user's library is touched.
async function downloadUpdate(base) {
  if (!/^https:\/\//i.test(base || '')) throw new Error('Bad update address');
  base = base.replace(/\/?$/, '/');
  const m = JSON.parse((await fetchBuf(base + 'update-manifest.json?t=' + Date.now())).toString('utf8'));
  verifyManifest(m);
  if (m.build <= Math.max(bundledBuild(), (readJSON(path.join(liveDir(), 'meta.json'), {}) || {}).build || 0)) return { build: m.build, already: true };
  const tmp = stagedDir() + '.tmp'; fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of m.files) {
    if (/\.\.|^[\\/]|:/.test(f.path)) throw new Error('Bad path in update: ' + f.path);
    const buf = await fetchBuf(base + f.path + '?v=' + m.build);
    if (buf.length !== f.size) throw new Error(`${f.path}: size mismatch`);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error(`${f.path}: checksum mismatch`);
    const dest = path.join(tmp, f.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
  }
  fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify({ build: m.build, name: m.name, tries: 0 }));
  fs.rmSync(stagedDir(), { recursive: true, force: true }); fs.renameSync(tmp, stagedDir());
  return { build: m.build, name: m.name };
}

// ---- secrets (the optional Claude API key), encrypted with the Windows user account ----
const secretsF = () => userFile('secrets.json');
function getSecret(k) {
  const s = readJSON(secretsF(), {}); if (!s[k]) return '';
  try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(s[k], 'base64')) : ''; } catch { return ''; }
}
function setSecret(k, v) {
  const s = readJSON(secretsF(), {});
  if (!v) delete s[k]; else { if (!safeStorage.isEncryptionAvailable()) return false; s[k] = safeStorage.encryptString(String(v)).toString('base64'); }
  writeJSON(secretsF(), s); return true;
}

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

async function scan(root) {
  const out = []; const lrcs = new Map(); const stack = [root];
  while (stack.length) {
    const dir = stack.pop(); let ents;
    try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (AUDIO.test(e.name)) { try { const st = await fs.promises.stat(full); out.push({ path: full, name: e.name, size: st.size, rel: path.relative(root, full).replace(/\\/g, '/') }); } catch { /* unreadable */ } }
      else if (/\.lrc$/i.test(e.name)) lrcs.set(full.replace(/\.[^.\\/]+$/, '').toLowerCase(), full);
    }
  }
  out.forEach((f) => { f.lrc = lrcs.get(f.path.replace(/\.[^.\\/]+$/, '').toLowerCase()) || null; });
  return out;
}

const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.m4b': 'audio/mp4', '.mp4': 'video/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.webm': 'audio/webm', '.weba': 'audio/webm', '.lrc': 'text/plain; charset=utf-8' };
// Range-aware file streaming so the media element gets a duration and can seek.
async function serveFile(file, range) {
  let st; try { st = await fs.promises.stat(file); } catch { return new Response('Not found', { status: 404 }); }
  const size = st.size, type = AUDIO_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const base = { 'content-type': type, 'accept-ranges': 'bytes', 'last-modified': st.mtime.toUTCString() };
  let start = 0, end = size - 1, status = 200;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (m && (m[1] || m[2])) {
    if (m[1] === '') { start = Math.max(0, size - parseInt(m[2], 10)); } else { start = parseInt(m[1], 10); if (m[2]) end = Math.min(end, parseInt(m[2], 10)); }
    if (start > end || start >= size) return new Response('Range Not Satisfiable', { status: 416, headers: { 'content-range': `bytes */${size}` } });
    status = 206; base['content-range'] = `bytes ${start}-${end}/${size}`;
  }
  base['content-length'] = String(end - start + 1);
  if (size === 0) return new Response(null, { status: 200, headers: base });
  const stream = require('stream').Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(stream, { status, headers: base });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 380, minHeight: 560, backgroundColor: '#07070c', show: false, autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#ffffff', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://local/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  return win;
}
const fromApp = (e) => { try { return new URL(e.senderFrame.url).protocol === 'app:'; } catch { return false; } };

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  loadAllowed(); prepareLive();
  protocol.handle('app', async (req) => {
    const u = new URL(req.url); const p = decodeURIComponent(u.pathname);
    if (p.startsWith('/__lib/')) {
      const file = decodeURIComponent(p.slice(7));
      const ok = (AUDIO.test(file) || /\.lrc$/i.test(file)) && path.isAbsolute(file) && isAllowed(file);
      if (!ok) return new Response('Forbidden', { status: 403 });
      return serveFile(file, req.headers.get('range'));
    }
    if (p.startsWith('/voice/')) { // the studio voice engine, shipped with the installer (outside web/, so updates never carry it)
      const vroot = path.join(__dirname, '..', 'voice'), vf = path.normalize(path.join(vroot, p.slice(7)));
      if (!vf.startsWith(vroot)) return new Response('Forbidden', { status: 403 });
      try { return new Response(await fs.promises.readFile(vf), { headers: { 'content-type': 'application/wasm' } }); } catch { return new Response('Not found', { status: 404 }); }
    }
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    let root = WEB;
    if (liveOn && fs.existsSync(path.join(liveDir(), rel))) root = liveDir();
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    try { const data = await fs.promises.readFile(file); return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });

  const handle = (name, fn) => ipcMain.handle(name, (e, ...a) => { if (!fromApp(e)) throw new Error('Not allowed'); return fn(e, ...a); });
  handle('pick-folder', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Choose your music folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null; allowPath(r.filePaths[0]); return r.filePaths[0];
  });
  handle('scan', async (e, root) => (typeof root === 'string' && isAllowed(path.join(root, 'x.mp3')) ? scan(root) : []));
  // First start after updating from a version without the folder list: adopt the folders the library already uses, once.
  handle('adopt-roots', async (e, roots) => { if (allowed.migrated || !Array.isArray(roots)) return false; roots.filter((r) => typeof r === 'string').forEach((r) => { try { if (fs.statSync(r).isDirectory()) allowed.roots.add(path.resolve(r)); } catch { /* gone */ } }); saveAllowed(); return true; });
  handle('fetch-json', async (e, url) => JSON.parse((await fetchBuf(url)).toString('utf8')));
  handle('download-update', async (e, base) => downloadUpdate(base));
  handle('apply-update', async (e, base) => downloadUpdate(base)); // older web code calls this name
  handle('boot-ok', async () => bootOk());
  handle('shell-info', async () => ({ version: app.getVersion(), build: bundledBuild(), signed: !!UPDATE_KEY, secrets: safeStorage.isEncryptionAvailable() }));
  handle('secret-get', async (e, k) => getSecret(String(k)));
  handle('secret-set', async (e, k, v) => setSecret(String(k), v ? String(v) : ''));
  handle('save-snapshot', async (e, json) => { if (typeof json !== 'string' || json.length > 20e6) return false; const dir = userFile('backups'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'aurora-backup-' + new Date().toISOString().slice(0, 10) + '.json'), json); const all = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); all.slice(0, -10).forEach((f) => fs.rmSync(path.join(dir, f), { force: true })); return true; });
  handle('relaunch', async () => { app.relaunch(); app.exit(0); });
  ipcMain.on('allow-path', (e, p) => { if (fromApp(e) && typeof p === 'string') allowPath(p); e.returnValue = true; });

  const win = createWindow();
  app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
  // media keys -> renderer
  const send = (k) => { if (!win.isDestroyed()) win.webContents.send('media-key', k); };
  const mediaKeys = () => { try { globalShortcut.register('MediaPlayPause', () => send('play')); globalShortcut.register('MediaNextTrack', () => send('next')); globalShortcut.register('MediaPreviousTrack', () => send('prev')); } catch { /* optional */ } };
  mediaKeys();

  // Global shortcuts the user picked (play/pause, next, mini player...) that work while another app is in front
  const ACTIONS = new Set(['toggle', 'next', 'prev', 'mini', 'like', 'volUp', 'volDown', 'lyrFull', 'np']);
  handle('set-global-keys', async (e, map) => {
    globalShortcut.unregisterAll(); mediaKeys();
    const failed = [];
    for (const [a, acc] of Object.entries(map && typeof map === 'object' ? map : {})) {
      if (!ACTIONS.has(a) || typeof acc !== 'string' || !acc || acc.length > 60 || !/^[A-Za-z0-9+]+$/.test(acc) || acc.split('+').length < 3) continue;
      try { if (!globalShortcut.register(acc, () => { if (!win.isDestroyed()) win.webContents.send('global-key', a); })) failed.push(acc.replace('CommandOrControl', 'Ctrl')); } catch { failed.push(acc); }
    }
    return { failed };
  });

  // Mini player: the same window shrinks into a small always-on-top player, so playback never stops
  let full = null;
  const MINI = { w: 440, h: 150 };
  handle('set-mini', async (e, on) => {
    if (win.isDestroyed()) return false;
    if (on && !full) {
      full = { bounds: win.getBounds(), max: win.isMaximized() };
      if (full.max) win.unmaximize();
      win.setMinimumSize(320, 120); win.setSize(MINI.w, MINI.h); win.setAlwaysOnTop(true, 'floating');
      const { workArea } = require('electron').screen.getDisplayMatching(win.getBounds()); win.setPosition(workArea.x + workArea.width - MINI.w - 24, workArea.y + workArea.height - MINI.h - 24);
      try { win.setTitleBarOverlay({ height: 30 }); } catch { /* not on this OS */ }
    } else if (!on && full) {
      win.setAlwaysOnTop(false); win.setMinimumSize(380, 560); win.setBounds(full.bounds); if (full.max) win.maximize();
      try { win.setTitleBarOverlay({ height: 40 }); } catch { /* */ }
      full = null;
    }
    return true;
  });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
