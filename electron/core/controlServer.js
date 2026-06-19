'use strict';
// A tiny localhost-only HTTP control surface. The MCP sidecar process talks to this
// to drive the SAME engine the GUI uses. Token-guarded, 127.0.0.1 only. This is the
// "MCP sidecar -> core command bus" bridge from docs/10.

const http = require('http');
const crypto = require('crypto');

function startControlServer(engine, opts = {}) {
  const token = opts.token || crypto.randomBytes(16).toString('hex');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/rpc') { res.writeHead(404); return res.end('not found'); }
    if (req.headers['x-kx-token'] !== token) { res.writeHead(401); return res.end('unauthorized'); }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body || '{}'); }
      catch { res.writeHead(400); return res.end('bad json'); }
      try {
        const result = await engine.dispatch(payload.method, payload.params || {});
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } catch (err) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(opts.port || 0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, token });
    });
  });
}

module.exports = { startControlServer };
