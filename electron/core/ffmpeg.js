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
  // A still image: a video stream but no real timebase (no format duration, no audio).
  // Also catch it by extension so PNG/JPG/etc. are always treated as stills.
  const byExt = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(file);
  const isImage = !!v && !a && (byExt || !(duration > 0));
  // Stills have no intrinsic length — give them a default 5s block (Camtasia-style),
  // freely extendable on the timeline (trimClip lets images grow past this).
  const IMAGE_DEFAULT = 5;
  return {
    path: file,
    name: path.basename(file),
    duration: +Number(isImage ? IMAGE_DEFAULT : duration).toFixed(3),
    width: v ? v.width : 0,
    height: v ? v.height : 0,
    fps,
    hasVideo: !!v,
    hasAudio: !!a,
    isImage,
    kind: isImage ? 'image' : (v ? 'video' : (a ? 'audio' : 'video')),
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

function escText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/\r?\n/g, ' ');
}

function colorHex(c, fallback = 'FFFFFF') {
  const m = /^#?([0-9a-f]{6})/i.exec(String(c || ''));
  return '0x' + (m ? m[1] : fallback);
}

// Camtasia-style timeline compositor. ONE ffmpeg pass:
//   * a black canvas spanning 0 -> total timeline length (gaps render as black),
//   * every clip on EVERY track placed at its ABSOLUTE timelineIn (not concatenated),
//   * higher tracks overlaid on top of lower ones,
//   * stills looped for their on-timeline block length, videos trimmed to source in/out,
//   * each clip's audio delayed to its start time and mixed over a silent bed.
// Result: total duration = end of the last clip (NOT the sum), and "image at 4s for 10s
// on track 2 with track 1 empty" exports a 14s video that is black 0->4 then the image.
async function exportTimeline(project, outPath, { signal, onProgress, overlay } = {}) {
  const W = (project.resolution && project.resolution.w) || 1280;
  const H = (project.resolution && project.resolution.h) || 720;
  const tracks = project.tracks || [];
  const topId = tracks.length ? tracks[tracks.length - 1].id : null;

  // Gather clips from every track. Track array order = stack order: index 0 is the
  // bottom track, later tracks composite on top (matches the editor's drawOverlay).
  const comp = [];
  tracks.forEach((t, ti) => { for (const c of (t.clips || [])) {
    const media = project.media[c.mediaId];
    if (media) comp.push({ c, media, ti });
  }});
  const objects = [];
  tracks.forEach((t, ti) => {
    for (const o of (project.objects || [])) {
      if (o.hidden) continue;
      if (o.trackId === t.id || (t.id === topId && !o.trackId)) objects.push({ o, ti });
    }
  });
  if (!comp.length && !objects.length) throw new Error('Timeline is empty — add at least one 1-second item before exporting.');
  comp.sort((a, b) => (a.ti - b.ti) || (a.c.timelineIn - b.c.timelineIn));
  objects.sort((a, b) => (a.ti - b.ti));

  // Total = end of the LAST clip on the timeline (gaps included), never the sum of clips.
  const total = +Math.max(
    project.duration ? project.duration() : 0,
    ...comp.map(x => x.c.timelineOut),
    ...objects.map(x => x.o.end || 0)
  ).toFixed(3);
  if (total <= 0) throw new Error('Timeline has zero length.');

  const args = ['-y'];
  // input 0: black canvas for the whole duration.
  args.push('-f', 'lavfi', '-t', String(total), '-i', `color=c=black:s=${W}x${H}:r=30`);
  // inputs 1..N: one per clip (stills looped, videos trimmed by source in/out).
  comp.forEach(({ c, media }) => {
    if (media.isImage) {
      const blockDur = +(c.timelineOut - c.timelineIn).toFixed(3);
      args.push('-loop', '1', '-t', String(Math.max(0.04, blockDur)), '-i', media.path);
    } else {
      args.push('-ss', String(c.sourceIn), '-to', String(c.sourceOut), '-i', media.path);
    }
  });
  // last input: a silent stereo bed spanning the whole timeline (so the mux always has audio).
  const silenceIdx = comp.length + 1;
  args.push('-f', 'lavfi', '-t', String(total), '-i', 'anullsrc=r=44100:cl=stereo');

  const fc = [];
  fc.push(`[0:v]fps=30,format=yuv420p[base]`);
  let last = 'base';
  const audioLabels = [];

  comp.forEach(({ c, media }, k) => {
    const idx = k + 1;
    const rect = c.rect || { x: 0, y: 0, w: W, h: H };
    const rw = Math.max(2, Math.round(rect.w)), rh = Math.max(2, Math.round(rect.h));
    const rx = Math.round(rect.x), ry = Math.round(rect.y);
    const speed = c.speed || 1;
    const tin = +c.timelineIn.toFixed(3), tout = +c.timelineOut.toFixed(3);
    if (media.hasVideo) {
      const shift = speed !== 1 ? `(PTS-STARTPTS)/${speed}+${tin}/TB` : `PTS-STARTPTS+${tin}/TB`;
      fc.push(
        `[${idx}:v]scale=${rw}:${rh}:force_original_aspect_ratio=increase,` +
        `crop=${rw}:${rh},setsar=1,fps=30,format=yuva420p,setpts=${shift}[cv${k}]`
      );
      fc.push(
        `[${last}][cv${k}]overlay=x=${rx}:y=${ry}:eof_action=pass:` +
        `enable='between(t,${tin},${tout})'[ov${k}]`
      );
      last = `ov${k}`;
    }
    if (media.hasAudio) {
      const ms = Math.max(0, Math.round(tin * 1000));
      let a = `[${idx}:a]aresample=44100`;
      if (speed !== 1) a += `,atempo=${clampTempo(speed)}`;
      if (c.normalize) a += `,loudnorm`;
      a += `,adelay=${ms}|${ms}[ca${k}]`;
      fc.push(a);
      audioLabels.push(`[ca${k}]`);
    }
  });

  let ovTmpDir = null;
  if (overlay && overlay.frames && overlay.frames.length) {
    // ── PNG overlay path: pixel-perfect, identical to the editor preview ────
    // Write the renderer's frames as a numbered sequence and read them back as a
    // constant-fps RGBA video, then composite over the video at 0,0.
    const ovFps = overlay.fps || 12;
    ovTmpDir = path.join(os.tmpdir(), `kx_ov_${Date.now()}`);
    fs.mkdirSync(ovTmpDir, { recursive: true });
    overlay.frames.forEach((f, i) => {
      fs.writeFileSync(path.join(ovTmpDir, `f${i}.png`), Buffer.from(f));
    });
    const ovIdx = silenceIdx + 1;
    args.push('-framerate', String(ovFps), '-start_number', '0',
              '-i', path.join(ovTmpDir, 'f%d.png'));
    // Stretch the overlay timeline to 30fps and hold the last frame to the end.
    fc.push(`[${ovIdx}:v]format=rgba,fps=30,setpts=PTS-STARTPTS[ovfmt]`);
    fc.push(`[${last}][ovfmt]overlay=0:0:format=auto:eof_action=repeat,format=yuv420p[vout]`);
  } else {
    // ── FFmpeg-filter fallback (no renderer, or no objects) ─────────────────
    objects.forEach(({ o }, k) => {
      const out = `obj${k}`;
      const x = Math.round(o.x || 0), y = Math.round(o.y || 0);
      const w = Math.max(2, Math.round(o.w || 2)), h = Math.max(2, Math.round(o.h || 2));
      const start = +Number(o.start || 0).toFixed(3);
      const end   = +Number(o.end || (start + 3)).toFixed(3);
      const enable = `enable='between(t,${start},${end})'`;
      if (o.type === 'text') {
        const fs = Math.max(8, Math.round(o.fontSize || 72));
        const alignX = o.align === 'left' ? x : (o.align === 'right' ? `${x+w}-text_w` : `${x}+((${w}-text_w)/2)`);
        fc.push(`[${last}]drawtext=text='${escText(o.text)}':x=${alignX}:y=${y}:fontsize=${fs}:fontcolor=${colorHex(o.color)}:${enable}[${out}]`);
      } else if (o.type === 'caption') {
        // Simplified fallback: full caption text with stroke+shadow, no word animation
        const fs = Math.max(8, Math.round(o.fontSize || 88));
        const cx  = `${x}+((${w}-text_w)/2)`;
        const bw  = Math.round(o.strokeWidth || 7);
        const bc  = colorHex(o.strokeColor || '#000000', '000000');
        const sx  = Math.round(o.shadowOffsetX || 2), sy = Math.round(o.shadowOffsetY || 3);
        const sc  = colorHex(o.shadowColor || '#000000', '000000');
        fc.push(`[${last}]drawtext=text='${escText(o.text)}':x=${cx}:y=${y}:fontsize=${fs}:fontcolor=${colorHex(o.color)}:borderw=${bw}:bordercolor=${bc}:shadowx=${sx}:shadowy=${sy}:shadowcolor=${sc}:${enable}[${out}]`);
      } else if (o.type === 'widget') {
        const text = escText(o.title || o.widget || '');
        const fs = Math.max(8, Math.round(o.fontSize || 48));
        fc.push(`[${last}]drawtext=text='${text}':x=${x}+((${w}-text_w)/2):y=${y}+((${h}-text_h)/2):fontsize=${fs}:fontcolor=${colorHex(o.color)}:${enable}[${out}]`);
      } else {
        fc.push(`[${last}]drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${colorHex(o.color,'6C5CE7')}@${o.opacity!=null?o.opacity:1}:t=fill:${enable}[${out}]`);
      }
      last = out;
    });
    fc.push(`[${last}]format=yuv420p[vout]`);
  }
  let aout;
  if (audioLabels.length) {
    fc.push(`[${silenceIdx}:a]${audioLabels.join('')}amix=inputs=${audioLabels.length + 1}:normalize=0:dropout_transition=0[aout]`);
    aout = '[aout]';
  } else {
    aout = `${silenceIdx}:a`;
  }

  args.push('-filter_complex', fc.join(';'));
  args.push('-map', '[vout]', '-map', aout, '-t', String(total));
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-ar', '44100', '-ac', '2',
            '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outPath);

  try {
    await run(FFMPEG, args, { signal, onLine: onProgress ? progressParser(total, onProgress) : null });
  } finally {
    // Clean up temp overlay PNGs regardless of success/failure.
    if (ovTmpDir) try { fs.rmSync(ovTmpDir, { recursive: true, force: true }); } catch (_) {}
  }
  if (onProgress) onProgress(1, 'done');
  return outPath;
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
