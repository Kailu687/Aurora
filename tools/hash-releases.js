// Records the size and SHA-256 of the release files so the website can show them:  node tools/hash-releases.js
// Reads downloads/Aurora.apk and dist/Aurora-Setup-<version>.exe, writes downloads/hashes.json
// (the build number tells older apps on phones that a newer APK exists)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const sha = (f) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej); });
(async () => {
  const out = { version };
  const apk = path.join(root, 'downloads', 'Aurora.apk');
  const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8'), versionCode = +(/versionCode (\d+)/.exec(gradle) || [])[1] || 0;
  if (fs.existsSync(apk)) out.android = { size: fs.statSync(apk).size, sha256: await sha(apk), build: versionCode };
  const exe = path.join(root, 'dist', `Aurora-Setup-${version}.exe`);
  if (fs.existsSync(exe)) out.windows = { size: fs.statSync(exe).size, sha256: await sha(exe) };
  fs.mkdirSync(path.join(root, 'downloads'), { recursive: true });
  fs.writeFileSync(path.join(root, 'downloads', 'hashes.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('hashes.json written for v' + version, Object.keys(out).filter((k) => k !== 'version').join(', '));
})();
