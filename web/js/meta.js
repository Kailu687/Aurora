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
    return { energy: +energy.toFixed(3), tempo, bright: +bright.toFixed(3), rms: +rms.toFixed(4), pulse: +pulse.toFixed(3), loud: +loud.toFixed(3) };
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
