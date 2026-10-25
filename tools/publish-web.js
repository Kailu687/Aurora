// Release helper for the web app (which is also the UI of the Android and Windows apps).
//
//   node tools/publish-web.js --stamp-only --notes "First point|Second point" [--name 1.7.0]
//        Bump the version: rewrites web/js/version.js, web/sw.js, the Android/Windows version numbers, and adds an
//        entry to docs/changelog.json (separate bullet points with |). Commit the result.
//
//   node tools/publish-web.js [--out site]
//        Build the website folder (default ./site):
//          /                 marketing site (tools/site)
//          /app/             the web app + update-manifest.json (this is what installed apps update from)
//          /downloads/       download page + Aurora.apk + checksums
//          /releases.json    data for the download page (changelog + sizes + SHA-256)
//        GitHub Actions runs this on every push (see .github/workflows/pages.yml).
//
//   The update feed is signed (ECDSA P-256) so installed apps only accept updates made by you. The private key comes
//   from the AURORA_UPDATE_KEY environment variable (a GitHub Actions secret) or the file named by
//   AURORA_UPDATE_KEY_FILE (default: ../Aurora-keys/update-signing-key.pem). The public half is stamped into
//   web/js/updater.js and electron/update-key.txt by --stamp-only.
//
//   node tools/publish-web.js --new-key      Make a new signing key pair in ../Aurora-keys (only ever once).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), web = path.join(root, 'web');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (k) => process.argv.includes('--' + k);
const REPO = 'Kailu687/Aurora';
const changelogPath = path.join(root, 'docs', 'changelog.json');
const keyFile = process.env.AURORA_UPDATE_KEY_FILE || path.join(root, '..', 'Aurora-keys', 'update-signing-key.pem');
function privateKey() {
  const pem = process.env.AURORA_UPDATE_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8') : '');
  return pem.trim() ? crypto.createPrivateKey(pem) : null;
}
const publicB64 = (k) => crypto.createPublicKey(k).export({ type: 'spki', format: 'der' }).toString('base64');
// Must match A.signedPayload in web/js/updater.js and signedPayload in electron/main.js
const signedPayload = (m) => JSON.stringify({ name: m.name, build: m.build, notes: m.notes, published: m.published, files: m.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })), native: m.native || null });
function stampKey(pub) {
  const up = path.join(web, 'js', 'updater.js');
  fs.writeFileSync(up, fs.readFileSync(up, 'utf8').replace(/const UPDATE_KEY = '[^']*';/, `const UPDATE_KEY = '${pub}';`));
  fs.writeFileSync(path.join(root, 'electron', 'update-key.txt'), pub + '\n');
}

if (flag('new-key')) {
  if (fs.existsSync(keyFile)) { console.error('A key already exists at ' + keyFile + '. Delete it first only if you really mean to replace it.'); process.exit(1); }
  const { privateKey: k } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, k.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  stampKey(publicB64(k));
  console.log('New signing key written to ' + keyFile + '. Add its contents as the AURORA_UPDATE_KEY secret on GitHub, and back it up.');
  process.exit(0);
}
const vf = path.join(web, 'js', 'version.js');
let vsrc = fs.readFileSync(vf, 'utf8');
let name = /name:\s*'([^']+)'/.exec(vsrc)[1];
let build = +/build:\s*(\d+)/.exec(vsrc)[1];
let notes = /notes:\s*'((?:[^'\\]|\\.)*)'/.exec(vsrc)[1].replace(/\\'/g, "'");

if (flag('stamp-only')) {
  build += 1;
  const p = name.split('.').map(Number); p[2] = (p[2] || 0) + 1;
  name = arg('name') || p.join('.');
  const bullets = (arg('notes') || notes).split('|').map((s) => s.trim()).filter(Boolean);
  notes = bullets.join('. ');
  vsrc = `/* Stamped by tools/publish-web.js - bump with: npm run bump -- --notes "..." */\nwindow.A = window.A || {};\nA.VERSION = { name: '${name}', build: ${build}, notes: '${notes.replace(/'/g, "\\'")}' };\n`;
  fs.writeFileSync(vf, vsrc);
  const sw = path.join(web, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const BUNDLE_BUILD = \d+;/, `const BUNDLE_BUILD = ${build};`));
  const gradle = path.join(root, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradle)) fs.writeFileSync(gradle, fs.readFileSync(gradle, 'utf8').replace(/versionCode \d+/, `versionCode ${build}`).replace(/versionName "[^"]*"/, `versionName "${name}"`));
  const pkgPath = path.join(root, 'package.json'), pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); pkg.version = name; fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  const log = fs.existsSync(changelogPath) ? JSON.parse(fs.readFileSync(changelogPath, 'utf8')) : [];
  const entry = { version: name, date: new Date().toISOString().slice(0, 10), notes: bullets };
  const at = log.findIndex((e) => e.version === name); if (at > -1) log[at] = entry; else log.unshift(entry);
  fs.writeFileSync(changelogPath, JSON.stringify(log, null, 2) + '\n');
  fs.writeFileSync(path.join(web, 'changelog.json'), JSON.stringify(log.slice(0, 12), null, 1) + '\n');
  const k = privateKey(); if (k) stampKey(publicB64(k));
  console.log(`Version is now ${name} (build ${build}). Next: npm run android, then commit and push.`);
  process.exit(0);
}

// ---------------- build the website folder ----------------
const out = path.resolve(root, arg('out') || 'site');
fs.rmSync(out, { recursive: true, force: true });
const copyDir = (from, to) => { for (const e of fs.readdirSync(from, { withFileTypes: true })) { const s = path.join(from, e.name), d = path.join(to, e.name); if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); } } };

// 1) marketing site at /
const siteSrc = path.join(__dirname, 'site');
if (fs.existsSync(siteSrc)) copyDir(siteSrc, out);

// 2) the web app at /app/ with its update feed
const appOut = path.join(out, 'app');
const files = [];
(function walk(d, rel) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, r); else files.push(r);
  }
})(web, '');
for (const f of files) { const dest = path.join(appOut, f); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(web, f), dest); }
// the studio voice's engine (~21 MB) is served next to the app but is not part of the update package: apps fetch it
// only when someone turns the studio voice on, and check it against the SHA-256 pinned in web/js/voice.js
const voiceSrc = path.join(root, 'voice');
if (fs.existsSync(voiceSrc)) { fs.mkdirSync(path.join(appOut, 'voice'), { recursive: true }); copyDir(voiceSrc, path.join(appOut, 'voice')); }
const listed = files.filter((f) => f !== 'sw.js').map((f) => { const b = fs.readFileSync(path.join(web, f)); return { path: f, size: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }; });
// What the newest Android app / Windows installer is, so older installs can be told a new one exists
const hashesF = path.join(root, 'downloads', 'hashes.json'), hj = fs.existsSync(hashesF) ? JSON.parse(fs.readFileSync(hashesF, 'utf8')) : {};
const DL_PAGE = 'https://kailashamarnath.me/Aurora/downloads/';
const native = {
  // Android: link straight to the APK so the phone downloads it in one tap (no web page in between)
  ...(hj.android && hj.android.build ? { android: { build: hj.android.build, version: hj.version, url: DL_PAGE + 'Aurora.apk', notes: hj.android.notes || '' } } : {}),
  ...(hj.windows ? { windows: { version: hj.version, url: DL_PAGE, notes: hj.windows.notes || '' } } : {})
};
const manifest = { name, build, notes, published: new Date().toISOString(), files: listed, native: Object.keys(native).length ? native : null };
const key = privateKey();
if (key) {
  const pub = publicB64(key), stamped = (/const UPDATE_KEY = '([^']*)';/.exec(fs.readFileSync(path.join(web, 'js', 'updater.js'), 'utf8')) || [])[1];
  if (stamped !== pub) { console.error('The signing key does not match the public key in web/js/updater.js. Run npm run bump on the PC that has the key.'); process.exit(1); }
  manifest.sig = crypto.sign('sha256', Buffer.from(signedPayload(manifest)), { key, dsaEncoding: 'ieee-p1363' }).toString('base64');
} else if (process.env.GITHUB_ACTIONS) {
  console.error('No update signing key: add the AURORA_UPDATE_KEY secret (Settings > Secrets and variables > Actions). Without it installed apps refuse the update.');
  process.exit(1);
} else console.warn('Warning: no signing key found, update-manifest.json is unsigned (installed apps will refuse it).');
fs.writeFileSync(path.join(appOut, 'update-manifest.json'), JSON.stringify(manifest, null, 1));

// 3) release binaries (each must be < 100 MB for GitHub Pages) at /downloads/
const dl = path.join(root, 'downloads');
fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
if (fs.existsSync(dl)) for (const f of fs.readdirSync(dl)) { const s = path.join(dl, f); if (fs.statSync(s).isFile() && fs.statSync(s).size < 95e6 && f !== 'hashes.json') fs.copyFileSync(s, path.join(out, 'downloads', f)); }

// 4) releases.json for the download page: a snapshot of your GitHub Releases taken at build time.
//    (The page also reads GitHub live in the browser, so new releases appear immediately; this file is the fallback.)
const AuroraReleases = require('./site/assets/releases.js');
const hashes = fs.existsSync(path.join(dl, 'hashes.json')) ? JSON.parse(fs.readFileSync(path.join(dl, 'hashes.json'), 'utf8')) : {};
const log = fs.existsSync(changelogPath) ? JSON.parse(fs.readFileSync(changelogPath, 'utf8')) : [];
const fromChangelog = () => log.map((e) => {
  const base = `https://github.com/${REPO}/releases/download/v${e.version}`, same = hashes.version === e.version;
  return {
    version: e.version, date: e.date, notes: e.notes, page: `https://github.com/${REPO}/releases/tag/v${e.version}`,
    android: { url: `${base}/Aurora.apk`, size: same && hashes.android ? hashes.android.size : undefined, sha256: same && hashes.android ? hashes.android.sha256 : undefined },
    windows: { url: `${base}/Aurora-Setup-${e.version}.exe`, size: same && hashes.windows ? hashes.windows.size : undefined, sha256: same && hashes.windows ? hashes.windows.sha256 : undefined }
  };
});
async function fromGitHub() {
  const headers = { 'User-Agent': 'aurora-site-build', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, { headers });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return AuroraReleases.convert(await r.json());
}
(async () => {
  let releases = null, source = 'docs/changelog.json';
  if (!flag('offline')) { try { releases = await fromGitHub(); source = 'GitHub Releases'; } catch (e) { console.log('GitHub releases not reachable (' + e.message + '), using docs/changelog.json'); } }
  if (!releases || !releases.length) { releases = fromChangelog(); source = 'docs/changelog.json'; }
  fs.writeFileSync(path.join(out, 'releases.json'), JSON.stringify({ repo: REPO, generated: new Date().toISOString(), source, latest: releases[0] && releases[0].version, releases }, null, 1));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  console.log(`Website built: v${name} (build ${build}) -> ${out}  (${listed.length} app files, ${releases.length} releases from ${source})`);
})();