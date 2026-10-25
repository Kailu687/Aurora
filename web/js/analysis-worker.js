/* Aurora - song analysis off the main thread (loads meta.js and runs A.vibe) */
self.window = self;
self.A = { clamp: (v, a, b) => (v < a ? a : v > b ? b : v), log: () => {} };
importScripts('meta.js');
self.onmessage = (e) => {
  const { id, data, size } = e.data;
  try { self.postMessage({ id, r: self.A.vibe(data, size) }); } catch (err) { self.postMessage({ id, err: String((err && err.message) || err) }); }
};
