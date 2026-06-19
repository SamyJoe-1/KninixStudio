'use strict';
// Where the running app advertises its control-server {port, token} so the MCP
// sidecar (launched separately, e.g. by Claude Desktop) can discover and attach.

const path = require('path');
const fs = require('fs');
const os = require('os');

const CONTROL_FILE = path.join(os.tmpdir(), 'kinetix-studio', 'kx-control.json');

function writeControlInfo(info) {
  fs.mkdirSync(path.dirname(CONTROL_FILE), { recursive: true });
  fs.writeFileSync(CONTROL_FILE, JSON.stringify(info));
  return CONTROL_FILE;
}

function readControlInfo() {
  if (!fs.existsSync(CONTROL_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(CONTROL_FILE, 'utf8')); }
  catch { return null; }
}

module.exports = { CONTROL_FILE, writeControlInfo, readControlInfo };
