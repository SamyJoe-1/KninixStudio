'use strict';
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const info = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'Kninix-studio', 'kx-control.json'), 'utf8'));

function rpc(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ method, params: params || {} });
    const req = http.request(
      { host:'127.0.0.1', port:info.port, path:'/rpc', method:'POST',
        headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'x-kx-token':info.token} },
      (r) => { let d=''; r.on('data',x=>d+=x); r.on('end',()=>{ try{ const p=JSON.parse(d); p.ok?res(p.result):rej(new Error(p.error)); }catch(e){ rej(new Error('bad json: '+d.slice(0,200))); } }); });
    req.on('error', rej); req.write(body); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const proj = 'C:/Users/pc/Desktop/vid/segment_1_0-30s.knx';
  console.log('Loading', proj);
  await rpc('load_project', { path: proj });
  const st = await rpc('get_state');
  console.log('Loaded. resolution:', JSON.stringify(st.resolution), '| objects:', (st.objects||[]).length, '| tracks:', (st.tracks||[]).length);

  console.log('Starting export...');
  const { jobId, out } = await rpc('export', { name: 'TEST_seg1' });
  console.log('Export job:', jobId, '->', out);

  // Poll until the export job is done
  let done = false, lastPct = -1;
  for (let i = 0; i < 600; i++) {
    await sleep(1000);
    const jobs = await rpc('list_jobs');
    const job = jobs.find(j => j.id === jobId);
    if (!job) { console.log('job vanished'); break; }
    const pct = Math.round((job.progress || 0) * 100);
    if (pct !== lastPct) { console.log(`  [${job.status}] ${pct}% ${job.detail||''}`); lastPct = pct; }
    if (job.status === 'done' || job.status === 'completed') { done = true; break; }
    if (job.status === 'error' || job.status === 'failed' || job.status === 'cancelled') {
      console.error('EXPORT FAILED:', job.error || job.detail); process.exit(1);
    }
  }
  if (!done) { console.error('Timed out waiting for export'); process.exit(1); }

  console.log('Export complete:', out);
  console.log('OUTPUT_PATH=' + out);
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
