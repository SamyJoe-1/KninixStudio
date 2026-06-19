'use strict';
// Faithful MCP test: real child process over stdio, forwarding through the HTTP
// control server into a live engine — the exact path Claude Desktop uses.
// Run: node scripts/test-mcp.js

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const { Engine } = require('../electron/core/engine');
const { startControlServer } = require('../electron/core/controlServer');
const { writeControlInfo } = require('../electron/core/controlInfo');

let failures = 0;
const assert = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) failures++; };

(async () => {
  console.log('== Kinetix MCP end-to-end test ==');

  // 1. Stand up a live engine + control server (simulating the running app).
  const engine = new Engine();
  const ctl = await startControlServer(engine, {});
  writeControlInfo({ port: ctl.port, token: ctl.token, pid: process.pid });
  console.log('control server on 127.0.0.1:' + ctl.port);

  // 2. Spawn the MCP server as a real separate process, talk JSON-RPC over stdio.
  const child = spawn('node', [path.join(__dirname, '..', 'electron', 'mcp', 'server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  rl.on('line', (line) => {
    line = line.trim(); if (!line) return;
    let msg; try { msg = JSON.parse(line); } catch { return; }
    if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  let nextId = 1;
  const send = (method, params) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  // 3. Drive the protocol.
  const init = await send('initialize', { protocolVersion: '2024-11-05' });
  assert(init.result && init.result.serverInfo.name === 'kinetix-studio', 'initialize handshake');

  const tools = await send('tools/list', {});
  assert(tools.result.tools.length === 25, 'tools/list returns 25 tools (' + tools.result.tools.length + ')');

  const gen = await send('tools/call', { name: 'generate_sample', arguments: { duration: 2 } });
  assert(gen.result && !gen.result.isError, 'tools/call generate_sample accepted');

  // wait for the (engine-side) sample job to finish
  await new Promise((res) => {
    const iv = setInterval(() => {
      const active = engine.jobs.list().filter(j => j.status === 'queued' || j.status === 'running');
      if (engine.jobs.list().length && !active.length) { clearInterval(iv); res(); }
    }, 150);
  });

  const mediaCall = await send('tools/call', { name: 'list_media', arguments: {} });
  const media = JSON.parse(mediaCall.result.content[0].text);
  assert(media.length === 1, 'media imported via MCP (' + media.length + ')');

  const addCall = await send('tools/call', { name: 'add_clip', arguments: { mediaId: media[0].id } });
  assert(addCall.result && !addCall.result.isError, 'tools/call add_clip placed a clip');

  const readState = await send('resources/read', { uri: 'kxp://project/state' });
  const st = JSON.parse(readState.result.contents[0].text);
  const clips = st.tracks.reduce((n, t) => n + t.clips.length, 0);
  assert(clips === 1 && st.duration > 0, `resource reflects the edit (clips=${clips}, duration=${st.duration}s)`);

  child.kill();
  console.log('\n== ' + (failures ? failures + ' FAILURE(S) ✗' : 'ALL MCP TESTS PASSED ✓') + ' ==');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('MCP TEST CRASHED:', e); process.exit(1); });
