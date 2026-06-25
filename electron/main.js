'use strict';
// Electron main process. Owns the Engine (single source of truth), bridges the
// renderer over IPC, and starts the localhost control server so the MCP sidecar can
// attach to the very same project. The renderer NEVER does heavy work — it only sends
// commands and renders state/job events — which is what keeps the UI smooth.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const pendingOverlay = new Map(); // id → { resolve, reject, timer }
const path = require('path');
const { Engine } = require('./core/engine');
const { startControlServer } = require('./core/controlServer');
const { writeControlInfo } = require('./core/controlInfo');
const { startMcpHttpServer, MCP_HTTP_PORT } = require('./mcp/server');

let win = null;
let engine = null;
let exportWin = null;
let exportJobForwarder = null;

// Prevent Chromium from throttling the renderer when the window is minimised or
// hidden. Without these flags, convertToBlob() drops to ~1 fps in background,
// turning a 5-second export into a 6-minute export.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// One app instance only — avoids multiple engines fighting over the control file.
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

async function createWindow() {
  const exportsDir = path.join(app.getPath('videos') || app.getPath('downloads') || app.getPath('home'), 'KninixExports');
  engine = new Engine({ outDir: exportsDir, maxConcurrent: 4 });

  const ctl = await startControlServer(engine, {});
  writeControlInfo({ port: ctl.port, token: ctl.token, pid: process.pid });
  console.log(`[Kninix] control server on 127.0.0.1:${ctl.port}`);

  // MCP HTTP+SSE server — fixed URL so Claude Desktop can always find it
  startMcpHttpServer(engine, MCP_HTTP_PORT);
  console.log(`[Kninix] MCP ready → http://127.0.0.1:${MCP_HTTP_PORT}/sse`);

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

  // Ensure the renderer is never throttled — critical for overlay frame rasterisation
  // during export, which runs inside this webContents even when the window is minimised.
  win.webContents.setBackgroundThrottling(false);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Surface renderer console + crashes in the main log (useful for diagnostics).
  win.webContents.on('console-message', (_e, level, message, line, src) => {
    const tag = ['log', 'warn', 'error'][level] || 'log';
    console.log(`[renderer:${tag}] ${message}` + (level >= 2 ? ` (${src}:${line})` : ''));
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer] gone:', d.reason));

  // Push engine events to the renderer (so MCP-driven edits show up live too).
  engine.on('state', s => { if (win && !win.isDestroyed()) win.webContents.send('state', s); });
  engine.on('job', j => {
    if (win && !win.isDestroyed()) win.webContents.send('job', j);
  });

  // Hook renderer as overlay frame renderer for exports.
  engine.setOverlayRenderer(({ fps, total, onProgress }) => new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) return reject(new Error('No renderer'));
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      pendingOverlay.delete(id);
      reject(new Error('Overlay render timed out'));
    }, 600_000);
    pendingOverlay.set(id, { resolve, reject, timer, onProgress });
    win.webContents.send('render-overlay', { id, fps, total });
  }));

  win.on('closed', () => { win = null; });
}

function openExportWidget(jobId) {
  if (exportWin && !exportWin.isDestroyed()) { exportWin.focus(); return; }

  const [wx, wy] = win.getPosition();
  const [ww, wh] = win.getSize();
  const wW = 420, wH = 130;

  exportWin = new BrowserWindow({
    width: wW, height: wH,
    x: Math.round(wx + ww / 2 - wW / 2),
    y: Math.round(wy + wh / 2 - wH / 2),
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    backgroundColor: '#16181D',
    title: 'Kninix — Exporting',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  exportWin.loadFile(path.join(__dirname, '..', 'renderer', 'export-progress.html'), {
    hash: `jobId=${jobId}`,
  });

  // Forward job events to the widget window.
  exportJobForwarder = (j) => {
    if (exportWin && !exportWin.isDestroyed()) exportWin.webContents.send('job', j);
  };
  engine.on('job', exportJobForwarder);

  // Minimise the main window so only the compact widget is visible.
  win.minimize();

  exportWin.on('closed', () => {
    if (exportJobForwarder) { engine.removeListener('job', exportJobForwarder); exportJobForwarder = null; }
    exportWin = null;
    if (win && !win.isDestroyed()) { win.restore(); win.focus(); }
  });
}

// ---- IPC: the renderer's single command channel ----
// Incremental progress while the renderer rasterises overlay frames.
ipcMain.on('render-overlay-progress', (_e, { id, frac }) => {
  const p = pendingOverlay.get(id);
  if (p && p.onProgress) p.onProgress(frac);
});

// Receive rendered overlay frames from the renderer process.
ipcMain.on('render-overlay-done', (_e, { id, result, error }) => {
  const p = pendingOverlay.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pendingOverlay.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
});

ipcMain.handle('rpc', async (_e, { method, params }) => {
  try {
    const result = await engine.dispatch(method, params);
    if (method === 'export' && result && result.jobId) openExportWidget(result.jobId);
    return { ok: true, result };
  }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

ipcMain.handle('pick-export-path', async (_e, { defaultName } = {}) => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: defaultName || 'export.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('pick-file', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'ts', 'm2ts', 'mts', 'mp3', 'wav', 'aac', 'm4a', 'jpg', 'jpeg', 'png'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('pick-project', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Kninix Project', extensions: ['knx', 'json'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('save-project-as', async () => {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: 'Untitled.knx',
    filters: [{ name: 'Kninix Project', extensions: ['knx'] }],
  });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('reveal', async (_e, p) => { if (p) shell.showItemInFolder(p); return true; });

ipcMain.handle('open-path', async (_e, p) => { if (p) await shell.openPath(p); return true; });

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
