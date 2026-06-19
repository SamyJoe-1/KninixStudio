'use strict';
// Secure bridge: the renderer gets a tiny, explicit API surface — no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kx', {
  // Single command channel -> engine.dispatch in main.
  rpc: (method, params) => ipcRenderer.invoke('rpc', { method, params: params || {} }),

  pickFile: () => ipcRenderer.invoke('pick-file'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),

  // Live pushes from the engine.
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onJob: (cb) => ipcRenderer.on('job', (_e, j) => cb(j)),
});
