#!/usr/bin/env node
'use strict';
// Kninix Studio MCP server (JSON-RPC 2.0). Exposes the editor as MCP *tools* +
// *resources* so Claude ("Cue") can drive a project. Zero npm deps — the protocol is
// implemented directly. Two ways it gets its Engine:
//
//   • DESKTOP  — attach to the running GUI app's local control server (default).
//   • HEADLESS — spin up its own in-process Engine, no GUI needed (VPS / server use).
//
// Transports:
//   node electron/mcp/server.js                 stdio, attach to running app  (desktop)
//   node electron/mcp/server.js --headless      stdio, own in-process Engine  (VPS via SSH/pipe)
//   node electron/mcp/server.js --http          HTTP+SSE, own in-process Engine (VPS remote)
//   node electron/mcp/server.js --selftest      in-process protocol self-test (no GUI)
//
// Env: KX_HEADLESS=1 (force headless), KX_MCP_TRANSPORT=http, KX_MCP_HOST, KX_MCP_PORT,
//      KX_MCP_TOKEN (bearer guard for remote HTTP), KX_DATA_DIR, KX_OUT_DIR.

const http = require('http');
const readline = require('readline');
const { readControlInfo } = require('../core/controlInfo');

const SERVER_INFO = { name: 'Kninix-studio', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

// ---- tool catalogue (maps 1:1 onto engine.dispatch methods) ----
const TOOLS = [
  { name: 'get_state', method: 'get_state',
    description: 'Get the current project state: tracks, clips, media, markers, duration.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'list_media', method: 'list_media',
    description: 'List all imported media items (id, name, duration, resolution).',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'generate_sample', method: 'generate_sample',
    description: 'Generate a synthetic test clip (no footage needed). Runs as a background job.',
    inputSchema: { type: 'object', properties: {
      duration: { type: 'number', description: 'Seconds (default 5).' },
      freq: { type: 'number', description: 'Tone frequency Hz (default 220).' } } } },
  { name: 'import_media', method: 'import_media',
    description: 'Import a media file from an absolute path (probed with ffprobe).',
    inputSchema: { type: 'object', required: ['path'], properties: {
      path: { type: 'string', description: 'Absolute path to a video/audio/image file.' } } } },
  { name: 'add_clip', method: 'add_clip',
    description: 'Add a media item to the timeline. Appends to its track if "at" is omitted.',
    inputSchema: { type: 'object', required: ['mediaId'], properties: {
      mediaId: { type: 'string' },
      trackId: { type: 'string', description: 'Optional target track id.' },
      at: { type: 'number', description: 'Optional start time (seconds).' } } } },
  { name: 'move_clip', method: 'move_clip',
    description: 'Move a clip to a new start time (seconds), and optionally onto another track.',
    inputSchema: { type: 'object', required: ['clipId', 'at'], properties: {
      clipId: { type: 'string' }, at: { type: 'number' },
      trackId: { type: 'string', description: 'Optional destination track id (move the clip to another track).' } } } },
  { name: 'trim_clip', method: 'trim_clip',
    description: 'Trim a clip by setting its source in/out points (seconds).',
    inputSchema: { type: 'object', required: ['clipId'], properties: {
      clipId: { type: 'string' }, sourceIn: { type: 'number' }, sourceOut: { type: 'number' } } } },
  { name: 'split_clip', method: 'split_clip',
    description: 'Split a clip into two at an absolute timeline time (seconds).',
    inputSchema: { type: 'object', required: ['clipId', 'at'], properties: {
      clipId: { type: 'string' }, at: { type: 'number' } } } },
  { name: 'remove_clip', method: 'remove_clip',
    description: 'Remove a clip from the timeline.',
    inputSchema: { type: 'object', required: ['clipId'], properties: { clipId: { type: 'string' } } } },
  { name: 'add_track', method: 'add_track',
    description: 'Add a track. kind = "video" | "audio" | "text".',
    inputSchema: { type: 'object', properties: {
      kind: { type: 'string' }, name: { type: 'string' } } } },
  { name: 'add_text', method: 'add_object',
    description: 'Add a text overlay to the canvas. Coordinates are in 1280x720 space.',
    inputSchema: { type: 'object', required: ['text'], properties: {
      text: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' },
      fontSize: { type: 'number' }, color: { type: 'string', description: 'Hex e.g. #FFFFFF' } } } },
  { name: 'add_shape', method: 'add_object',
    description: 'Add a shape overlay to the canvas. Pass shape kind.',
    inputSchema: { type: 'object', properties: {
      type: { type: 'string', const: 'shape' },
      shape: { type: 'string', enum: ['rect', 'roundrect', 'ellipse', 'triangle', 'diamond', 'star', 'pentagon', 'hexagon', 'heart', 'arrow', 'line', 'ring'] },
      x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
      color: { type: 'string' } } } },
  { name: 'add_widget', method: 'add_widget',
    description: 'Add an animated widget. widget = lowerthird|progressbar|timer|badge|titlecard|bars.',
    inputSchema: { type: 'object', properties: {
      widget: { type: 'string', enum: ['lowerthird', 'progressbar', 'timer', 'badge', 'titlecard', 'bars'] },
      text: { type: 'string' }, subtitle: { type: 'string' }, color: { type: 'string' } } } },
  { name: 'update_object', method: 'update_object',
    description: 'Update a canvas object/widget. patch can include animIn/animOut {type,dur}, x,y,w,h, color, text, hidden, locked, start, end.',
    inputSchema: { type: 'object', required: ['id', 'patch'], properties: {
      id: { type: 'string' }, patch: { type: 'object' } } } },
  { name: 'reorder_object', method: 'reorder_object',
    description: 'Change a layer z-order. dir = up|down|front|back.',
    inputSchema: { type: 'object', required: ['id', 'dir'], properties: {
      id: { type: 'string' }, dir: { type: 'string', enum: ['up', 'down', 'front', 'back'] } } } },
  { name: 'set_clip_transition', method: 'set_clip_transition',
    description: 'Set a clip transition. which=in|out, type=fade|dipwhite, dur in seconds.',
    inputSchema: { type: 'object', required: ['clipId'], properties: {
      clipId: { type: 'string' }, which: { type: 'string', enum: ['in', 'out'] },
      type: { type: 'string', enum: ['fade', 'dipwhite'] }, dur: { type: 'number' } } } },
  { name: 'remove_object', method: 'remove_object',
    description: 'Remove a canvas object by id.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  { name: 'add_marker', method: 'add_marker',
    description: 'Add a marker at a time (seconds) with an optional label.',
    inputSchema: { type: 'object', required: ['at'], properties: {
      at: { type: 'number' }, label: { type: 'string' } } } },
  { name: 'set_playhead', method: 'set_playhead',
    description: 'Move the playhead to a time (seconds).',
    inputSchema: { type: 'object', required: ['at'], properties: { at: { type: 'number' } } } },
  { name: 'set_filter', method: 'set_filter',
    description: 'Apply a color filter to a clip. filter = none|bw|sepia|warm|cool|vivid|vintage|cinematic|invert|fade.',
    inputSchema: { type: 'object', required: ['clipId', 'filter'], properties: {
      clipId: { type: 'string' }, filter: { type: 'string' } } } },
  { name: 'generate_tone', method: 'generate_tone',
    description: 'Generate an audio music tone (seconds, frequency Hz) as an audio media item.',
    inputSchema: { type: 'object', properties: {
      duration: { type: 'number' }, freq: { type: 'number' } } } },
  { name: 'export', method: 'export',
    description: 'Export the timeline to an MP4. Runs as a background job; returns a jobId.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'save_project', method: 'save_project',
    description: 'Save the current project as a .knx file at an absolute path (created if missing; .knx appended if absent).',
    inputSchema: { type: 'object', required: ['path'], properties: {
      path: { type: 'string', description: 'Absolute output path, e.g. /var/lib/kninix/exports/my.knx' } } } },
  { name: 'load_project', method: 'load_project',
    description: 'Load a .knx/.json project file from an absolute path, replacing the current project.',
    inputSchema: { type: 'object', required: ['path'], properties: {
      path: { type: 'string', description: 'Absolute path to a .knx or .json project file.' } } } },
  { name: 'list_jobs', method: 'list_jobs',
    description: 'List background jobs (sample/thumbnail/export) with status and progress.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'undo', method: 'undo', description: 'Undo the last timeline command.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'redo', method: 'redo', description: 'Redo the last undone command.',
    inputSchema: { type: 'object', properties: {} } },
];

const RESOURCES = [
  { uri: 'kxp://project/state', name: 'Project state', mimeType: 'application/json', method: 'get_state' },
  { uri: 'kxp://media/library', name: 'Media library', mimeType: 'application/json', method: 'list_media' },
  { uri: 'kxp://jobs', name: 'Background jobs', mimeType: 'application/json', method: 'list_jobs' },
];

// ---- control-server client ----
function controlRpc(method, params) {
  return new Promise((resolve, reject) => {
    const info = readControlInfo();
    if (!info) return reject(new Error('Kninix Studio is not running (no control server found). Launch the app first.'));
    const body = JSON.stringify({ method, params: params || {} });
    const req = http.request(
      { host: '127.0.0.1', port: info.port, path: '/rpc', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-kx-token': info.token } },
      (res) => {
        let data = '';
        res.on('data', d => (data += d));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ok) resolve(parsed.result);
            else reject(new Error(parsed.error || 'control error'));
          } catch (e) { reject(e); }
        });
      });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Allow tests to inject an in-process dispatcher instead of HTTP.
let dispatcher = controlRpc;
function setDispatcher(fn) { dispatcher = fn; }

// ---- JSON-RPC handling ----
// dispatch defaults to the module-level `dispatcher` (stdio mode); pass an override for HTTP mode.
async function handleMessage(msg, dispatch) {
  const d = dispatch || dispatcher;
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
        };
        break;
      case 'notifications/initialized':
      case 'initialized':
        return null;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
        break;
      case 'tools/call': {
        const tool = TOOLS.find(t => t.name === (params && params.name));
        if (!tool) throw new Error('Unknown tool: ' + (params && params.name));
        try {
          const out = await d(tool.method, (params && params.arguments) || {});
          result = { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: false };
        } catch (err) {
          result = { content: [{ type: 'text', text: 'Error: ' + String((err && err.message) || err) }], isError: true };
        }
        break;
      }
      case 'resources/list':
        result = { resources: RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) };
        break;
      case 'resources/read': {
        const r = RESOURCES.find(x => x.uri === (params && params.uri));
        if (!r) throw new Error('Unknown resource: ' + (params && params.uri));
        const out = await d(r.method, {});
        result = { contents: [{ uri: r.uri, mimeType: r.mimeType, text: JSON.stringify(out, null, 2) }] };
        break;
      }
      default:
        if (isNotification) return null;
        throw rpcError(-32601, 'Method not found: ' + method);
    }
    if (isNotification) return null;
    return { jsonrpc: '2.0', id, result };
  } catch (err) {
    if (isNotification) return null;
    const e = err && err.code ? err : rpcError(-32603, String((err && err.message) || err));
    return { jsonrpc: '2.0', id, error: { code: e.code, message: e.message } };
  }
}

// ---- HTTP + SSE transport ----
// Desktop: auto-started by the Electron main process on 127.0.0.1 (no auth needed).
// Headless/VPS: started by `--http`; bind host/port via KX_MCP_HOST/KX_MCP_PORT and,
// for any non-loopback bind, guard it with KX_MCP_TOKEN (sent as `Authorization: Bearer
// <token>` or `?token=`). Claude Desktop config:  { "url": "http://HOST:PORT/sse" }
const MCP_HTTP_PORT = parseInt(process.env.KX_MCP_PORT, 10) || 3333;

function startMcpHttpServer(engine, port, opts = {}) {
  port = port || MCP_HTTP_PORT;
  const host = opts.host || process.env.KX_MCP_HOST || '127.0.0.1';
  const token = opts.token || process.env.KX_MCP_TOKEN || null;
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback && !token) {
    process.stderr.write('[Kninix-mcp] WARNING: binding ' + host + ' without KX_MCP_TOKEN — ' +
      'anyone who can reach this port can drive the editor. Set KX_MCP_TOKEN or bind 127.0.0.1 + SSH-tunnel.\n');
  }
  const authOk = (req, url) => {
    if (!token) return true;
    const hdr = req.headers['authorization'] || '';
    const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    const q = url.searchParams.get('token');
    return bearer === token || q === token;
  };

  const directDispatch = (method, params) => engine.dispatch(method, params);
  const clients = new Map();  // sessionId -> SSE response
  let nextSid = 1;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, `http://${host}:${port}`);

    // Health probe for load balancers / systemd / docker HEALTHCHECK (never guarded).
    if (req.method === 'GET' && url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, server: SERVER_INFO }));
    }

    if (!authOk(req, url)) { res.writeHead(401); return res.end('unauthorized'); }

    // SSE endpoint: client connects here to receive server→client messages
    if (req.method === 'GET' && url.pathname === '/sse') {
      const sid = nextSid++;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      clients.set(sid, res);
      // Tell the client which URL to POST messages to
      res.write(`event: endpoint\ndata: /message?session=${sid}\n\n`);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(ping); } }, 15000);
      req.on('close', () => { clients.delete(sid); clearInterval(ping); });
      return;
    }

    // Message endpoint: client POSTs JSON-RPC here, reply comes back over SSE
    if (req.method === 'POST' && url.pathname === '/message') {
      const sid = +url.searchParams.get('session');
      const client = clients.get(sid);
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', async () => {
        res.writeHead(202); res.end('accepted');
        let msg;
        try { msg = JSON.parse(body); } catch { return; }
        const reply = await handleMessage(msg, directDispatch);
        if (reply && client) {
          try { client.write(`data: ${JSON.stringify(reply)}\n\n`); } catch {}
        }
      });
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end(`Kninix Studio MCP\nSSE endpoint: http://${host}:${port}/sse\nAdd to Claude Desktop: { "url": "http://${host}:${port}/sse" }`);
    }

    res.writeHead(404); res.end('not found');
  });

  server.listen(port, host, () => {
    process.stderr.write(`[Kninix-mcp] HTTP+SSE ready → http://${host}:${port}/sse` +
      (token ? ' (token-guarded)' : '') + '\n');
  });

  return server;
}

function rpcError(code, message) { const e = new Error(message); e.code = code; return e; }

function send(obj) { if (obj) process.stdout.write(JSON.stringify(obj) + '\n'); }

function startStdioLoop() {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try { msg = JSON.parse(line); }
    catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    send(await handleMessage(msg));
  });
  process.stderr.write('[Kninix-mcp] ready on stdio\n');
}

// ---- headless: create our own in-process Engine (no GUI, no control file) ----
// This is what makes the server runnable on a VPS. The Engine is pure Node + ffmpeg;
// only overlay/caption baking on export needs the GUI renderer (absent here), so
// headless exports render clips + filters + transitions + lossless trims via ffmpeg.
function createStandaloneEngine() {
  const { Engine } = require('../core/engine');
  const engine = new Engine({
    dataDir: process.env.KX_DATA_DIR || undefined,
    outDir: process.env.KX_OUT_DIR || undefined,
    maxConcurrent: parseInt(process.env.KX_MAX_CONCURRENT, 10) || 4,
  });
  setDispatcher((method, params) => engine.dispatch(method, params));
  return engine;
}

// ---- self-test: in-process engine, exercise the protocol end-to-end ----
async function selftest() {
  const { Engine } = require('../core/engine');
  const engine = new Engine();
  setDispatcher((method, params) => engine.dispatch(method, params));

  const call = (m, p) => handleMessage({ jsonrpc: '2.0', id: Math.floor(Math.random() * 1e6), method: m, params: p });
  const log = (label, v) => console.log(label, JSON.stringify(v.result || v.error));

  console.log('== MCP self-test (in-process engine) ==');
  log('initialize ->', await call('initialize', { protocolVersion: PROTOCOL_VERSION }));
  const tools = await call('tools/list', {});
  console.log('tools/list -> ' + tools.result.tools.length + ' tools:', tools.result.tools.map(t => t.name).join(', '));

  console.log('tools/call generate_sample ...');
  const gen = await call('tools/call', { name: 'generate_sample', arguments: { duration: 2 } });
  const genOut = JSON.parse(gen.result.content[0].text);
  console.log('  -> jobId', genOut.jobId);

  // wait for the sample job to finish
  await waitJobs(engine);
  const media = (await engine.dispatch('list_media', {}));
  console.log('media after sample:', media.length, media.map(m => m.name));

  if (media[0]) {
    const add = await call('tools/call', { name: 'add_clip', arguments: { mediaId: media[0].id } });
    console.log('add_clip ->', add.result.content[0].text.replace(/\s+/g, ' ').slice(0, 80));
  }
  const state = await call('resources/read', { uri: 'kxp://project/state' });
  const st = JSON.parse(state.result.contents[0].text);
  console.log('resource project/state -> duration=' + st.duration + 's, clips=' +
    st.tracks.reduce((n, t) => n + t.clips.length, 0));

  console.log('== MCP self-test PASS ==');
  process.exit(0);
}

function waitJobs(engine, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const jobs = engine.jobs.list();
      const active = jobs.filter(j => j.status === 'queued' || j.status === 'running');
      if (!active.length && jobs.length) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error('jobs timeout'));
      setTimeout(tick, 150);
    };
    tick();
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const wantHttp = argv.includes('--http') || process.env.KX_MCP_TRANSPORT === 'http';
  const wantHeadless = argv.includes('--headless') || process.env.KX_HEADLESS === '1' || wantHttp;

  if (argv.includes('--selftest')) {
    selftest().catch(e => { console.error('SELFTEST FAIL:', e); process.exit(1); });
  } else if (wantHttp) {
    // Networked headless mode: own Engine, served over HTTP+SSE (for remote MCP clients).
    const engine = createStandaloneEngine();
    startMcpHttpServer(engine, MCP_HTTP_PORT);
  } else if (wantHeadless) {
    // Headless stdio mode: own Engine, no GUI (e.g. Claude Desktop launching over SSH).
    createStandaloneEngine();
    startStdioLoop();
  } else {
    // Desktop mode: attach over HTTP to the already-running GUI app's control server.
    startStdioLoop();
  }
}

module.exports = { handleMessage, setDispatcher, TOOLS, RESOURCES, startMcpHttpServer, MCP_HTTP_PORT, createStandaloneEngine };
