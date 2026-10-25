/* Aurora - metadata parsing (ID3v1/v2, MP4/M4A) and audio vibe analysis */
(function (A) {
  const GENRES = 'Blues,Classic Rock,Country,Dance,Disco,Funk,Grunge,Hip-Hop,Jazz,Metal,New Age,Oldies,Other,Pop,R&B,Rap,Reggae,Rock,Techno,Industrial,Alternative,Ska,Death Metal,Pranks,Soundtrack,Euro-Techno,Ambient,Trip-Hop,Vocal,Jazz+Funk,Fusion,Trance,Classical,Instrumental,Acid,House,Game,Sound Clip,Gospel,Noise,AlternRock,Bass,Soul,Punk,Space,Meditative,Instrumental Pop,Instrumental Rock,Ethnic,Gothic,Darkwave,Techno-Industrial,Electronic,Pop-Folk,Eurodance,Dream,Southern Rock,Comedy,Cult,Gangsta,Top 40,Christian Rap,Pop/Funk,Jungle,Native American,Cabaret,New Wave,Psychadelic,Rave,Showtunes,Trailer,Lo-Fi,Tribal,Acid Punk,Acid Jazz,Polka,Retro,Musical,Rock & Roll,Hard Rock'.split(',');

  A.AUDIO_EXT = /\.(mp3|m4a|mp4|m4b|aac|wav|flac|ogg|oga|opus|webm|weba)$/i;

  // ---- sources: anything with size/name and slice(start,end)->ArrayBuffer ----
  A.blobSource = (blob, name) => ({ size: blob.size, name: name || blob.name || '', blob, slice: (s, e) => blob.slice(s, e).arrayBuffer() });
  A.urlSource = (url, size, name) => ({
    size, name, url,
    slice: async (s, e) => {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000); // a stalled request must fail, not hang the import
      try { const r = await fetch(url, { headers: { Range: `bytes=${s}-${e - 1}` }, signal: ctl.signal }); if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status); return await r.arrayBuffer(); }
      finally { clearTimeout(t); }
    }
  });

  const dec = (enc, bytes) => {
    try {
      if (enc === 1) { // UTF-16 with BOM
        const le = bytes[0] === 0xff && bytes[1] === 0xfe;
        const b = bytes[0] === 0xff || bytes[0] === 0xfe ? bytes.subarray(2) : bytes;
        return new TextDecoder(le || !(bytes[0] === 0xfe) ? 'utf-16le' : 'utf-16be').decode(b);
      }
      if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
      if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
      return new TextDecoder('windows-1252').decode(bytes);
    } catch { return ''; }
  };
  const clean = (s) => s.replace(/\u0000/g, '').trim();
  const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];

  function parseGenre(g) {
    g = clean(g);
    const m = g.match(/^\((\d+)\)(.*)$/) || g.match(/^(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); return (m[2] && m[2].trim()) || GENRES[n] || ''; }
    return g.split(/[\/;\u0000]/)[0].trim();
  }

  function termIdx(b, start, enc) {
    if (enc === 1 || enc === 2) { for (let i = start; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return [i, 2]; return [b.length, 0]; }
    for (let i = start; i < b.length; i++) if (b[i] === 0) return [i, 1];
    return [b.length, 0];
  }

  async function readID3(src, out) {
    const head = new Uint8Array(await src.slice(0, 10));
    let tagEnd = 0;
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      const ver = head[3], flags = head[5], size = syncsafe(head, 6);
      tagEnd = 10 + size;
      const b = new Uint8Array(await src.slice(10, Math.min(src.size, 10 + size)));
      let o = 0;
      if (flags & 0x40 && b.length > 4) { o = ver === 4 ? syncsafe(b, 0) : 4 + ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]); }
      const idLen = ver === 2 ? 3 : 4, hLen = ver === 2 ? 6 : 10;
      while (o + hLen <= b.length) {
        const id = String.fromCharCode(...b.subarray(o, o + idLen));
        if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
        let sz;
        if (ver === 2) sz = (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5];
        else if (ver === 4) sz = syncsafe(b, o + 4);
        else sz = ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0;
        if (sz <= 0 || o + hLen + sz > b.length) break;
        const f = b.subarray(o + hLen, o + hLen + sz);
        o += hLen + sz;
        const enc = f[0];
        const text = () => clean(dec(enc, f.subarray(1)));
        switch (id) {
          case 'TIT2': case 'TT2': out.title = text(); break;
          case 'TPE1': case 'TP1': out.artist = text().split(/\u0000/)[0]; break;
          case 'TPE2': case 'TP2': out.albumArtist = text(); break;
          case 'TALB': case 'TAL': out.album = text(); break;
          case 'TCON': case 'TCO': out.genre = parseGenre(dec(enc, f.subarray(1))); break;
          case 'TYER': case 'TYE': case 'TDRC': { const y = parseInt(text(), 10); if (y) out.year = y; break; }
          case 'TRCK': case 'TRK': out.track = parseInt(text(), 10) || 0; break;
          case 'TLEN': { const ms = parseInt(text(), 10); if (ms) out.duration = ms / 1000; break; }
          case 'USLT': case 'ULT': {
            const [i, l] = termIdx(f, 4, enc);
            const t = clean(dec(enc, f.subarray(i + l)));
            if (t) out.lyrics = t;
            break;
          }
          case 'APIC': case 'PIC': {
            if (out.art) break;
            let p = 1, mime;
            if (id === 'PIC') { mime = 'image/' + String.fromCharCode(...f.subarray(1, 4)).toLowerCase(); p = 4; }
            else { const e = f.indexOf(0, 1); mime = String.fromCharCode(...f.subarray(1, e)) || 'image/jpeg'; p = e + 1; }
            p += 1; // picture type
            const [i, l] = termIdx(f, p, enc);
            const data = f.subarray(i + l);
            if (data.length > 100) out.art = new Blob([data.slice()], { type: mime.includes('/') ? mime : 'image/jpeg' });
            break;
          }
        }
      }
    }
    // ID3v1 fallback
    if (!out.title && src.size > 128) {
      const t = new Uint8Array(await src.slice(src.size - 128, src.size));
      if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
        const s = (a, b) => clean(dec(0, t.subarray(a, b)));
        out.title = s(3, 33); out.artist = out.artist || s(33, 63); out.album = out.album || s(63, 93);
        const y = parseInt(s(93, 97), 10); if (y) out.year = out.year || y;
        if (!out.genre && t[127] < GENRES.length) out.genre = GENRES[t[127]];
      }
    }
    return tagEnd;
  }

  // MPEG audio duration (Xing/VBRI header or CBR estimate)
  const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  async function mp3Duration(src, tagEnd) {
    const b = new Uint8Array(await src.slice(tagEnd, Math.min(src.size, tagEnd + 8192)));
    for (let i = 0; i + 4 < b.length; i++) {
      if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
      const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3;
      if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) continue;
      const v1 = ver === 3, sr = SR[ver][si], br = (v1 ? BR[1] : BR[2])[bi] * 1000;
      const mono = ((b[i + 3] >> 6) & 3) === 3;
      const spf = v1 ? 1152 : 576;
      const off = i + 4 + (v1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
      const tag = String.fromCharCode(...b.subarray(off, off + 4));
      if ((tag === 'Xing' || tag === 'Info') && b[off + 7] & 1) {
        const frames = ((b[off + 8] << 24) | (b[off + 9] << 16) | (b[off + 10] << 8) | b[off + 11]) >>> 0;
        if (frames) return (frames * spf) / sr;
      }
      const vbri = String.fromCharCode(...b.subarray(i + 36, i + 40));
      if (vbri === 'VBRI') {
        const frames = ((b[i + 14] << 24) | (b[i + 15] << 16) | (b[i + 16] << 8) | b[i + 17]) >>> 0;
        if (frames) return (frames * spf) / sr;
      }
      return (src.size - tagEnd) * 8 / br;
    }
    return 0;
  }

  // ---- MP4 / M4A ----
  async function readMP4(src, out) {
    let off = 0;
    const view = (ab) => new DataView(ab);
    while (off + 8 <= src.size) {
      const hd = view(await src.slice(off, off + 16));
      let size = hd.getUint32(0), type = String.fromCharCode(hd.getUint8(4), hd.getUint8(5), hd.getUint8(6), hd.getUint8(7));
      let hlen = 8;
      if (size === 1) { size = Number(hd.getBigUint64(8)); hlen = 16; }
      if (size === 0) size = src.size - off;
      if (size < hlen) break;
      if (type === 'moov') {
        if (size > 40e6) break;
        const buf = new Uint8Array(await src.slice(off + hlen, off + size));
        parseMoov(buf, out);
        return;
      }
      off += size;
    }
  }
  const t4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  function boxes(b, start, end, cb) {
    let o = start;
    while (o + 8 <= end) {
      let size = u32(b, o); const type = t4(b, o + 4); let h = 8;
      if (size === 1) { size = u32(b, o + 12); h = 16; }
      if (size === 0) size = end - o;
      if (size < h || o + size > end) break;
      cb(type, o + h, o + size);
      o += size;
    }
  }
  function parseMoov(b, out) {
    boxes(b, 0, b.length, (type, s, e) => {
      if (type === 'mvhd') {
        const v = b[s];
        const ts = v === 1 ? u32(b, s + 20) : u32(b, s + 12);
        const dur = v === 1 ? u32(b, s + 28) * 4294967296 + u32(b, s + 32) : u32(b, s + 16);
        if (ts) out.duration = dur / ts;
      } else if (type === 'udta') {
        boxes(b, s, e, (t2, s2, e2) => {
          if (t2 !== 'meta') return;
          boxes(b, s2 + 4, e2, (t3, s3, e3) => {
            if (t3 !== 'ilst') return;
            boxes(b, s3, e3, (key, s4, e4) => {
              boxes(b, s4, e4, (t5, s5, e5) => {
                if (t5 !== 'data') return;
                const flags = u32(b, s5) & 0xffffff, p = b.subarray(s5 + 8, e5);
                const str = () => clean(new TextDecoder('utf-8').decode(p));
                if (key === '©nam') out.title = str();
                else if (key === '©ART') out.artist = str();
                else if (key === 'aART') out.albumArtist = str();
                else if (key === '©alb') out.album = str();
                else if (key === '©gen') out.genre = str();
                else if (key === 'gnre') { const n = (p[0] << 8) | p[1]; out.genre = GENRES[n - 1] || ''; }
                else if (key === '©day') { const y = parseInt(str(), 10); if (y) out.year = y; }
                else if (key === 'trkn') out.track = (p[2] << 8) | p[3];
                else if (key === '©lyr') out.lyrics = str();
                else if (key === 'covr') out.art = new Blob([p.slice()], { type: flags === 14 ? 'image/png' : 'image/jpeg' });
              });
            });
          });
        });
      }
    });
  }

  function fromFilename(name) {
    let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').replace(/^\d{1,3}[\s.\-)]+/, '').trim();
    const m = base.match(/^(.+?)\s+[-–]\s+(.+)$/);
    return m ? { artist: m[1].trim(), title: m[2].trim() } : { title: base, artist: '' };
  }

  A.fromFilename = fromFilename;

  // One read of the start of the file serves the ID3 header, tag body and first MPEG frame (1 request instead of 3-4)
  function withHead(src, n = 393216) {
    let head = null;
    return Object.assign({}, src, {
      slice: async (s, e) => {
        if (e <= n && src.size > 0) { head = head || (await src.slice(0, Math.min(n, src.size))); return head.slice(s, Math.min(e, head.byteLength)); }
        return src.slice(s, e);
      }
    });
  }

  // Main: read all metadata from a source
  A.readMeta = async function (rawSrc) {
    const src = withHead(rawSrc);
    const out = {};
    const name = src.name || '';
    try {
      if (/\.(m4a|mp4|m4b|aac)$/i.test(name) && !/\.aac$/i.test(name)) await readMP4(src, out);
      else if (/\.mp3$/i.test(name) || !/\.(wav|flac|ogg|oga|opus|webm|weba|aac)$/i.test(name)) {
        const tagEnd = await readID3(src, out);
        if (!out.duration) out.duration = await mp3Duration(src, tagEnd).catch(() => 0);
      }
    } catch (e) { /* ignore broken tags */ }
    const fn = fromFilename(name.split(/[\\/]/).pop());
    if (!out.title) out.title = fn.title;
    if (!out.artist) out.artist = out.albumArtist || fn.artist || 'Unknown Artist';
    if (!out.album) out.album = '';
    return out;
  };

  // Duration fallback through the media element
  A.probeDuration = (url) => new Promise((res) => {
    const a = new Audio(); a.preload = 'metadata';
    const done = (d) => { a.src = ''; res(isFinite(d) ? d : 0); };
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    a.src = url;
  });

  // Downscale cover to <=600px JPEG
  A.shrinkCover = async function (blob, max = 600) {
    const fit = async (w0, h0, draw) => {
      const sc = Math.min(1, max / Math.max(w0, h0));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * sc)); c.height = Math.max(1, Math.round(h0 * sc));
      draw(c.getContext('2d'), c.width, c.height);
      return new Promise((r) => c.toBlob((b) => r(b || blob), 'image/jpeg', 0.85));
    };
    try { // 1) createImageBitmap
      const bmp = await createImageBitmap(blob);
      const out = await fit(bmp.width, bmp.height, (g, w, h) => g.drawImage(bmp, 0, 0, w, h)); bmp.close && bmp.close(); return out;
    } catch { /* fall through */ }
    try { // 2) classic <img> decode (some WebViews reject createImageBitmap for odd mime types)
      const u = URL.createObjectURL(blob);
      try {
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img decode')); i.src = u; });
        return await fit(img.naturalWidth, img.naturalHeight, (g, w, h) => g.drawImage(img, 0, 0, w, h));
      } finally { URL.revokeObjectURL(u); }
    } catch (e) { A.log && A.log('cover decode failed: ' + (e && e.message)); }
    return blob.size < 900000 ? blob : null; // last resort: keep the original picture
  };

  // ---- vibe analysis: energy / tempo / brightness / loudness ----
  A.analyze = async function (src) {
    let ab;
    const isMp3 = /\.mp3$/i.test(src.name);
    if (src.size > 14e6) {
      if (!isMp3) return null;
      const start = Math.floor(src.size * 0.3);
      ab = await src.slice(start, start + 1.2e6);
    } else ab = await src.slice(0, src.size);
    const SRATE = 22050;
    const oc = new OfflineAudioContext(1, SRATE, SRATE);
    const buf = await oc.decodeAudioData(ab);
    const data = buf.getChannelData(0);
    const n = Math.min(data.length, SRATE * 50);
    const from = data.length > n ? Math.floor((data.length - n) * 0.35) : 0;
    const seg = data.subarray(from, from + n);
    if (seg.length < SRATE * 4) return null;
    const HOP = 512, WIN = 1024, frames = Math.floor((seg.length - WIN) / HOP);
    const env = new Float32Array(frames);
    let sumSq = 0, zc = 0;
    for (let f = 0; f < frames; f++) {
      let e = 0; const o = f * HOP;
      for (let i = 0; i < WIN; i += 2) { const v = seg[o + i]; e += v * v; }
      env[f] = Math.sqrt(e / (WIN / 2)); sumSq += e;
    }
    for (let i = 1; i < seg.length; i += 2) if ((seg[i] >= 0) !== (seg[i - 1] >= 0)) zc++;
    const rms = Math.sqrt(sumSq / (frames * (WIN / 2))) || 1e-6;
    const db = 20 * Math.log10(rms);
    const loud = A.clamp((db + 30) / 20, 0, 1);
    const bright = A.clamp(zc / (seg.length / 2) / 0.16, 0, 1);
    // onset envelope + autocorrelation tempo
    const on = new Float32Array(frames);
    let mean = 0;
    for (let f = 1; f < frames; f++) { const d = env[f] - env[f - 1]; on[f] = d > 0 ? d : 0; mean += on[f]; }
    mean /= frames;
    let best = 0, bestLag = 0, acZero = 0;
    for (let f = 0; f < frames; f++) acZero += (on[f] - mean) * (on[f] - mean);
    const fr = SRATE / HOP;
    const ac = (bpm) => { const lag = Math.round((60 / bpm) * fr); let s = 0; for (let f = 0; f + lag < frames; f++) s += (on[f] - mean) * (on[f + lag] - mean); return [s, lag]; };
    for (let bpm = 70; bpm <= 180; bpm += 0.5) {
      const [raw, lag] = ac(bpm);
      const s = raw * (1 - Math.abs(Math.log2(bpm / 118)) * 0.25); // prefer natural tempo range
      if (s > best) { best = s; bestLag = lag; }
    }
    let tempo = bestLag ? Math.round((60 * fr) / bestLag) : 0;
    if (tempo && tempo < 100 && tempo * 2 <= 200) { // half-time vs double-time ambiguity
      const [s2, lag2] = ac(tempo * 2); if (s2 > best * 0.8) { tempo = Math.round((60 * fr) / lag2); }
    }
    const pulse = A.clamp(best / (acZero || 1) * 2.2, 0, 1);
    const tempoN = A.clamp((tempo - 70) / 100, 0, 1);
    const onsetN = A.clamp((mean / (rms || 1)) * 5, 0, 1);
    const energy = A.clamp(0.5 * loud + 0.22 * tempoN + 0.16 * onsetN + 0.12 * bright, 0, 1);
    let mix = null;
    if (src.size <= 14e6) { try { mix = A.mixAnalysis(data, SRATE); } catch (e) { A.log('beat grid failed: ' + e.message); } }
    if (mix) tempo = Math.round(mix.bpm);
    // mood: major keys, brightness, a quicker pulse and a song that sits on its beat all read as happier/lighter
    const dance = mix ? +A.clamp(0.65 * mix.dance + 0.35 * (1 - Math.min(1, Math.abs(tempo - 118) / 45)), 0, 1).toFixed(3) : +pulse.toFixed(3);
    const k = mix && mix.key, modeV = k ? (k.minor ? 0.5 - 0.4 * k.clar : 0.5 + 0.4 * k.clar) : 0.5;
    const valence = +A.clamp(0.45 * modeV + 0.2 * bright + 0.15 * tempoN + 0.2 * dance, 0, 1).toFixed(3);
    return { energy: +energy.toFixed(3), tempo, bright: +bright.toFixed(3), rms: +rms.toFixed(4), pulse: +pulse.toFixed(3), loud: +loud.toFixed(3), dance, valence, key: k ? k.cam : null, mix };
  };

  // ---- DJ beat grid: exact tempo, where the beats and bars fall, and the song's structure ----
  // Returns { v, bpm, beat0, bar0, bars: energy per bar 0-99, hb, he, ib, lb, key, ... }.
  // hb..he is the hook: the loudest section that also REPEATS through the song (a chorus comes back, a verse rarely
  // does), extended to its full length so a mix never cuts it off halfway. ib is where an incoming song is brought in
  // (the build into the hook) and lb is the end of the last full-energy section. Older fields (hook, i0, last, in
  // 8-bar phrases) are kept so anything reading them keeps working.
  A.MIX_VERSION = 3;
  const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PROF_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], PROF_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  A.camelot = (pc, minor) => { const maj = minor ? (pc + 3) % 12 : pc; return ((((maj * 7) % 12) + 7) % 12) + 1 + (minor ? 'A' : 'B'); };
  // how well two keys mix: 1 same key, 0.85 neighbour on the Camelot wheel or relative major/minor, 0 clash
  A.keyMatch = (a, b) => {
    if (!a || !b) return 0.5; const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1), d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
    return a === b ? 1 : (la === lb && d === 1) || (na === nb && la !== lb) ? 0.85 : la === lb && d === 2 ? 0.45 : d === 7 && la === lb ? 0.4 : 0.1;
  };
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  // 12-note pitch profile (chroma) for every frame, plus how much of each frame sits in the vocal band
  function chromaFrames(data, SR) {
    const W = 4096, H = 2048, n = Math.floor((data.length - W) / H); if (n < 8) return null;
    const re = new Float32Array(W), im = new Float32Array(W), win = new Float32Array(W), pc = new Int8Array(W / 2), vox = new Uint8Array(W / 2);
    for (let i = 0; i < W; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
    for (let k = 0; k < W / 2; k++) { const f = (k * SR) / W; pc[k] = f < 80 || f > 4200 ? -1 : (Math.round(69 + 12 * Math.log2(f / 440)) % 12 + 12) % 12; vox[k] = f >= 300 && f <= 3400 ? 1 : 0; }
    const ch = new Float32Array(n * 12), vr = new Float32Array(n), t0 = new Float32Array(n), mel = new Float32Array(n), sal = new Float32Array(n), en = new Float32Array(n);
    const mag = new Float32Array(W / 2), wh = new Float32Array(W / 2), sc = new Float32Array(79), bw = SR / W, KW = Math.max(2, Math.round(120 / bw));
    for (let f = 0; f < n; f++) {
      const o = f * H; for (let i = 0; i < W; i++) { re[i] = data[o + i] * win[i]; im[i] = 0; }
      fft(re, im); let tot = 1e-9, v = 0;
      for (let k = 2; k < W / 2; k++) { const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); mag[k] = m; tot += m; if (vox[k]) v += m; if (pc[k] >= 0) ch[f * 12 + pc[k]] += m; }
      vr[f] = v / tot; t0[f] = (o + W / 2) / SR; en[f] = tot;
      // the most likely sung note (predominant melody): whiten the spectrum, then for every note A2..C6 add up its
      // harmonics; the strongest note that also has a real fundamental wins
      let run = 0; for (let k = 0; k < Math.min(W / 2, 2 * KW + 1); k++) run += mag[k];
      for (let k = 0; k < W / 2; k++) { const lo = k - KW - 1, hi = k + KW; if (k > KW && hi < W / 2) { run += mag[hi] - mag[lo]; } wh[k] = mag[k] / (run / (2 * KW + 1) + 1e-9); }
      const at = (fr) => { const x = fr / bw, i = Math.floor(x), t = x - i; return i + 1 < W / 2 ? wh[i] * (1 - t) + wh[i + 1] * t : 0; };
      // (voices often have a weak fundamental, so all of the first 10 harmonics count; a candidate an octave too low
      // only collects every other harmonic, and one an octave too high misses half of them)
      let bs = 0, bm = 0; const S = sc; S.fill(0);
      for (let j = 0; j < S.length; j++) {
        const f0 = 440 * Math.pow(2, (45 + j * 0.5 - 69) / 12); let s = 0, hit = 0;
        for (let h = 1; h <= 10 && h * f0 < 5000; h++) { const v = Math.max(0, at(h * f0) - 1); s += Math.pow(0.86, h - 1) * v; if (v > 0.5) hit++; }
        S[j] = s * (0.6 + 0.4 * Math.min(1, hit / 5));
      }
      let bj = -1; for (let j = 0; j < S.length; j++) if (S[j] > bs) { bs = S[j]; bj = j; }
      // the winner may be the 2nd harmonic of a lower note: take the octave below when it is nearly as strong and
      // its odd harmonics (which the higher candidate can't explain) are really there
      if (bj >= 24) { const fl = 440 * Math.pow(2, (45 + (bj - 24) * 0.5 - 69) / 12); if (S[bj - 24] >= 0.55 * bs && at(fl * 3) > 1.6 && at(fl) + at(fl * 5) > 2.6) bj -= 24; }
      if (bj >= 0) bm = 45 + bj * 0.5;
      mel[f] = bm; sal[f] = bs;
    }
    return { ch, vr, t: t0, n, mel, sal, en };
  }
  A.mixAnalysis = function (data, SR) {
    const dur = data.length / SR; if (dur < 30) return null;
    const HOP = 256, fps = SR / HOP, N = Math.floor(data.length / HOP) - 1;
    const full = new Float32Array(N), low = new Float32Array(N);
    let lp = 0; const a = Math.exp(-2 * Math.PI * 150 / SR);
    for (let f = 0; f < N; f++) {
      let e = 0, b = 0; const o = f * HOP;
      for (let i = 0; i < HOP; i++) { const v = data[o + i]; lp = a * lp + (1 - a) * v; e += v * v; b += lp * lp; }
      full[f] = e; low[f] = b;
    }
    const onset = new Float32Array(N), bassOn = new Float32Array(N);
    for (let f = 1; f < N; f++) {
      const d1 = Math.log1p(1e3 * full[f]) - Math.log1p(1e3 * full[f - 1]), d2 = Math.log1p(1e4 * low[f]) - Math.log1p(1e4 * low[f - 1]);
      onset[f] = Math.max(0, d1) + 1.5 * Math.max(0, d2); bassOn[f] = Math.max(0, d2);
    }
    let m = 0; for (let f = 0; f < N; f++) m += onset[f]; m /= N; for (let f = 0; f < N; f++) onset[f] -= m;
    const at = (arr, x) => { const i = Math.floor(x), t = x - i; return i < 0 || i + 1 >= arr.length ? 0 : arr[i] * (1 - t) + arr[i + 1] * t; };
    // 1) coarse tempo: autocorrelation, also rewarding 2x and 4x the beat length (bars repeat), biased to 85-165 BPM
    const acf = (lag) => { let s = 0; for (let f = 0; f + lag < N; f += 2) s += onset[f] * at(onset, f + lag); return s; };
    let best = -Infinity, bpm = 120;
    for (let b = 70; b <= 180; b += 0.25) {
      const L = (60 / b) * fps; const sc = (acf(L) + 0.5 * acf(2 * L) + 0.25 * acf(4 * L)) * (1 - 0.35 * Math.abs(Math.log2(b / 122)));
      if (sc > best) { best = sc; bpm = b; }
    }
    // 2) fine tempo + beat phase: comb over the whole song
    const comb = (P) => { let bs = -Infinity, bp = 0; for (let ph = 0; ph < P; ph += 0.5) { let s = 0; for (let x = ph; x < N; x += P) s += at(onset, x); if (s > bs) { bs = s; bp = ph; } } return [bs, bp]; };
    let fb = -Infinity, fphase = 0;
    for (let b = bpm - 1.2; b <= bpm + 1.2; b += 0.02) { const [sc, ph] = comb((60 / b) * fps); if (sc > fb) { fb = sc; fphase = ph; bpm = b; } }
    const P = (60 / bpm) * fps, beat = 60 / bpm;
    // how strongly the song sits on its beat (on-beat onsets against off-beat ones): a "danceability" feel
    let onB = 0, offB = 0; for (let x = fphase; x + P / 2 < N; x += P) { onB += Math.max(0, at(onset, x) + m); offB += Math.max(0, at(onset, x + P / 2) + m); }
    const dance = A.clamp(((onB - offB) / (onB + offB + 1e-9)) * 2.2, 0, 1);
    // 3) downbeat: the beat (of four) where the chords change and the bass hits hardest
    const cf = chromaFrames(data, SR), nBeats = Math.floor((N - fphase) / P), bch = Array.from({ length: nBeats }, () => new Float32Array(12));
    if (cf) for (let f = 0; f < cf.n; f++) { const k = Math.floor((cf.t[f] * fps - fphase) / P); if (k >= 0 && k < nBeats) for (let c = 0; c < 12; c++) bch[k][c] += cf.ch[f * 12 + c]; }
    const cosv = (u, w) => { let d = 0, a1 = 0, a2 = 0; for (let c = 0; c < 12; c++) { d += u[c] * w[c]; a1 += u[c] * u[c]; a2 += w[c] * w[c]; } return a1 && a2 ? d / Math.sqrt(a1 * a2) : 1; };
    const bassS = [0, 0, 0, 0], chordS = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      for (let x = fphase + j * P; x < N; x += 4 * P) bassS[j] += at(bassOn, x) + 0.5 * at(bassOn, x + 1);
      if (cf) for (let k = j; k < nBeats; k += 4) if (k > 0) chordS[j] += 1 - cosv(bch[k - 1], bch[k]);
    }
    const bsum = bassS.reduce((p, v) => p + v, 0) || 1, csum = chordS.reduce((p, v) => p + v, 0) || 1;
    let bj = 0, bv = -Infinity;
    for (let j = 0; j < 4; j++) { const sc = bassS[j] / bsum + (cf ? 1.5 * (chordS[j] / csum) : 0); if (sc > bv) { bv = sc; bj = j; } }
    const beat0 = (fphase / fps) % beat; let bar0 = (fphase + bj * P) / fps; while (bar0 - 4 * beat >= 0) bar0 -= 4 * beat;
    // 4) energy per bar
    const barF = 4 * P, bars = [];
    for (let x = bar0 * fps; x + barF <= N; x += barF) { let e = 0; for (let f = Math.floor(x); f < x + barF; f++) e += full[f]; bars.push(Math.sqrt(e / barF)); }
    const nb = bars.length; if (nb < 16) return null;
    const mx = Math.max(...bars) || 1, barsN = bars.map((v) => Math.round((v / mx) * 99)), en = barsN.map((v) => v / 99);
    // 5) harmony per bar (chroma) and how much of each bar is in the vocal range
    const bc = Array.from({ length: nb }, () => new Float32Array(12)), bvx = new Float32Array(nb), bcnt = new Float32Array(nb), keyAcc = new Float32Array(12);
    if (cf) for (let f = 0; f < cf.n; f++) {
      const bi = Math.floor((cf.t[f] - bar0) / (4 * beat)); if (bi < 0 || bi >= nb) continue;
      for (let k = 0; k < 12; k++) { bc[bi][k] += cf.ch[f * 12 + k]; keyAcc[k] += cf.ch[f * 12 + k]; } bvx[bi] += cf.vr[f]; bcnt[bi]++;
    }
    for (let i = 0; i < nb; i++) { let s = 0; for (let k = 0; k < 12; k++) s += bc[i][k] * bc[i][k]; s = Math.sqrt(s) || 1; for (let k = 0; k < 12; k++) bc[i][k] /= s; if (bcnt[i]) bvx[i] /= bcnt[i]; }
    const sim = (i, j) => { let s = 0; for (let k = 0; k < 12; k++) s += bc[i][k] * bc[j][k]; return s; };
    // 6) repetition: for each bar, how strongly the 4 bars from it come back elsewhere in the song (8+ bars away),
    //    compared with how similar any two random stretches of this song are
    const W4 = (i, j) => { let s = 0; for (let k = 0; k < 4; k++) s += sim(i + k, j + k); return s / 4; };
    const pairs = []; for (let i = 0; i + 4 <= nb; i += 2) for (let j = i + 8; j + 4 <= nb; j += 2) pairs.push(W4(i, j));
    let mu = 0, sd = 0; pairs.forEach((v) => (mu += v)); mu /= pairs.length || 1; pairs.forEach((v) => (sd += (v - mu) ** 2)); sd = Math.sqrt(sd / (pairs.length || 1)) || 0.01;
    const rep = new Float32Array(nb);
    if (cf) for (let i = 0; i + 4 <= nb; i++) { let s = 0; for (let j = 0; j + 4 <= nb; j++) { if (Math.abs(i - j) < 8) continue; const z = (W4(i, j) - mu) / sd; if (z > 0.8) s += Math.min(2.5, z - 0.8); } rep[i] = s; }
    const rmax = Math.max(...rep) || 1; for (let i = 0; i < nb; i++) rep[i] /= rmax;
    const avg = (arr, s, n) => { let t = 0, c = 0; for (let i = Math.max(0, s); i < Math.min(nb, s + n); i++) { t += arr[i]; c++; } return c ? t / c : 0; };
    // 7) the hook: score every 8-bar stretch (on a 2-bar grid, since some songs open with a 2-bar pickup) on loudness, repetition, a lift into it and vocals
    const vmax = Math.max(...bvx) || 1, cand = [];
    for (let s = 0; s + 8 <= nb; s += 2) {
      const E = avg(en, s, 8), R = avg(rep, s, 8), lift = Math.max(0, avg(en, s, 4) - avg(en, s - 4, 4)), V = avg(bvx, s, 8) / vmax, pos = s / nb;
      let sc = 0.42 * E + (cf ? 0.36 * R : 0) + 0.12 * Math.min(1, lift * 3) + (cf ? 0.1 * V : 0);
      if (pos < 0.06 || pos > 0.88) sc *= 0.75; // an intro or outro is never the hook
      cand.push({ s, sc, E, R });
    }
    const top = Math.max(...cand.map((c) => c.sc));
    // the first time the chorus arrives is the one to play: earliest stretch close to the best score
    let hc = cand.find((c) => c.sc >= top * 0.9 && c.s / nb <= 0.8) || cand.find((c) => c.sc === top);
    // then settle on exactly where it starts: the best-scoring start within a few bars of it
    hc = cand.filter((c) => Math.abs(c.s - hc.s) <= 4).reduce((p, c) => (c.sc > p.sc ? c : p), hc);
    const hb = hc.s;
    // let the hook run its full length: keep going in 4-bar steps while it stays loud and is still the repeated part
    let he = hb + 8;
    while (he + 4 <= nb && he - hb < 24) { const E = avg(en, he, 4); if (E >= hc.E * 0.82 && (!cf || avg(rep, he - 2, 4) >= hc.R * 0.55 || E >= hc.E)) he += 4; else break; }
    // where to bring the song in: the stretch that builds into the hook, but never from near-silence
    let ib = Math.max(0, hb - 8); while (ib < hb && avg(en, ib, 4) < 0.18) ib += 4;
    // end of the last full-energy stretch (for whole-song mixes)
    let lb = nb; while (lb - 4 > he && avg(en, lb - 4, 4) < 0.55) lb -= 4;
    // 8) key and mode from the overall harmony (Krumhansl profiles), and a rough brightness of mood
    let key = null;
    if (cf) {
      const tot = keyAcc.reduce((s, v) => s + v, 0) || 1, x = Array.from(keyAcc, (v) => v / tot), corr = (p, r) => { const mx2 = x.reduce((s, v) => s + v, 0) / 12, mp = p.reduce((s, v) => s + v, 0) / 12; let a1 = 0, a2 = 0, a3 = 0; for (let k = 0; k < 12; k++) { const u = x[(k + r) % 12] - mx2, w = p[k] - mp; a1 += u * w; a2 += u * u; a3 += w * w; } return a1 / Math.sqrt(a2 * a3 || 1); };
      const sc = []; for (let r = 0; r < 12; r++) { sc.push([corr(PROF_MAJ, r), r, 0]); sc.push([corr(PROF_MIN, r), r, 1]); }
      sc.sort((p, q) => q[0] - p[0]);
      const [c1, pc, minor] = sc[0], c2 = sc[1][0];
      key = { name: KEYS[pc] + (minor ? 'm' : ''), cam: A.camelot(pc, minor), minor: !!minor, clar: +A.clamp((c1 - c2) * 4 + c1 * 0.5, 0, 1).toFixed(2) };
    }
    // 9) the sung melody's range (an estimate from the full mix): notes from frames that are loud, vocal-heavy and
    //    have a clear pitch, as percentiles in MIDI note numbers. Used by AI Audition to match songs to a voice.
    let mel = null;
    if (cf) {
      const idx = []; for (let f = 0; f < cf.n; f++) idx.push(f);
      const ens = idx.map((f) => cf.en[f]).sort((p, q) => p - q), eMed = ens[Math.floor(ens.length / 2)] || 0;
      const sals = idx.map((f) => cf.sal[f]).sort((p, q) => p - q), sTop = sals[Math.floor(sals.length * 0.4)] || 0;
      const notes = []; for (let f = 0; f < cf.n; f++) if (cf.en[f] >= eMed * 0.6 && cf.sal[f] >= sTop && cf.vr[f] >= 0.2 && cf.mel[f]) notes.push(cf.mel[f]);
      if (notes.length >= 40) {
        notes.sort((p, q) => p - q); const q = (x) => +notes[Math.min(notes.length - 1, Math.floor(notes.length * x))].toFixed(1);
        const hist = new Array(40).fill(0); notes.forEach((v) => { const i = Math.round(v) - 45; if (i >= 0 && i < 40) hist[i]++; });
        const hm = Math.max(...hist) || 1;
        mel = { p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), hist: hist.map((v) => Math.round((v / hm) * 99)), n: notes.length };
      }
    }
    const np = Math.floor(nb / 8);
    return {
      v: A.MIX_VERSION, bpm: +bpm.toFixed(2), beat0: +beat0.toFixed(3), bar0: +bar0.toFixed(3), bars: barsN, dur: +dur.toFixed(2),
      hb, he, ib, lb, key, mel, dance: +dance.toFixed(2), vocal: +(avg(bvx, 0, nb) || 0).toFixed(2),
      hook: Math.floor(hb / 8), i0: Math.floor(ib / 8), last: Math.max(Math.floor(hb / 8), Math.min(np - 1, Math.ceil(lb / 8) - 1))
    };
  };

  // ---- lyrics ----
  A.parseLRC = function (text) {
    const lines = []; let synced = false;
    for (const raw of text.split(/\r?\n/)) {
      const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
      const t = raw.replace(/\[[^\]]*\]/g, '').trim();
      if (tags.length) { synced = true; tags.forEach((m) => lines.push({ t: parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.')), s: t })); }
      else if (!/^\[[a-z]+:/i.test(raw) && raw.trim()) lines.push({ t: -1, s: raw.trim() });
    }
    if (synced) return { synced: true, lines: lines.filter((l) => l.t >= 0).sort((a, b) => a.t - b.t) };
    return { synced: false, lines };
  };
})(window.A);
