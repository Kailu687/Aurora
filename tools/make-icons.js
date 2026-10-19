// Generates PNG icons (no dependencies): gradient squircle with a play triangle + sound bars.
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function crc32(buf) { let c, crc = ~0; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x / size, y / size); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
// signed distance to rounded rect (centered, half-size h, radius r)
const sdRound = (x, y, h, r) => { const qx = Math.abs(x) - h + r, qy = Math.abs(y) - h + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
function inTri(px, py, a, b, c) { const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const d1 = s([px, py], a, b), d2 = s([px, py], b, c), d3 = s([px, py], c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }

function icon(size, maskable) {
  const scale = maskable ? 0.74 : 1; // keep content inside the safe zone for maskable icons
  return png(size, (u, v) => {
    const x = u - 0.5, y = v - 0.5;
    let base;
    if (maskable) base = null; else { const d = sdRound(x, y, 0.5, 0.23); if (d > 0.004) return [0, 0, 0, 0]; }
    const t = Math.min(1, Math.max(0, (u + v) / 2));
    let col = mix([250, 45, 108], [118, 82, 255], t);
    // soft highlight
    const hl = Math.max(0, 1 - Math.hypot(u - 0.3, v - 0.2) / 0.55); col = mix(col, [255, 255, 255], hl * 0.25);
    void base;
    const px = x / scale, py = y / scale;
    // play triangle
    if (inTri(px, py, [-0.13, -0.19], [0.2, 0], [-0.13, 0.19])) return [255, 255, 255, 255];
    // sound bars on the left/right sides
    const bars = [[-0.3, 0.07], [-0.24, 0.13], [0.3, 0.07], [0.24, 0.13]];
    for (const [bx, bh] of bars) if (Math.abs(px - bx) < 0.016 && Math.abs(py) < bh) return [255, 255, 255, 230];
    return [...col, 255];
  });
}
const out = path.join(__dirname, '..', 'web', 'icons'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), icon(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), icon(512));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), icon(512, true));
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), icon(512));
console.log('icons written');
