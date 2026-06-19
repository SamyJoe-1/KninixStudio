'use strict';
// Headless end-to-end test of the engine: no Electron, just the core + real ffmpeg.
// Proves: (1) concurrent jobs actually overlap in time, (2) a real export renders,
// (3) undo/redo works. Run: node scripts/test-core.js

const fs = require('fs');
const { Engine } = require('../electron/core/engine');
const ff = require('../electron/core/ffmpeg');

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.log('  ✗ ' + msg); failures++; }
}

function waitIdle(engine, { debounce = 350, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let timer = null;
    const check = () => {
      const active = engine.jobs.list().filter(j => j.status === 'queued' || j.status === 'running');
      if (active.length === 0) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const again = engine.jobs.list().filter(j => j.status === 'queued' || j.status === 'running');
          if (again.length === 0) { engine.removeListener('job', check); resolve(); }
        }, debounce);
      }
      if (Date.now() - t0 > timeout) { engine.removeListener('job', check); reject(new Error('idle timeout')); }
    };
    engine.on('job', check);
    check();
  });
}

(async () => {
  console.log('== Kinetix core test ==');
  const engine = new Engine();

  // --- 1. concurrency: fire 3 sample jobs at once ---
  console.log('\n[1] launching 3 sample jobs concurrently…');
  const t0 = Date.now();
  const ids = [
    engine.generateSample({ duration: 3, freq: 180 }).jobId,
    engine.generateSample({ duration: 3, freq: 300 }).jobId,
    engine.generateSample({ duration: 3, freq: 440 }).jobId,
  ];
  await waitIdle(engine);
  const wall = Date.now() - t0;

  const sampleJobs = engine.jobs.list().filter(j => ids.includes(j.id));
  const allDone = sampleJobs.every(j => j.status === 'done');
  assert(allDone, '3 sample jobs completed (' + sampleJobs.map(j => j.status).join(',') + ')');

  const maxStart = Math.max(...sampleJobs.map(j => j.startedAt));
  const minFinish = Math.min(...sampleJobs.map(j => j.finishedAt));
  const serialSum = sampleJobs.reduce((s, j) => s + (j.finishedAt - j.startedAt), 0);
  assert(maxStart < minFinish, `jobs ran in parallel (overlap window ${minFinish - maxStart}ms; last start before first finish)`);
  console.log(`     wall=${wall}ms vs serial-sum=${serialSum}ms  → ${(serialSum / wall).toFixed(2)}x speedup from parallelism`);

  // --- 2. media present ---
  const media = await engine.dispatch('list_media', {});
  assert(media.length === 3, `media library has 3 items (${media.length})`);

  // --- 3. build timeline ---
  console.log('\n[2] building timeline…');
  for (const m of media) await engine.dispatch('add_clip', { mediaId: m.id });
  let state = engine.state();
  const vClips = state.tracks.find(t => t.kind === 'video').clips.length;
  assert(vClips === 3, `3 clips on the video track (${vClips})`);
  assert(Math.abs(state.duration - 9) < 0.6, `timeline duration ~9s (got ${state.duration}s)`);

  // --- 4. undo / redo ---
  console.log('\n[3] undo/redo…');
  await engine.dispatch('undo', {});
  assert(engine.state().tracks.find(t => t.kind === 'video').clips.length === 2, 'undo removed last clip');
  await engine.dispatch('redo', {});
  assert(engine.state().tracks.find(t => t.kind === 'video').clips.length === 3, 'redo restored it');

  // --- 5. real export ---
  console.log('\n[4] exporting (real ffmpeg render)…');
  const { jobId, out } = engine.exportProject({ name: 'core_test' });
  await waitIdle(engine);
  const exportJob = engine.jobs.get(jobId);
  assert(exportJob.status === 'done', 'export job done (' + exportJob.status + (exportJob.error ? ': ' + exportJob.error : '') + ')');
  assert(fs.existsSync(out), 'output file exists: ' + out);
  if (fs.existsSync(out)) {
    const info = await ff.ffprobe(out);
    assert(Math.abs(info.duration - 9) < 1.0, `exported video duration ~9s (got ${info.duration}s)`);
    assert(info.width === 1280 && info.height === 720, `exported at 1280x720 (${info.width}x${info.height})`);
    console.log('     →', out, `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  }

  console.log('\n== ' + (failures ? failures + ' FAILURE(S) ✗' : 'ALL CORE TESTS PASSED ✓') + ' ==');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('\nTEST CRASHED:', e); process.exit(1); });
