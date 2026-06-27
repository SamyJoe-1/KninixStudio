'use strict';
// The Engine is the single source of truth. Both the GUI (via Electron IPC) and the
// MCP server (via the local control HTTP server) funnel every operation through
// engine.dispatch(method, params) — exactly the "one command layer drives UI + AI"
// design from docs/04. It emits:
//   'state' -> serialized project changed (UI re-renders; reflects MCP edits live)
//   'job'   -> a background job updated (progress/cancel/done)

const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { Project } = require('./project');
const { JobManager } = require('./jobManager');
const ff = require('./ffmpeg');

class Engine extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.project = new Project();
    this.jobs = new JobManager({ maxConcurrent: opts.maxConcurrent || 4 });
    this.dataDir = opts.dataDir || path.join(os.tmpdir(), 'Kninix-studio');
    this.thumbDir = path.join(this.dataDir, 'thumbs');
    this.sampleDir = path.join(this.dataDir, 'samples');
    this.proxyDir = path.join(this.dataDir, 'proxies');
    this.outDir = opts.outDir || path.join(this.dataDir, 'exports');
    for (const d of [this.dataDir, this.thumbDir, this.sampleDir, this.proxyDir, this.outDir]) {
      fs.mkdirSync(d, { recursive: true });
    }
    this.jobs.on('update', job => this.emit('job', job));
    this._overlayRenderer = null; // set by main.js after the window opens
  }

  // main.js calls this once the renderer window is ready.
  setOverlayRenderer(fn) { this._overlayRenderer = fn; }

  state() { return this.project.serialize(); }
  _changed() { this.emit('state', this.state()); }

  // Import = probe (await) then attach, plus a background thumbnail job (fire & forget).
  async importMedia(file) {
    if (!file || !fs.existsSync(file)) throw new Error('File not found: ' + file);
    const info = await ff.ffprobe(file);
    const media = this.project.addMedia(info);
    this._changed();
    if (info.hasVideo) {
      const thumb = path.join(this.thumbDir, media.id + '.jpg');
      this.jobs.submit({
        type: 'thumbnail',
        label: `Thumbnail · ${info.name}`,
        run: async ({ signal }) => {
          await ff.makeThumbnail(file, thumb, Math.min(1, (info.duration || 2) / 2), { signal });
          media.thumbnail = thumb;
          this._changed();
          return { thumb };
        },
      });
      // Preview proxy so the editor can play ANY codec (HEVC, 10-bit, etc.).
      const proxy = path.join(this.proxyDir, media.id + '.mp4');
      this.jobs.submit({
        type: 'preview',
        label: `Preview · ${info.name}`,
        run: async ({ signal, onProgress }) => {
          await ff.makeProxy(file, proxy, { signal, onProgress, duration: info.duration });
          media.proxy = proxy;
          this._changed();
          return { proxy };
        },
      });
    }
    return media;
  }

  generateSample({ duration = 5, freq = 220 } = {}) {
    const out = path.join(this.sampleDir, `sample_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`);
    const jobId = this.jobs.submit({
      type: 'sample',
      label: `Generate sample (${duration}s)`,
      run: async ({ signal, onProgress }) => {
        await ff.generateSample(out, { duration, freq, signal, onProgress });
        const media = await this.importMedia(out);
        return { mediaId: media.id, path: out };
      },
    });
    return { jobId, out };
  }

  generateTone({ duration = 8, freq = 330 } = {}) {
    const out = path.join(this.sampleDir, `tone_${Date.now()}_${Math.floor(Math.random() * 1000)}.m4a`);
    const jobId = this.jobs.submit({
      type: 'audio',
      label: `Music tone (${duration}s)`,
      run: async ({ signal, onProgress }) => {
        await ff.generateTone(out, { duration, freq, signal, onProgress });
        const media = await this.importMedia(out);
        return { mediaId: media.id, path: out };
      },
    });
    return { jobId, out };
  }

  saveProjectFile(file) {
    if (!file) throw new Error('No project file selected.');
    const out = file.endsWith('.knx') ? file : file + '.knx';
    fs.writeFileSync(out, JSON.stringify(this.project.exportData(), null, 2), 'utf8');
    return { path: out };
  }

  loadProjectFile(file) {
    if (!file || !fs.existsSync(file)) throw new Error('Project file not found: ' + file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const project = data.project || data;
    this.project.loadSerialized(project);
    this._changed();
    return Object.assign(this.state(), { repaired: this.project._lastRepaired || 0 });
  }

  // Returns the single clip iff the export is a PURE TRIM (so it can be stream-copied
  // losslessly), else null. Conservative on purpose: any real edit disqualifies it.
  _pureTrimClip(outW, outH, exportFps) {
    const project = this.project;
    if ((project.objects || []).some(o => !o.hidden)) return null;     // overlays/captions → render
    const clips = [];
    for (const t of (project.tracks || [])) for (const c of (t.clips || [])) clips.push(c);
    if (clips.length !== 1) return null;
    const c = clips[0];
    const m = project.media[c.mediaId];
    if (!m || m.isImage || !m.hasVideo) return null;
    if ((c.timelineIn || 0) > 0.001) return null;                     // leading gap → render
    if ((c.speed || 1) !== 1) return null;                            // speed change → render
    if (c.filter && c.filter !== 'none') return null;                 // color filter → render
    if (c.transIn && c.transIn.type && c.transIn.type !== 'none') return null;
    if (c.transOut && c.transOut.type && c.transOut.type !== 'none') return null;
    if (outW !== m.width || outH !== m.height) return null;            // resize → render
    if (m.fps && Math.abs(exportFps - m.fps) > 0.5) return null;       // fps change → render
    const r = c.rect;                                                  // crop/reposition → render
    if (r && (Math.round(r.x) !== 0 || Math.round(r.y) !== 0 || Math.round(r.w) !== m.width || Math.round(r.h) !== m.height)) return null;
    return c;
  }

  exportProject({ outPath, fps, quality, name } = {}) {
    // Compute actual output dimensions from quality preset (preserves project aspect ratio).
    const res = this.project.resolution || {};
    const projW = res.w || 1280, projH = res.h || 720;
    const QUALITY_HEIGHTS = { 480: 480, 720: 720, 1080: 1080, 1440: 1440, 2160: 2160 };
    let outW = projW, outH = projH;
    if (quality && QUALITY_HEIGHTS[quality]) {
      const tH = QUALITY_HEIGHTS[quality];
      const scale = tH / projH;
      outW = Math.round(projW * scale);
      outH = tH;
      if (outW % 2) outW++;
      if (outH % 2) outH++;
    }

    const exportFps = Math.min(120, Math.max(12, parseInt(fps) || 30));

    // Resolve the output path. Custom path directories are created on demand.
    let out;
    if (outPath && outPath.trim()) {
      out = outPath.trim();
      fs.mkdirSync(path.dirname(out), { recursive: true });
    } else {
      out = path.join(this.outDir, `${(name || 'export_' + Date.now()).replace(/[^\w.-]/g, '_')}.mp4`);
    }

    const project = this.project;
    const overlayRenderer = this._overlayRenderer;
    const jobId = this.jobs.submit({
      type: 'export',
      label: `Export · ${path.basename(out)}`,
      run: async ({ signal, onProgress }) => {
        // LOSSLESS PATH: if the only edit is a cut (single full-frame clip, no overlays,
        // no fx, same resolution & fps as the source), copy the original video stream
        // through untouched — bit-identical quality, near-instant. Anything the user
        // actually changed (caption, resize, fps, crop, speed) falls through to a render.
        const trim = this._pureTrimClip(outW, outH, exportFps);
        if (trim) {
          const media = project.media[trim.mediaId];
          onProgress(0, 'Copying (lossless cut)…');
          await ff.exportTrimCopy(media.path, out, {
            sourceIn: trim.sourceIn, sourceOut: trim.sourceOut, signal,
            onProgress: (frac) => onProgress(frac || 0, 'Copying (lossless cut)… ' + Math.round((frac || 0) * 100) + '%'),
          });
          return { out, lossless: true };
        }

        let overlay = null;
        const objects = (project.objects || []).filter(o => !o.hidden);
        let total = 0;
        for (const t of (project.tracks || [])) for (const c of (t.clips || [])) total = Math.max(total, c.timelineOut || 0);
        for (const o of objects) total = Math.max(total, o.end || 0);
        total = +total.toFixed(3);

        // Each phase reports its own 0→1 progress independently — the bar resets
        // between phases so users see two clean sweeps instead of a split bar.
        const useOverlay = !!(overlayRenderer && objects.length && total > 0);

        if (useOverlay) {
          // Cap overlay rasterisation at 30fps. Captions and text are smooth at 30fps;
          // FFmpeg's fps filter holds/duplicates frames for higher output frame rates.
          // This prevents 100fps exports from rasterising 500 frames instead of 150.
          const overlayFps = Math.min(exportFps, 30);
          onProgress(0, 'Rendering captions… 0%');
          try {
            const r = await overlayRenderer({
              fps: overlayFps, total,
              onProgress: (frac) => onProgress(frac, 'Rendering captions… ' + Math.round(frac * 100) + '%'),
            });
            if (r && r.frames && r.frames.length) overlay = r;
          } catch (e) {
            console.warn('[export] overlay renderer failed, using FFmpeg fallback:', e.message);
          }
        }

        // Reset to 0 so phase 2 starts a fresh sweep.
        onProgress(0, 'Encoding video… 0%');

        await ff.exportTimeline(project, out, {
          signal, overlay, fps: exportFps, outW, outH,
          onProgress: (frac) => onProgress(frac || 0, 'Encoding video… ' + Math.round((frac || 0) * 100) + '%'),
        });
        return { out };
      },
    });
    return { jobId, out };
  }

  // The unified command surface used by IPC (GUI) and HTTP (MCP).
  async dispatch(method, params = {}) {
    const p = params || {};
    switch (method) {
      case 'get_state': return this.state();
      case 'list_media': return Object.values(this.project.media);
      case 'list_jobs': return this.jobs.list();
      case 'cancel_job': return this.jobs.cancel(p.jobId);
      case 'clear_jobs': this.jobs.clearFinished(); return true;

      case 'import_media': return await this.importMedia(p.path);
      case 'generate_sample': return this.generateSample(p);
      case 'generate_tone': return this.generateTone(p);
      case 'save_project': return this.saveProjectFile(p.path);
      case 'load_project': return this.loadProjectFile(p.path);
      case 'set_filter': { const c = this.project.setClipFilter(p); this._changed(); return c; }

      case 'add_track': { const id = this.project.addTrack(p.kind, p.name); this._changed(); return id; }
      case 'add_clip': { const c = this.project.addClip(p); this._changed(); return c; }
      case 'move_clip': { const c = this.project.moveClip(p); this._changed(); return c; }
      case 'trim_clip': { const c = this.project.trimClip(p); this._changed(); return c; }
      case 'update_clip': { const c = this.project.updateClip(p); this._changed(); return c; }
      case 'split_clip': { const r = this.project.splitClip(p); this._changed(); return r; }
      case 'remove_clip': { const r = this.project.removeClip(p); this._changed(); return r; }
      case 'add_object': { const o = this.project.addObject(p); this._changed(); return o; }
      case 'add_widget': { const o = this.project.addObject(Object.assign({}, p, { type: 'widget' })); this._changed(); return o; }
      case 'update_object': { const o = this.project.updateObject(p); this._changed(); return o; }
      case 'reorder_object': { const r = this.project.reorderObject(p); this._changed(); return r; }
      case 'remove_object': { const r = this.project.removeObject(p); this._changed(); return r; }
      case 'set_clip_transition': { const c = this.project.setClipTransition(p); this._changed(); return c; }

      case 'add_marker': { const m = this.project.addMarker(p); this._changed(); return m; }
      case 'set_playhead': { const t = this.project.setPlayhead(p.at); this._changed(); return t; }
      case 'set_resolution': { const r = this.project.setResolution(p); this._changed(); return r; }

      case 'export': return this.exportProject(p);
      case 'undo': { const r = this.project.undo(); this._changed(); return r; }
      case 'redo': { const r = this.project.redo(); this._changed(); return r; }

      default: throw new Error('Unknown method: ' + method);
    }
  }
}

module.exports = { Engine };
