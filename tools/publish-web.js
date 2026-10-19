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
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), web = path.join(root, 'web');
const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (k) => process.argv.includes('--' + k);
const REPO = 'Kailu687/Aurora';
const changelogPath = path.join(root, 'docs', 'changelog.json');

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
const listed = files.filter((f) => f !== 'sw.js').map((f) => ({ path: f, size: fs.statSync(path.join(web, f)).size }));
fs.writeFileSync(path.join(appOut, 'update-manifest.json'), JSON.stringify({ name, build, notes, published: new Date().toISOString(), files: listed }, null, 1));

// 3) release binaries (each must be < 100 MB for GitHub Pages) at /downloads/
const dl = path.join(root, 'downloads');
fs.mkdirSync(path.join(out, 'downloads'), { recursive: true });
if (fs.existsSync(dl)) for (const f of fs.readdirSync(dl)) { const s = path.join(dl, f); if (fs.statSync(s).isFile() && fs.statSync(s).size < 95e6 && f !== 'hashes.json') fs.copyFileSync(s, path.join(out, 'downloads', f)); }

// 4) releases.json for the download page
const hashes = fs.existsSync(path.join(dl, 'hashes.json')) ? JSON.parse(fs.readFileSync(path.join(dl, 'hashes.json'), 'utf8')) : {};
const log = fs.existsSync(changelogPath) ? JSON.parse(fs.readFileSync(changelogPath, 'utf8')) : [];
const releases = log.map((e, i) => {
  const base = `https://github.com/${REPO}/releases/download/v${e.version}`, same = hashes.version === e.version;
  return {
    version: e.version, date: e.date, notes: e.notes, page: `https://github.com/${REPO}/releases/tag/v${e.version}`,
    android: { url: `${base}/Aurora.apk`, direct: i === 0 ? 'Aurora.apk' : undefined, size: same && hashes.android ? hashes.android.size : undefined, sha256: same && hashes.android ? hashes.android.sha256 : undefined },
    windows: { url: `${base}/Aurora-Setup-${e.version}.exe`, size: same && hashes.windows ? hashes.windows.size : undefined, sha256: same && hashes.windows ? hashes.windows.sha256 : undefined }
  };
});
fs.writeFileSync(path.join(out, 'releases.json'), JSON.stringify({ repo: REPO, generated: new Date().toISOString(), latest: releases[0] && releases[0].version, releases }, null, 1));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Website built: v${name} (build ${build}) -> ${out}  (${listed.length} app files, ${releases.length} releases)`);
