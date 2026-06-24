'use strict';
const params = new URLSearchParams(window.location.hash.slice(1));
const targetJobId = params.get('jobId');
let trackedJobId = targetJobId || null;

window.kx.onJob((j) => {
  if (j.type !== 'export') return;
  if (!trackedJobId) trackedJobId = j.id;
  if (j.id !== trackedJobId) return;

  const pct = Math.round((j.progress || 0) * 100);
  document.getElementById('bar').style.width = pct + '%';
  document.getElementById('pct').textContent = pct + '%';
  document.getElementById('detail').textContent = j.detail || j.label || 'Working…';

  const label = j.detail || '';
  document.getElementById('phase').textContent =
    label.startsWith('Rendering') ? 'Rendering captions…' : 'Encoding video…';

  if (j.status === 'done' || j.status === 'canceled' || j.status === 'error') {
    window.close();
  }
});

document.getElementById('btnCancel').addEventListener('click', () => {
  if (trackedJobId) {
    window.kx.rpc('cancel_job', { jobId: trackedJobId }).catch(() => {});
  }
});
