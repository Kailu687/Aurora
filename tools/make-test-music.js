// Generates a small synthetic test library:  node tools/make-test-music.js <outDir>
// - WAV tracks with different tempo/loudness (for the DJ vibe analysis)
// - Silent but valid MP3s with real ID3v2.3 tags + cover art (for the tag parser)
const fs = require('fs'), path = require('path');
const out = process.argv[2]; if (!out) { console.error('usage: node make-test-music.js <outDir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

function wav(file, { bpm, amp, secs, base, kick }) {
  const sr = 22050, n = sr * secs, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const beat = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / sr, ph = (t % beat) / beat;
    const env = Math.exp(-ph * (kick ? 7 : 2.5));
    const s = Math.sin(2 * Math.PI * base * t) * 0.35 + Math.sin(2 * Math.PI * (base * 1.5) * t) * 0.2 + (kick ? Math.sin(2 * Math.PI * 55 * t * (1 + env)) * env * 0.8 : 0) + (Math.random() - 0.5) * (kick ? 0.12 * env : 0.02);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * env * 32767 * amp + s * 32767 * amp * 0.25))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}
wav(path.join(out, 'Lofi Dreamer - Rainy Window.wav'), { bpm: 74, amp: 0.25, secs: 40, base: 220, kick: false });
wav(path.join(out, 'Lofi Dreamer - Slow Tea.wav'), { bpm: 80, amp: 0.2, secs: 40, base: 196, kick: false });
wav(path.join(out, 'Neon Pulse - Overdrive.wav'), { bpm: 140, amp: 0.9, secs: 40, base: 330, kick: true });
wav(path.join(out, 'Neon Pulse - Strobe.wav'), { bpm: 150, amp: 0.85, secs: 40, base: 392, kick: true });
wav(path.join(out, 'Sun Collective - Golden Hour.wav'), { bpm: 112, amp: 0.55, secs: 40, base: 262, kick: true });
wav(path.join(out, 'Sun Collective - Easy Street.wav'), { bpm: 104, amp: 0.5, secs: 40, base: 294, kick: true });

// ---- tagged silent MP3 ----
const png = fs.readFileSync(path.join(__dirname, '..', 'web', 'icons', 'icon-192.png'));
const synchsafe = (n) => Buffer.from([(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
const frameTxt = (id, txt) => { const d = Buffer.concat([Buffer.from([3]), Buffer.from(txt, 'utf8')]); const h = Buffer.alloc(10); h.write(id, 0); h.writeUInt32BE(d.length, 4); return Buffer.concat([h, d]); };
const frameApic = () => { const d = Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3]), Buffer.from('\0'), png]); const h = Buffer.alloc(10); h.write('APIC', 0); h.writeUInt32BE(d.length, 4); return Buffer.concat([h, d]); };
const frameUslt = (txt) => { const d = Buffer.concat([Buffer.from([3]), Buffer.from('eng'), Buffer.from('\0'), Buffer.from(txt, 'utf8')]); const h = Buffer.alloc(10); h.write('USLT', 0); h.writeUInt32BE(d.length, 4); return Buffer.concat([h, d]); };
function mp3(file, { title, artist, album, genre, year, track, secs }) {
  const frames = Buffer.concat([frameTxt('TIT2', title), frameTxt('TPE1', artist), frameTxt('TALB', album), frameTxt('TCON', genre), frameTxt('TYER', String(year)), frameTxt('TRCK', String(track)), frameApic(), frameUslt('Line one\nLine two\nLine three')]);
  const head = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), synchsafe(frames.length)]);
  const frame = Buffer.alloc(417); frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00; // MPEG1 L3 128kbps 44.1kHz
  const n = Math.round(secs / 0.026122);
  fs.writeFileSync(file, Buffer.concat([head, frames, ...Array.from({ length: n }, () => frame)]));
}
mp3(path.join(out, 'tagged1.mp3'), { title: 'Midnight Drive', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1986, track: 1, secs: 30 });
mp3(path.join(out, 'tagged2.mp3'), { title: 'City Lights', artist: 'The Night Owls', album: 'After Hours', genre: 'Synthwave', year: 1986, track: 2, secs: 25 });
mp3(path.join(out, 'tagged3.mp3'), { title: 'Sunday Jazz', artist: 'Blue Quartet', album: 'Smoke & Mirrors', genre: 'Jazz', year: 2011, track: 1, secs: 35 });
console.log('test music written to', out);
