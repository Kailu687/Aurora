/* Aurora - Studio voice: a natural-sounding neural voice for the DJ that runs entirely on this device.
   Uses Kokoro-82M (Apache-2.0) through kokoro-js / transformers.js. Free, no account, no API key: the voice model
   (about 90 MB) is downloaded once from Hugging Face and kept in this device's cache, and the speech engine itself
   (web/vendor/kokoro) ships with the app. The one big engine file (onnxruntime's WebAssembly, ~21 MB) is fetched
   from Aurora's own website the first time and checked against the SHA-256 below before it is used. */
(function (A) {
  const WASM = { file: 'ort-wasm-simd-threaded.jsep.wasm', size: 21596019, sha256: 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39' };
  const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX', CACHE = 'aurora-voice';
  A.STUDIO_VOICES = {
    af_heart: 'Heart · warm, American', af_bella: 'Bella · bright, American', af_nicole: 'Nicole · soft and close, American', af_sarah: 'Sarah · relaxed, American',
    am_michael: 'Michael · easy-going, American', am_fenrir: 'Fenrir · bold, American', am_puck: 'Puck · playful, American',
    bf_emma: 'Emma · smooth, British', bm_george: 'George · deep, British', bm_fable: 'Fable · storyteller, British'
  };
  // which voice each DJ persona uses unless the listener picks one
  const PERSONA = { smooth: 'af_heart', hype: 'am_fenrir', zen: 'af_nicole' };

  const V = A.voice = { state: 'off', progress: 0, error: '', listeners: new Set(), tts: null };
  V.emit = () => V.listeners.forEach((f) => { try { f(V); } catch { /* */ } });
  V.supported = () => typeof WebAssembly === 'object' && 'caches' in window && !!(window.crypto && crypto.subtle);
  V.wanted = () => A.store.get('studioVoice', false) === true;
  V.ready = () => V.state === 'ready' && !!V.worker;
  V.voiceFor = (style) => { const v = A.store.get('studioVoiceName', ''); return A.STUDIO_VOICES[v] ? v : PERSONA[style] || 'af_heart'; };
  const set = (state, extra = {}) => { Object.assign(V, { state }, extra); V.emit(); };

  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  async function wasmURL() {
    const c = await caches.open(CACHE), key = 'https://aurora.local/voice/' + WASM.file + '?' + WASM.sha256.slice(0, 12);
    let hit = await c.match(key), buf = hit && (await hit.arrayBuffer());
    if (!buf || hex(await crypto.subtle.digest('SHA-256', buf)) !== WASM.sha256) {
      buf = null;
      const cfg = await fetch('config.json').then((r) => r.json()).catch(() => ({}));
      const bases = [];
      if (/^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname)) bases.push(new URL('voice/', location.href).href);
      [cfg.updateUrl, cfg.updateUrlFallback].filter(Boolean).forEach((u) => bases.push(new URL('voice/', u).href));
      bases.push(new URL('voice/', location.href).href); // a local build serving the repo
      for (const base of bases) {
        try {
          const r = await fetch(base + WASM.file, { cache: 'no-store' }); if (!r.ok) continue;
          const b = await r.arrayBuffer();
          if (hex(await crypto.subtle.digest('SHA-256', b)) !== WASM.sha256) { A.log('voice engine checksum mismatch from ' + base); continue; }
          buf = b; break;
        } catch { /* try the next mirror */ }
      }
      if (!buf) throw new Error('Couldn’t download the voice engine. Check your connection and try again.');
      try { await c.put(key, new Response(buf, { headers: { 'content-type': 'application/wasm' } })); } catch { /* storage full: still usable this session */ }
    }
    return URL.createObjectURL(new Blob([buf], { type: 'application/wasm' }));
  }

  // Download (first time) and start the voice in a background worker. Safe to call repeatedly.
  // The voice is heavy, so it only starts when the DJ is actually about to talk, never at app start.
  const jobs = new Map(); let seq = 0;
  V.load = function () {
    if (V._loading) return V._loading;
    if (!V.supported() || typeof Worker === 'undefined') { set('error', { error: 'This device can’t run the studio voice.' }); return Promise.resolve(null); }
    set('loading', { progress: 0, error: '' });
    V._loading = (async () => {
      const paths = { mjs: new URL('vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs', document.baseURI).href, wasm: await wasmURL() };
      const w = new Worker(new URL('js/voice-worker.js', document.baseURI).href, { type: 'module' }), files = new Map();
      await new Promise((ok, no) => {
        w.onerror = (e) => no(new Error((e && e.message) || 'voice worker failed to start'));
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'progress') { files.set(m.file, [m.loaded, m.total]); let l = 0, t = 0; files.forEach(([a, b]) => { l += a; t += b; }); V.progress = t ? l / t : 0; V.emit(); }
          else if (m.type === 'ready') ok();
          else if (m.type === 'error' && m.stage === 'load') no(new Error(m.message));
          else if (m.type === 'audio' || m.type === 'error') { const j = jobs.get(m.id); if (j) { jobs.delete(m.id); m.type === 'audio' ? j.ok(m) : j.no(new Error(m.message)); } }
        };
        w.postMessage({ type: 'load', paths, model: MODEL });
      }).catch((e) => { w.terminate(); throw e; });
      w.onerror = () => { jobs.forEach((j) => j.no(new Error('voice stopped'))); jobs.clear(); V.worker = null; V._loading = null; set('off'); };
      V.worker = w; A.store.set('studioVoiceReady', true); set('ready', { progress: 1 });
      return w;
    })().catch((e) => { A.log('studio voice failed: ' + (e && e.message)); V._loading = null; set('error', { error: /fetch|network|download/i.test((e && e.message) || '') ? 'Couldn’t download the voice. Check your internet connection and try again.' : 'The studio voice couldn’t start on this device.' }); return null; });
    return V._loading;
  };
  V.enable = (on) => {
    A.store.set('studioVoice', !!on);
    if (on) V.load(); else { if (V.worker) V.worker.terminate(); V.worker = null; V._loading = null; set('off'); } // turning it off frees its memory
  };

  // Turn text into a WAV clip. Lines are rendered one after another so two DJ lines never fight for the CPU.
  let chain = Promise.resolve();
  V.synth = function (text, { style = 'smooth', speed = 1 } = {}) {
    const job = chain.then(async () => {
      const w = V.worker || (await V.load()); if (!w) return null;
      const id = ++seq, out = await new Promise((ok, no) => { jobs.set(id, { ok, no }); w.postMessage({ type: 'gen', id, text, voice: V.voiceFor(style), speed: A.clamp(speed, 0.7, 1.3) }); });
      const pcm = out.pcm, sr = out.sr; if (!pcm || !pcm.length) return null;
      return { blob: wav(trim(pcm, sr), sr), secs: pcm.length / sr };
    });
    chain = job.catch(() => {});
    return job;
  };
  // drop leading/trailing silence so the DJ comes in exactly on cue
  function trim(pcm, sr) {
    const th = 0.01; let a = 0, b = pcm.length - 1;
    while (a < b && Math.abs(pcm[a]) < th) a++; while (b > a && Math.abs(pcm[b]) < th) b--;
    a = Math.max(0, a - Math.floor(sr * 0.02)); b = Math.min(pcm.length, b + Math.floor(sr * 0.12));
    return pcm.subarray(a, b);
  }
  function wav(pcm, sr) {
    const n = pcm.length, buf = new ArrayBuffer(44 + n * 2), d = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
    d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  // Play a rendered clip on its own (never through the music's volume ducking). Resolves true when it finished.
  V.play = function (clip, vol = 1) {
    V.stop();
    return new Promise((res) => {
      const el = new Audio(), url = URL.createObjectURL(clip.blob); el.src = url; el.volume = A.clamp(vol, 0, 1);
      let done = false; const fin = (ok) => { if (done) return; done = true; clearTimeout(guard); URL.revokeObjectURL(url); if (V._el === el) V._el = null; res(ok); };
      const guard = setTimeout(() => fin(false), clip.secs * 1000 + 4000);
      el.onended = () => fin(true); el.onerror = () => fin(false); V._el = el; V._fin = fin;
      el.play().catch(() => fin(false));
    });
  };
  V.stop = () => { const el = V._el; if (el) { el.pause(); V._el = null; if (V._fin) V._fin(false); } };
  V.speaking = () => !!V._el;

  // ---------- settings row (DJ page and Settings) ----------
  V.rowHTML = function () {
    if (!V.supported()) return '';
    const esc = A.esc || ((x) => String(x)), on = V.wanted();
    let right, sub;
    if (V.state === 'loading') { const pc = Math.round(V.progress * 100); sub = `Downloading the voice… ${pc}% · this happens once`; right = `<div class="sv-bar"><i style="width:${pc}%"></i></div>`; }
    else if (V.state === 'error' && on) { sub = esc(V.error || 'Couldn’t start'); right = '<button class="btn ghost sm" data-a="sv-get">Try again</button>'; }
    else if (on && V.state === 'ready') {
      sub = 'A natural, expressive voice that runs on this device. No internet needed now.';
      right = `<select data-sv="name" style="max-width:220px"><option value="">Match the DJ</option>${Object.entries(A.STUDIO_VOICES).map(([k, l]) => `<option value="${k}"${A.store.get('studioVoiceName', '') === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><button class="btn ghost sm" data-a="test-voice">Test</button><button class="switch on" data-a="sv-off" title="Turn off"></button>`;
    } else if (on) { sub = 'Starting the voice…'; right = '<button class="switch on" data-a="sv-off" title="Turn off"></button>'; }
    else { sub = 'Makes the DJ sound like a real person instead of a computer. Free, private, runs on this device. Downloads about 110 MB once.'; right = `<button class="btn accent sm" data-a="sv-get">${A.store.get('studioVoiceReady', false) ? 'Turn on' : 'Get studio voice'}</button>`; }
    return `<div class="set-row" id="sv-row"><div>Studio voice<small>${sub}</small></div><div class="ctl">${right}</div></div>`;
  };
  V.mount = function (root) { // keep a rendered row live while it is on screen
    const draw = () => { const r = root.querySelector('#sv-row'); if (!r) { V.listeners.delete(draw); return; } r.outerHTML = V.rowHTML(); bind(); };
    const bind = () => { const sel = root.querySelector('[data-sv=name]'); if (sel) sel.onchange = () => A.store.set('studioVoiceName', sel.value); };
    bind(); V.listeners.add(draw);
  };

})(window.A);
