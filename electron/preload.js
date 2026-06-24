'use strict';
// Secure bridge: the renderer gets a tiny, explicit API surface — no Node access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kx', {
  // Single command channel -> engine.dispatch in main.
  rpc: (method, params) => ipcRenderer.invoke('rpc', { method, params: params || {} }),

  pickFile: () => ipcRenderer.invoke('pick-file'),
  pickProject: () => ipcRenderer.invoke('pick-project'),
  saveProjectAs: () => ipcRenderer.invoke('save-project-as'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openPath: (p) => ipcRenderer.invoke('open-path', p),

  // Live pushes from the engine.
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  onJob: (cb) => ipcRenderer.on('job', (_e, j) => cb(j)),

  // Export overlay rendering: main asks renderer to rasterise objects on an fps grid.
  onRenderOverlay: (cb) => {
    ipcRenderer.on('render-overlay', async (_e, req) => {
      const report = (frac) => ipcRenderer.send('render-overlay-progress', { id: req.id, frac });
      try {
        const result = await cb(req, report);    // { fps, frames:[Uint8Array,...] }
        ipcRenderer.send('render-overlay-done', { id: req.id, result });
      } catch (err) {
        ipcRenderer.send('render-overlay-done', { id: req.id, error: String((err && err.message) || err) });
      }
    });
  },
});
