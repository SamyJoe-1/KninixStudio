'use strict';
// Electron main process. Owns the Engine (single source of truth), bridges the
// renderer over IPC, and starts the localhost control server so the MCP sidecar can
// attach to the very same project. The renderer NEVER does heavy work — it only sends
// commands and renders state/job events — which is what keeps the UI smooth.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { Engine } = require('./core/engine');
const { startControlServer } = require('./core/controlServer');
const { writeControlInfo } = require('./core/controlInfo');

let win = null;
let engine = null;

// One app instance only — avoids multiple engines fighting over the control file.
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

async function createWindow() {
  const exportsDir = path.join(app.getPath('videos') || app.getPath('downloads') || app.getPath('home'), 'KninixExports');
  engine = new Engine({ outDir: exportsDir, maxConcurrent: 4 });

  const ctl = await startControlServer(engine, {});
  writeControlInfo({ port: ctl.port, token: ctl.token, pid: process.pid });
  console.log(`[Kninix] control server on 127.0.0.1:${ctl.port}`);

  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#0E0F12',
    title: 'Kninix Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Surface renderer console + crashes in the main log (useful for diagnostics).
  win.webContents.on('console-message', (_e, level, message, line, src) => {
    const tag = ['log', 'warn', 'error'][level] || 'log';
    console.log(`[renderer:${tag}] ${message}` + (level >= 2 ? ` (${src}:${line})` : ''));
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer] gone:', d.reason));

  // Push engine events to the renderer (so MCP-driven edits show up live too).
  engine.on('state', s => { if (win && !win.isDestroyed()) win.webContents.send('state', s); });
  engine.on('job', j => { if (win && !win.isDestroyed()) win.webContents.send('job', j); });

  win.on('closed', () => { win = null; });
}

// ---- IPC: the renderer's single command channel ----
ipcMain.handle('rpc', async (_e, { method, params }) => {
  try { return { ok: true, result: await engine.dispatch(method, params) }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

ipcMain.handle('pick-file', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mp3', 'wav', 'aac', 'm4a', 'jpg', 'jpeg', 'png'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('reveal', async (_e, p) => { if (p) shell.showItemInFolder(p); return true; });

ipcMain.handle('open-path', async (_e, p) => { if (p) await shell.openPath(p); return true; });

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
