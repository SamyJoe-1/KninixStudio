#!/usr/bin/env node
'use strict';
// Simple headless renderer: load a .knx profile → export an MP4.
//
//   node scripts/render.js <name>            interactive: asks resolution + fps (Enter = default)
//   node scripts/render.js <name> 1080 30    non-interactive
//
// You pass ONLY the profile name (no path, ".knx" optional). Fixed server layout
// (override with env vars):
//   profiles : KX_PROFILE_DIR  default /home/storage/kninix/profiles
//   output   : KX_OUT_DIR      default /home/storage/kninix/exports
// Media paths are read from inside the .knx itself — nothing to configure here.
// Output filename is the current date-time, e.g. 2026-07-01_20-10-05.mp4

const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { Engine } = require('../electron/core/engine');

const PROFILE_DIR = process.env.KX_PROFILE_DIR || '/home/storage/kninix/profiles';
const OUT_DIR     = process.env.KX_OUT_DIR     || '/home/storage/kninix/exports';
const DEFAULT_RES = 720;
const DEFAULT_FPS = 60;

function ask(rl, q, def) {
  return new Promise(res => rl.question(`${q} [${def}]: `, a => res((a || '').trim() || String(def))));
}

function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

(async () => {
  let name = process.argv[2];
  if (!name) { console.error('Usage: node scripts/render.js <profile-name> [resolution] [fps]'); process.exit(1); }
  if (!name.toLowerCase().endsWith('.knx')) name += '.knx';
  const knx = path.isAbsolute(name) ? name : path.join(PROFILE_DIR, name);
  if (!fs.existsSync(knx)) { console.error('Profile not found: ' + knx); process.exit(1); }

  let res = process.argv[3];
  let fps = process.argv[4];
  if (!res || !fps) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!res) res = await ask(rl, 'Resolution (480/720/1080/1440/2160)', DEFAULT_RES);
    if (!fps) fps = await ask(rl, 'FPS', DEFAULT_FPS);
    rl.close();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = path.join(OUT_DIR, stamp() + '.mp4');

  const engine = new Engine({ outDir: OUT_DIR });
  engine.loadProjectFile(knx);
  console.log(`Rendering ${path.basename(knx)} @ ${res}p ${fps}fps ...`);

  const { jobId } = await engine.dispatch('export', {
    outPath: out, quality: parseInt(res, 10), fps: parseInt(fps, 10),
  });

  await new Promise((resolve, reject) => {
    const t = setInterval(() => {
      const j = engine.jobs.list().find(x => x.id === jobId);
      if (!j) return;
      if (j.detail) process.stdout.write('\r' + j.detail + '          ');
      if (j.status === 'done')  { clearInterval(t); console.log('\n✅ EXPORTED -> ' + j.result.out); resolve(); }
      if (j.status === 'error') { clearInterval(t); reject(new Error(j.error)); }
    }, 200);
  });
  process.exit(0);
})().catch(e => { console.error('\n❌ FAIL: ' + (e.message || e)); process.exit(1); });
