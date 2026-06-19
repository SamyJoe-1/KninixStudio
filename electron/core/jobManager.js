'use strict';
// Concurrent job pool. This is the heart of the "multi-process / never blocks" promise:
// heavy work is submitted as a job, runs off the main flow, streams progress, and is
// cancellable. Several jobs run at once (bounded by maxConcurrent), so exporting,
// importing and thumbnailing all proceed in parallel — like CapCut, the UI never waits.

const { EventEmitter } = require('events');
const crypto = require('crypto');

const TERMINAL = new Set(['done', 'error', 'canceled']);

class JobManager extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.maxConcurrent = opts.maxConcurrent || 4;
    this.jobs = new Map();
    this._queue = [];
    this._running = 0;
  }

  list() { return [...this.jobs.values()].map(j => this._public(j)); }

  get(id) { const j = this.jobs.get(id); return j ? this._public(j) : null; }

  _public(j) {
    return {
      id: j.id, type: j.type, label: j.label, status: j.status,
      progress: j.progress, detail: j.detail, error: j.error,
      startedAt: j.startedAt, finishedAt: j.finishedAt, result: j.result,
    };
  }

  // spec: { type, label, run(ctx) }  where ctx = { signal, onProgress(fraction, detail) }
  submit(spec) {
    const id = 'job_' + crypto.randomBytes(5).toString('hex');
    const job = {
      id, type: spec.type, label: spec.label || spec.type,
      status: 'queued', progress: 0, detail: '', error: null,
      startedAt: null, finishedAt: null, result: null,
      _run: spec.run, _controller: new AbortController(),
    };
    this.jobs.set(id, job);
    this._emit(job);
    this._queue.push(job);
    this._pump();
    return id;
  }

  _emit(job) { this.emit('update', this._public(job)); }

  _pump() {
    while (this._running < this.maxConcurrent && this._queue.length) {
      const job = this._queue.shift();
      if (job.status === 'canceled') continue;
      this._start(job);
    }
  }

  async _start(job) {
    this._running++;
    job.status = 'running';
    job.startedAt = Date.now();
    this._emit(job);
    const ctx = {
      signal: job._controller.signal,
      onProgress: (fraction, detail) => {
        job.progress = Math.max(0, Math.min(1, fraction || 0));
        if (detail != null) job.detail = detail;
        this._emit(job);
      },
    };
    try {
      const result = await job._run(ctx);
      job.result = result || null;
      job.progress = 1;
      job.status = 'done';
    } catch (err) {
      if (job._controller.signal.aborted) job.status = 'canceled';
      else { job.status = 'error'; job.error = String((err && err.message) || err); }
    } finally {
      job.finishedAt = Date.now();
      this._running--;
      this._emit(job);
      this._pump();
    }
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      job.status = 'canceled';
      job.finishedAt = Date.now();
      this._emit(job);
      return true;
    }
    if (job.status === 'running') { job._controller.abort(); return true; }
    return false;
  }

  clearFinished() {
    for (const [id, j] of this.jobs) if (TERMINAL.has(j.status)) this.jobs.delete(id);
  }
}

module.exports = { JobManager };
