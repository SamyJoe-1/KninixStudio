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
  }

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

  exportProject({ name } = {}) {
    const out = path.join(this.outDir, `${(name || 'export_' + Date.now()).replace(/[^\w.-]/g, '_')}.mp4`);
    const project = this.project;
    const jobId = this.jobs.submit({
      type: 'export',
      label: `Export · ${path.basename(out)}`,
      run: async ({ signal, onProgress }) => {
        await ff.exportTimeline(project, out, { signal, onProgress });
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
      case 'set_filter': { const c = this.project.setClipFilter(p); this._changed(); return c; }

      case 'add_track': { const id = this.project.addTrack(p.kind, p.name); this._changed(); return id; }
      case 'add_clip': { const c = this.project.addClip(p); this._changed(); return c; }
      case 'move_clip': { const c = this.project.moveClip(p); this._changed(); return c; }
      case 'trim_clip': { const c = this.project.trimClip(p); this._changed(); return c; }
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

      case 'export': return this.exportProject(p);
      case 'undo': { const r = this.project.undo(); this._changed(); return r; }
      case 'redo': { const r = this.project.redo(); this._changed(); return r; }

      default: throw new Error('Unknown method: ' + method);
    }
  }
}

module.exports = { Engine };
