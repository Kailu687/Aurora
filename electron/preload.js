const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scan: (dir) => ipcRenderer.invoke('scan', dir),
  fetchJSON: (url) => ipcRenderer.invoke('fetch-json', url),
  applyUpdate: (base, manifest) => ipcRenderer.invoke('apply-update', base, manifest),
  pathFor: (file) => webUtils.getPathForFile(file),
  onMediaKey: (cb) => ipcRenderer.on('media-key', (_e, k) => cb(k))
});
