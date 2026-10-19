/* Aurora - tiny IndexedDB wrapper */
(function (A) {
  const STORES = ['tracks', 'art', 'files', 'roots', 'kv'];
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('aurora-db', 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('tracks', { keyPath: 'id' });
        db.createObjectStore('roots', { keyPath: 'id' });
        ['art', 'files', 'kv'].forEach((s) => db.createObjectStore(s));
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
  async function tx(store, mode = 'readonly') { const db = await open(); return db.transaction(store, mode).objectStore(store); }

  A.db = {
    open,
    async get(s, k) { return wrap((await tx(s)).get(k)); },
    async getAll(s) { return wrap((await tx(s)).getAll()); },
    async keys(s) { return wrap((await tx(s)).getAllKeys()); },
    async put(s, v, k) { return wrap((await tx(s, 'readwrite')).put(v, k)); },
    async del(s, k) { return wrap((await tx(s, 'readwrite')).delete(k)); },
    async putMany(s, vals) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(s, 'readwrite'); const st = t.objectStore(s);
        vals.forEach((v) => (Array.isArray(v) ? st.put(v[0], v[1]) : st.put(v)));
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    },
    async delMany(s, keys) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(s, 'readwrite'); const st = t.objectStore(s);
        keys.forEach((k) => st.delete(k));
        t.oncomplete = () => res(); t.onerror = () => rej(t.error);
      });
    },
    async clear(s) { return wrap((await tx(s, 'readwrite')).clear()); }
  };
})(window.A);
