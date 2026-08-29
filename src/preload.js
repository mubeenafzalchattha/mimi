const { contextBridge, ipcRenderer } = require('electron');

const params = new URLSearchParams(location.search);

contextBridge.exposeInMainWorld('petpet', {
  displayId: Number(params.get('display') || 0),
  onPets: (fn) => ipcRenderer.on('pets:update', (_e, pets) => fn(pets)),
  onConfig: (fn) => ipcRenderer.on('config:update', (_e, cfg) => fn(cfg)),
  onCursor: (fn) => ipcRenderer.on('cursor:move', (_e, pt) => fn(pt)),
  onFinished: (fn) => ipcRenderer.on('pet:finished', (_e, id) => fn(id)),
  setInteractive: (on) => ipcRenderer.send('ui:interactive', on),
  complete: (id) => ipcRenderer.invoke('pet:complete', id),
  getConfig: () => ipcRenderer.invoke('config:get')
});
