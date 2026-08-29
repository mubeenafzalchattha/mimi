const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('purrmind', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  getStatus: () => ipcRenderer.invoke('home:status'),
  onStatus: (fn) => ipcRenderer.on('home:status', (_e, s) => fn(s)),
  summon: () => ipcRenderer.invoke('home:summon'),
  refresh: () => ipcRenderer.invoke('home:refresh'),
  complete: (id) => ipcRenderer.invoke('pet:complete', id),
  openPrivacy: () => ipcRenderer.invoke('home:privacy'),
  setLoginItem: (on) => ipcRenderer.invoke('home:loginItem', on),
  quit: () => ipcRenderer.invoke('home:quit')
});
