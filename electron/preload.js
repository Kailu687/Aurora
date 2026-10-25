const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scan: (dir) => ipcRenderer.invoke('scan', dir),
  adoptRoots: (roots) => ipcRenderer.invoke('adopt-roots', roots),
  fetchJSON: (url) => ipcRenderer.invoke('fetch-json', url),
  downloadUpdate: (base) => ipcRenderer.invoke('download-update', base),
  applyUpdate: (base) => ipcRenderer.invoke('download-update', base),
  bootOk: () => ipcRenderer.invoke('boot-ok'),
  shellInfo: () => ipcRenderer.invoke('shell-info'),
  secretGet: (k) => ipcRenderer.invoke('secret-get', k),
  secretSet: (k, v) => ipcRenderer.invoke('secret-set', k, v),
  saveSnapshot: (json) => ipcRenderer.invoke('save-snapshot', json),
  relaunch: () => ipcRenderer.invoke('relaunch'),
  // A dropped file or folder: the path only exists because the user dropped it, so it may be played and scanned.
  pathFor: (file) => { const p = webUtils.getPathForFile(file); if (p) ipcRenderer.sendSync('allow-path', p); return p; },
  onMediaKey: (cb) => ipcRenderer.on('media-key', (_e, k) => cb(k))
});
