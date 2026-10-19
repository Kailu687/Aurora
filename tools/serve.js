// Minimal static server for the web app:  node tools/serve.js [port]
// Open http://localhost:PORT  (localhost counts as a secure context, so install + folder access work).
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..', 'web'), port = +process.argv[2] || 5173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(d); });
}).listen(port, () => {
  console.log(`Aurora running at http://localhost:${port}`);
  Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).forEach((i) => console.log(`  on your network: http://${i.address}:${port}  (phones need HTTPS to install - see README)`));
});
