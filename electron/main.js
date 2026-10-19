// Aurora desktop shell. Serves the web app from a private app:// scheme (so WebAudio, IndexedDB and
// range-seeking all behave like a real origin) and exposes the user's music folders via app://local/__lib/.
const { app, BrowserWindow, protocol, dialog, ipcMain, shell, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const WEB = path.join(__dirname, '..', 'web');
const AUDIO = /\.(mp3|m4a|mp4|m4b|aac|wav|flac|ogg|oga|opus|webm|weba)$/i;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const allowedRoots = new Set(); // folders the user picked this session or in a past one

// ---- cloud updates: downloaded web files live in userData/web-live and win over the bundled ones ----
const bundledBuild = () => { try { return parseInt(/build:\s*(\d+)/.exec(fs.readFileSync(path.join(WEB, 'js', 'version.js'), 'utf8'))[1], 10); } catch { return 0; } };
const liveDir = () => path.join(app.getPath('userData'), 'web-live');
function liveActive() {
  try { const m = JSON.parse(fs.readFileSync(path.join(liveDir(), 'meta.json'), 'utf8')); if (m.build > bundledBuild()) return true; fs.rmSync(liveDir(), { recursive: true, force: true }); } catch { /* none */ }
  return false;
}
async function applyUpdate(base, manifest) {
  const tmp = liveDir() + '.tmp'; fs.rmSync(tmp, { recursive: true, force: true });
  for (const f of manifest.files) {
    if (/\.\.|^[\\/]|:/.test(f.path)) throw new Error('Bad path in update: ' + f.path);
    const r = await fetch(base + f.path + '?v=' + manifest.build, { cache: 'reload' }); if (!r.ok) throw new Error(`${f.path}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer()); if (f.size && buf.length !== f.size) throw new Error(`${f.path}: size mismatch`);
    const dest = path.join(tmp, f.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
  }
  fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify({ build: manifest.build, name: manifest.name }));
  fs.rmSync(liveDir(), { recursive: true, force: true }); fs.renameSync(tmp, liveDir());
  return true;
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://local/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', async (req) => {
    const u = new URL(req.url); const p = decodeURIComponent(u.pathname);
    if (p.startsWith('/__lib/')) {
      const file = decodeURIComponent(p.slice(7));
      const ok = (AUDIO.test(file) || /\.lrc$/i.test(file)) && path.isAbsolute(file);
      if (!ok) return new Response('Forbidden', { status: 403 });
      return serveFile(file, req.headers.get('range'));
    }
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    let root = WEB;
    if (liveActive() && fs.existsSync(path.join(liveDir(), rel))) root = liveDir();
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 });
    try { const data = await fs.promises.readFile(file); return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  });

  ipcMain.handle('pick-folder', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { title: 'Choose your music folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null; allowedRoots.add(r.filePaths[0]); return r.filePaths[0];
  });
  ipcMain.handle('scan', async (e, root) => scan(root));
  ipcMain.handle('fetch-json', async (e, url) => { if (!/^https?:\/\//i.test(url)) throw new Error('Bad URL'); const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  ipcMain.handle('apply-update', async (e, base, manifest) => applyUpdate(base, manifest));

  const win = createWindow();
  app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.focus(); });
  // media keys -> renderer
  const send = (k) => { if (!win.isDestroyed()) win.webContents.send('media-key', k); };
  try { globalShortcut.register('MediaPlayPause', () => send('play')); globalShortcut.register('MediaNextTrack', () => send('next')); globalShortcut.register('MediaPreviousTrack', () => send('prev')); } catch { /* optional */ }
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());


