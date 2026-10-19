/* Aurora website: turns GitHub Releases API data into the simple shape the Downloads page shows.
   Used by the browser (Downloads page, live) and by Node (tools/publish-web.js, at build time). */
(function (root) {
  // Release notes: use the bullet points of the release description (or its plain lines), without markdown symbols.
  function notes(body) {
    var lines = String(body || '').replace(/\r/g, '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var bullet = /^([-*+•]|\d+\.)\s+/;
    var bullets = lines.filter(function (l) { return bullet.test(l); }).map(function (l) { return l.replace(bullet, ''); });
    var out = (bullets.length ? bullets : lines.filter(function (l) { return !/^#/.test(l); })).filter(function (l) { return !/download\s+\S+\.(exe|apk|zip)\b/i.test(l) && !/^(windows|android)\s*:\s*\S+\.(exe|apk|zip)$/i.test(l); });
    return out.map(function (l) { return l.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); }).slice(0, 14);
  }
  function asset(a) {
    if (!a) return {};
    return { url: a.browser_download_url, size: a.size, name: a.name, downloads: a.download_count,
      sha256: a.digest && /^sha256:/i.test(a.digest) ? a.digest.slice(7) : undefined };
  }
  // list = array returned by https://api.github.com/repos/<owner>/<repo>/releases
  function convert(list) {
    return (list || []).filter(function (r) { return !r.draft; }).map(function (r) {
      var assets = r.assets || [];
      var apk = assets.filter(function (a) { return /\.apk$/i.test(a.name); })[0];
      var exe = assets.filter(function (a) { return /\.exe$/i.test(a.name); })[0];
      return { version: String(r.tag_name || '').replace(/^v/i, ''), date: r.published_at || r.created_at, notes: notes(r.body),
        page: r.html_url, prerelease: !!r.prerelease, android: asset(apk), windows: asset(exe) };
    });
  }
  var api = { notes: notes, convert: convert };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AuroraReleases = api;
})(typeof window !== 'undefined' ? window : this);
