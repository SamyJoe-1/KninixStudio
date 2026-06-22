'use strict';
// Project / timeline model + command core with snapshot-based undo/redo.
// Pure Node, no Electron — so it is unit-testable headlessly.
// Holds: media, tracks/clips, and canvas OBJECTS (text / shapes / stickers).

const crypto = require('crypto');

function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(5).toString('hex');
}

class Project {
  constructor() {
    this.name = 'Untitled';
    this.resolution = { w: 1280, h: 720 };
    this.fps = 30;
    this.media = {}; // id -> media object
    // Generic, numbered tracks (Camtasia-style). Array order = stack order: the LAST
    // track is the front-most (drawn on top). `kind` is kept internal only so the
    // exporter/tests can still find a base video track — the UI just shows "Track N".
    this.tracks = [
      { id: 'trk_1', kind: 'video', name: 'Track 1', clips: [] },
    ];
    this.objects = []; // canvas overlays: { id, type:text|rect|ellipse, x,y,w,h, ... , start,end }
    this.markers = [];
    this.playhead = 0;
    this._undo = [];
    this._redo = [];
  }

  // ---- serialization ----
  serialize() {
    return {
      name: this.name,
      resolution: this.resolution,
      fps: this.fps,
      media: this.media,
      tracks: this.tracks,
      objects: this.objects,
      markers: this.markers,
      playhead: this.playhead,
      duration: this.duration(),
      canUndo: this._undo.length > 0,
      canRedo: this._redo.length > 0,
    };
  }

  duration() {
    let max = 0;
    for (const t of this.tracks) for (const c of t.clips) max = Math.max(max, c.timelineOut);
    for (const o of this.objects) max = Math.max(max, o.end || 0);
    return +max.toFixed(3);
  }

  // ---- undo/redo (snapshot based; simple + reliable for an MVP) ----
  _snapshot() {
    return JSON.stringify({
      name: this.name, resolution: this.resolution, fps: this.fps,
      media: this.media, tracks: this.tracks, objects: this.objects,
      markers: this.markers, playhead: this.playhead,
    });
  }
  _restore(s) {
    const o = JSON.parse(s);
    this.name = o.name; this.resolution = o.resolution; this.fps = o.fps;
    this.media = o.media; this.tracks = o.tracks; this.objects = o.objects || [];
    this.markers = o.markers; this.playhead = o.playhead;
  }
  _checkpoint() {
    this._undo.push(this._snapshot());
    if (this._undo.length > 200) this._undo.shift();
    this._redo.length = 0;
  }
  undo() {
    if (!this._undo.length) return false;
    this._redo.push(this._snapshot());
    this._restore(this._undo.pop());
    return true;
  }
  redo() {
    if (!this._redo.length) return false;
    this._undo.push(this._snapshot());
    this._restore(this._redo.pop());
    return true;
  }

  // ---- media (added by the engine after probing) ----
  addMedia(m) {
    const id = uid('med');
    this.media[id] = Object.assign({ id }, m);
    return this.media[id];
  }

  // ---- timeline commands ----
  track(id) { return this.tracks.find(t => t.id === id); }

  addTrack(kind, name) {
    this._checkpoint();
    const id = uid('trk');
    // Generic numbered track added on top of the stack.
    this.tracks.push({ id, kind: kind || 'video', name: name || `Track ${this.tracks.length + 1}`, clips: [] });
    return id;
  }

  _appendPoint(track) {
    let end = 0;
    for (const c of track.clips) end = Math.max(end, c.timelineOut);
    return end;
  }

  addClip({ mediaId, trackId, at } = {}) {
    const media = this.media[mediaId];
    if (!media) throw new Error('No such media: ' + mediaId);
    let track = trackId ? this.track(trackId) : this.tracks.find(t => t.kind === (media.kind || 'video'));
    if (!track) track = this.tracks[0];
    this._checkpoint();
    const dur = media.duration || 5;
    const start = (at != null) ? Math.max(0, at) : this._appendPoint(track);
    const clip = {
      id: uid('clp'),
      mediaId,
      name: media.name,
      timelineIn: +start.toFixed(3),
      timelineOut: +(start + dur).toFixed(3),
      sourceIn: 0,
      sourceOut: +dur.toFixed(3),
      // canvas placement (export-pixel space). Default = fill the whole export frame.
      rect: { x: 0, y: 0, w: this.resolution.w, h: this.resolution.h },
      opacity: 1,
    };
    track.clips.push(clip);
    track.clips.sort((a, b) => a.timelineIn - b.timelineIn);
    return clip;
  }

  findClip(clipId) {
    for (const t of this.tracks) {
      const c = t.clips.find(c => c.id === clipId);
      if (c) return { track: t, clip: c };
    }
    return null;
  }

  moveClip({ clipId, at } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    const len = f.clip.timelineOut - f.clip.timelineIn;
    f.clip.timelineIn = +Math.max(0, at).toFixed(3);
    f.clip.timelineOut = +(f.clip.timelineIn + len).toFixed(3);
    f.track.clips.sort((a, b) => a.timelineIn - b.timelineIn);
    return f.clip;
  }

  trimClip({ clipId, sourceIn, sourceOut } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    const media = this.media[f.clip.mediaId];
    // Stills have no real length — they can be stretched to any duration on the timeline.
    const maxDur = (media && !media.isImage) ? media.duration : Infinity;
    const si = Math.max(0, sourceIn != null ? sourceIn : f.clip.sourceIn);
    const so = Math.min(maxDur, sourceOut != null ? sourceOut : f.clip.sourceOut);
    if (so <= si) throw new Error('Invalid trim (out <= in)');
    f.clip.sourceIn = +si.toFixed(3);
    f.clip.sourceOut = +so.toFixed(3);
    f.clip.timelineOut = +(f.clip.timelineIn + (so - si)).toFixed(3);
    return f.clip;
  }

  splitClip({ clipId, at } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    const c = f.clip;
    if (at <= c.timelineIn + 0.05 || at >= c.timelineOut - 0.05) throw new Error('Split point is not inside the clip');
    this._checkpoint();
    const splitSource = c.sourceIn + (at - c.timelineIn);
    const second = {
      id: uid('clp'), mediaId: c.mediaId, name: c.name,
      timelineIn: +at.toFixed(3), timelineOut: c.timelineOut,
      sourceIn: +splitSource.toFixed(3), sourceOut: c.sourceOut,
      rect: Object.assign({ x: 0, y: 0, w: this.resolution.w, h: this.resolution.h }, c.rect),
      opacity: c.opacity != null ? c.opacity : 1,
    };
    c.timelineOut = +at.toFixed(3);
    c.sourceOut = +splitSource.toFixed(3);
    f.track.clips.push(second);
    f.track.clips.sort((a, b) => a.timelineIn - b.timelineIn);
    return [c.id, second.id];
  }

  removeClip({ clipId } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    f.track.clips = f.track.clips.filter(c => c.id !== clipId);
    return true;
  }

  // ---- canvas object commands (text / shapes / stickers) ----
  // type 'text'  -> { text, fontSize, color, align }
  // anything else -> a shape; the shape kind lives in `shape`
  //   (rect, roundrect, ellipse, triangle, diamond, star, pentagon, hexagon, heart, arrow, line, ring)
  addObject({ type = 'text', shape, widget, x, y, w, h, text, subtitle, color, fontSize, start, end, align, radius, trackId } = {}) {
    this._checkpoint();
    const W = this.resolution.w, H = this.resolution.h;
    const common = {
      id: uid('obj'), opacity: 1, rotation: 0, hidden: false, locked: false,
      trackId: trackId || null,   // which numbered track this overlay lives on
      animIn: { type: 'none', dur: 0.5 }, animOut: { type: 'none', dur: 0.5 },
      // Non-AV elements (text/shape/emoji/widget) are MEDIA too — they get a short
      // 3s default block on the timeline (NOT the whole video), freely resizable.
      start: start != null ? start : 0,
      end: end != null ? end : (start != null ? start : 0) + 3,
    };
    let obj;
    if (type === 'text') {
      obj = Object.assign(common, {
        type: 'text', x: W * 0.18, y: H * 0.40, w: W * 0.64, h: 150,
        text: text || 'Double-click to edit', color: color || '#FFFFFF',
        fontSize: fontSize || 72, align: align || 'center',
      });
    } else if (type === 'widget') {
      const wk = widget || 'lowerthird';
      const presets = {
        lowerthird:  { x: 90, y: H - 230, w: 780, h: 140, color: '#6C5CE7', title: text || 'Lower Third', subtitle: subtitle || 'subtitle here', fontSize: 46 },
        progressbar: { x: 140, y: H - 90, w: W - 280, h: 26, color: '#36C5F0' },
        timer:       { x: W * 0.5 - 170, y: 110, w: 340, h: 170, color: '#FFFFFF', fontSize: 130 },
        badge:       { x: 80, y: 80, w: 320, h: 92, color: '#F5A524', title: text || 'NEW', fontSize: 48 },
        titlecard:   { x: W * 0.5 - 390, y: H * 0.5 - 130, w: 780, h: 260, color: '#FFFFFF', title: text || 'TITLE', subtitle: subtitle || 'your subtitle', fontSize: 104 },
        bars:        { x: W - 360, y: H - 200, w: 280, h: 150, color: '#2BD9A8' },
      };
      obj = Object.assign(common, { type: 'widget', widget: wk }, presets[wk] || presets.lowerthird);
      obj.animIn = { type: 'slideUp', dur: 0.5 };   // widgets get a tasteful default entrance
      obj.animOut = { type: 'fade', dur: 0.4 };
    } else {
      obj = Object.assign(common, {
        type: 'shape', shape: shape || type, x: W * 0.38, y: H * 0.32, w: 320, h: 320,
        color: color || '#6C5CE7', radius: radius != null ? radius : 32,
      });
    }
    if (x != null) obj.x = x; if (y != null) obj.y = y;
    if (w != null) obj.w = w; if (h != null) obj.h = h;
    if (color != null) obj.color = color;
    if (text != null && obj.type === 'text') obj.text = text;
    this.objects.push(obj);
    return obj;
  }

  // z-order: array order = paint order (later = on top)
  reorderObject({ id, dir } = {}) {
    const i = this.objects.findIndex(o => o.id === id);
    if (i < 0) throw new Error('No such object: ' + id);
    this._checkpoint();
    const [o] = this.objects.splice(i, 1);
    if (dir === 'front') this.objects.push(o);
    else if (dir === 'back') this.objects.unshift(o);
    else if (dir === 'up') this.objects.splice(Math.min(this.objects.length, i + 1), 0, o);
    else if (dir === 'down') this.objects.splice(Math.max(0, i - 1), 0, o);
    else this.objects.splice(i, 0, o);
    return this.objects.map(x => x.id);
  }

  setClipTransition({ clipId, which = 'in', type = 'fade', dur = 0.5 } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    if (which === 'out') f.clip.transOut = { type, dur };
    else f.clip.transIn = { type, dur };
    return f.clip;
  }

  // Update a clip's canvas placement / opacity (and other simple fields).
  updateClip({ clipId, patch } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    if (patch && patch.rect) f.clip.rect = Object.assign({}, f.clip.rect, patch.rect);
    if (patch && patch.opacity != null) f.clip.opacity = patch.opacity;
    return f.clip;
  }

  setClipFilter({ clipId, filter } = {}) {
    const f = this.findClip(clipId);
    if (!f) throw new Error('No such clip: ' + clipId);
    this._checkpoint();
    f.clip.filter = filter || 'none';
    return f.clip;
  }

  findObject(id) { return this.objects.find(o => o.id === id); }

  updateObject({ id, patch } = {}) {
    const o = this.findObject(id);
    if (!o) throw new Error('No such object: ' + id);
    this._checkpoint();
    Object.assign(o, patch || {});
    return o;
  }

  removeObject({ id } = {}) {
    const o = this.findObject(id);
    if (!o) throw new Error('No such object: ' + id);
    this._checkpoint();
    this.objects = this.objects.filter(x => x.id !== id);
    return true;
  }

  addMarker({ at, label } = {}) {
    this._checkpoint();
    const m = { id: uid('mk'), at: +Number(at || 0).toFixed(3), label: label || 'Marker' };
    this.markers.push(m);
    this.markers.sort((a, b) => a.at - b.at);
    return m;
  }

  setPlayhead(t) { this.playhead = Math.max(0, +Number(t || 0).toFixed(3)); return this.playhead; }

  // ---- frame / canvas ----
  setResolution({ w, h } = {}) {
    const W = Math.max(16, Math.round(w || this.resolution.w));
    const H = Math.max(16, Math.round(h || this.resolution.h));
    this._checkpoint();
    this.resolution = { w: W, h: H };
    return this.resolution;
  }
}

module.exports = { Project, uid };
