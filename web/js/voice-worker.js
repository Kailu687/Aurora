/* Aurora - runs the studio voice (Kokoro) in the background so speaking never freezes the app or the music */
import * as K from '../vendor/kokoro/kokoro.web.js';

let tts = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      K.env.wasmPaths = m.paths;
      tts = await K.KokoroTTS.from_pretrained(m.model, {
        dtype: 'q8', device: 'wasm',
        progress_callback: (p) => { if (p.status === 'progress' && p.total) self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); }
      });
      self.postMessage({ type: 'ready' });
    } else if (m.type === 'gen') {
      const out = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
      const pcm = out.audio instanceof Float32Array ? out.audio : Float32Array.from(out.audio || []);
      self.postMessage({ type: 'audio', id: m.id, pcm, sr: out.sampling_rate }, [pcm.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, stage: m.type, message: String((err && err.message) || err) });
  }
};
