'use strict';
// Thin wrappers around the ffmpeg / ffprobe executables. Each call is its OWN OS
// process (child_process.spawn), so CPU-heavy media work runs fully parallel to the
// UI and to every other job. Progress is parsed from `-progress pipe:1`. Cancellation
// kills the child process via an AbortSignal.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const FFMPEG = process.env.KX_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.KX_FFPROBE || 'ffprobe';

function run(cmd, args, { signal, onLine } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) { return reject(e); }

    let stderr = '';
    let stdout = '';

    if (signal) {
      if (signal.aborted) { try { child.kill('SIGKILL'); } catch (_) {} return reject(new Error('aborted')); }
      const onAbort = () => { try { child.kill('SIGKILL'); } catch (_) {} };
      signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout.on('data', d => {
      const s = d.toString();
      stdout += s;
      if (onLine) for (const l of s.split(/\r?\n/)) if (l) onLine(l, 'out');
    });
    child.stderr.on('data', d => {
      const s = d.toString();
      stderr += s;
      if (onLine) for (const l of s.split(/\r?\n/)) if (l) onLine(l, 'err');
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(String(cmd))} exited ${code}: ${stderr.slice(-600)}`));
    });
  });
}

async function ffprobe(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file,
  ]);
  const info = JSON.parse(stdout);
  const streams = info.streams || [];
  const v = streams.find(s => s.codec_type === 'video');
  const a = streams.find(s => s.codec_type === 'audio');
  const duration =
    parseFloat(info.format && info.format.duration) ||
    (v && parseFloat(v.duration)) ||
    (a && parseFloat(a.duration)) || 0;
  let fps = 30;
  if (v && v.r_frame_rate && v.r_frame_rate.includes('/')) {
    const [n, d] = v.r_frame_rate.split('/').map(Number);
    if (d) fps = +(n / d).toFixed(3);
  }
  return {
    path: file,
    name: path.basename(file),
    duration: +Number(duration).toFixed(3),
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    fps,
    hasVideo: !!v,
    hasAudio: !!a,
    kind: v ? 'video' : (a ? 'audio' : 'video'),
  };
}

// Build a parser for ffmpeg's `-progress pipe:1` key=value stream.
function progressParser(totalSec, onProgress) {
  return (line) => {
    const m = /out_time_ms=(\d+)/.exec(line);
    if (m && totalSec > 0) {
      const sec = parseInt(m[1], 10) / 1e6;
      onProgress(sec / totalSec, `${sec.toFixed(1)}s / ${totalSec.toFixed(1)}s`);
    } else if (/^progress=end/.test(line)) {
      onProgress(1);
    }
  };
}

async function makeThumbnail(file, outPath, atSec, { signal } = {}) {
  await run(FFMPEG, [
    '-y', '-ss', String(Math.max(0, atSec || 0)), '-i', file,
    '-frames:v', '1', '-vf', 'scale=320:-1', outPath,
  ], { signal });
  return outPath;
}

// Synthetic clip generator (testsrc + sine tone). Lets the app be demoed with zero
// user footage, and each generation is a real background job/process.
async function generateSample(outPath, { duration = 5, freq = 220, signal, onProgress } = {}) {
  const args = [
    '-y',
    '-f', 'lavfi', '-i', `testsrc=size=1280x720:rate=30:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${duration}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-shortest',
    '-progress', 'pipe:1', '-nostats',
    outPath,
  ];
  await run(FFMPEG, args, { signal, onLine: onProgress ? progressParser(duration, onProgress) : null });
  return outPath;
}

// --- smart analysis (real, ffmpeg-based) ---

// Detect silent ranges (in source seconds) via the silencedetect filter.
async function detectSilence(file, { noise = '-30dB', minDur = 0.4, signal } = {}) {
  const { stderr } = await run(FFMPEG, ['-i', file, '-af', `silencedetect=noise=${noise}:d=${minDur}`, '-f', 'null', '-'], { signal });
  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map(m => Math.max(0, parseFloat(m[1])));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => parseFloat(m[1]));
  const ranges = [];
  for (let i = 0; i < starts.length; i++) ranges.push({ start: starts[i], end: ends[i] != null ? ends[i] : Infinity });
  return ranges;
}

// Detect scene-cut timestamps (source seconds) via the scene score.
async function detectScenes(file, { threshold = 0.4, signal } = {}) {
  const { stderr } = await run(FFMPEG, ['-i', file, '-filter_complex', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { signal });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map(m => parseFloat(m[1]));
}

// Extract a downsampled peak envelope (0..1) for waveform display.
function extractPeaks(file, n = 240, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn(FFMPEG, ['-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { windowsHide: true }); }
    catch (e) { return reject(e); }
    const chunks = []; let err = '';
    if (signal) { if (signal.aborted) { child.kill('SIGKILL'); return reject(new Error('aborted')); }
      signal.addEventListener('abort', () => { try { child.kill('SIGKILL'); } catch (_) {} }, { once: true }); }
    child.stdout.on('data', c => chunks.push(c));
    child.stderr.on('data', c => (err += c.toString()));
    child.on('error', reject);
    child.on('close', () => {
      const buf = Buffer.concat(chunks);
      if (buf.length < 2) return resolve([]); // no audio
      const samples = Math.floor(buf.length / 2), per = Math.max(1, Math.floor(samples / n)), peaks = new Array(n).fill(0);
      for (let i = 0; i < n; i++) { let mx = 0; const base = i * per;
        for (let j = 0; j < per; j++) { const idx = (base + j) * 2; if (idx + 1 < buf.length) { const v = Math.abs(buf.readInt16LE(idx)); if (v > mx) mx = v; } }
        peaks[i] = +(mx / 32768).toFixed(3); }
      resolve(peaks);
    });
  });
}

function clampTempo(s) { return Math.max(0.5, Math.min(2, s)); }

// Export the primary video track honoring per-clip speed + loudness-normalize, scaling
// to the project resolution, then concat. Real edits => these show up in the file.
async function exportTimeline(project, outPath, { signal, onProgress } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kx-export-'));
  try {
    const W = (project.resolution && project.resolution.w) || 1280;
    const H = (project.resolution && project.resolution.h) || 720;
    const vtrack = (project.tracks || []).find(t => t.kind === 'video');
    const clips = vtrack ? [...vtrack.clips].sort((a, b) => a.timelineIn - b.timelineIn) : [];
    if (!clips.length) throw new Error('Timeline has no video clips to export.');

    const totalSec = clips.reduce((s, c) => s + (c.sourceOut - c.sourceIn) / (c.speed || 1), 0);
    let doneSec = 0;
    const segPaths = [];

    for (let i = 0; i < clips.length; i++) {
      if (signal && signal.aborted) throw new Error('aborted');
      const c = clips[i];
      const media = project.media[c.mediaId];
      if (!media) throw new Error('Missing media for clip ' + c.id);
      const speed = c.speed || 1;
      const outDur = (c.sourceOut - c.sourceIn) / speed;
      const seg = path.join(work, `seg_${i}.mp4`);
      segPaths.push(seg);

      const args = ['-y', '-ss', String(c.sourceIn), '-to', String(c.sourceOut), '-i', media.path];
      let vf = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;
      if (speed !== 1) vf += `,setpts=PTS/${speed}`;
      let af = '';
      if (speed !== 1) af += `atempo=${clampTempo(speed)}`;
      if (c.normalize) af += (af ? ',' : '') + 'loudnorm';

      if (!media.hasAudio) {
        args.push('-f', 'lavfi', '-t', String(outDur), '-i', 'anullsrc=r=44100:cl=stereo');
        args.push('-map', '0:v:0', '-map', '1:a:0');
      } else {
        args.push('-map', '0:v:0', '-map', '0:a:0');
      }
      args.push('-vf', vf);
      if (af && media.hasAudio) args.push('-af', af);
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-progress', 'pipe:1', '-nostats', seg);

      const base = doneSec;
      await run(FFMPEG, args, { signal, onLine: progressParser(outDur, (p) => { if (onProgress) onProgress((base + p * outDur) / totalSec, `clip ${i + 1}/${clips.length}`); }) });
      doneSec += outDur;
    }

    const listFile = path.join(work, 'list.txt');
    fs.writeFileSync(listFile, segPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
    await run(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outPath], { signal });
    if (onProgress) onProgress(1, 'done');
    return outPath;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (_) {}
  }
}

// Preview proxy: transcode ANY source to a browser-friendly H.264/yuv420p + AAC mp4 so
// the <video> preview can play it (fixes HEVC/10-bit/odd-codec files showing audio only).
async function makeProxy(file, outPath, { signal, onProgress, duration = 0 } = {}) {
  const args = [
    '-y', '-i', file,
    '-vf', "scale='min(1280,iw)':-2,format=yuv420p",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    outPath,
  ];
  await run(FFMPEG, args, { signal, onLine: onProgress ? progressParser(duration || 1, onProgress) : null });
  return outPath;
}

// Audio-only tone (for the Audio/Music section), imported as an audio media item.
async function generateTone(outPath, { duration = 8, freq = 330, signal, onProgress } = {}) {
  const args = [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${duration}`,
    '-c:a', 'aac', '-b:a', '160k',
    '-progress', 'pipe:1', '-nostats',
    outPath,
  ];
  await run(FFMPEG, args, { signal, onLine: onProgress ? progressParser(duration, onProgress) : null });
  return outPath;
}

module.exports = { run, ffprobe, makeThumbnail, generateSample, makeProxy, generateTone, exportTimeline, FFMPEG, FFPROBE };
