# 15 — Testing, QA & Performance

> A video editor lives or dies on **stability, performance, and A/V correctness**. Quality is not a phase — budgets and gates are enforced from P0 ([12](12-ROADMAP-MILESTONES.md)). Editors that crash or drift audio lose trust instantly.

## Quality philosophy

1. **Determinism is testable truth.** Same `.kxp` + same inputs → same frames/audio. This makes rendering, motion, and Cue all unit-testable.
2. **Budgets are gates, not aspirations.** Perf/quality budgets block merges and releases.
3. **Test the command layer once, get UI + AI coverage.** Since GUI and Cue share commands ([04](04-SYSTEM-ARCHITECTURE.md)), testing commands covers both.
4. **Real footage, real machines.** Synthetic media isn't enough; we keep a corpus of nasty real-world clips (VFR, HEVC, weird audio).

## Test pyramid

```
        ┌───────────────────────────────┐
        │  E2E / scenario (slow, few)    │  full flows incl. Cue social-pass
        ├───────────────────────────────┤
        │  Integration (engine/pipeline) │  decode→composite→encode, MCP round-trips
        ├───────────────────────────────┤
        │  Golden / render correctness   │  frame & audio hashing vs references
        ├───────────────────────────────┤
        │  Unit (many, fast)             │  commands, keyframe eval, time math, serde
        └───────────────────────────────┘
```

### Unit
- Command core: every command + its inverse (undo correctness), validation, invariants.
- Time math: rational timebase, VFR conform, no drift over long durations.
- Keyframe/easing evaluation: interpolation correctness, graph-editor math.
- `.kxp` serde: round-trip, migrations, forward-compat (unknown-field preservation).
- Effect param schemas, color transforms (known input→output).

### Golden / render-correctness (the camera that watches the camera)
- **Frame hashing:** render reference timelines, compare composited frames to stored goldens (with perceptual tolerance for GPU/driver variance).
- **Audio hashing:** compare mixed audio to references; detect drift, clicks, gain errors.
- **WYSIWYG:** assert **preview frame == export frame** for the same time (within tolerance) — our core promise ([06](06-VIDEO-ENGINE.md)).
- **Cross-platform/driver matrix:** run goldens on NVIDIA/AMD/Intel/Apple to catch GPU divergence.

### Integration
- Full **decode → composite → encode** on the real-footage corpus; verify no dropped frames, sync intact.
- HW encode/decode paths per vendor + software fallback.
- MCP **tool contract tests**: schema, validation, correct diff, single-undo per call ([10](10-MCP-INTEGRATION.md)).

### E2E / scenario
- **Cue signature flows** ([09](09-AI-FEATURES.md)) end-to-end: drive via MCP, assert resulting timeline state and reversibility.
- Onboarding → first export. Import → edit → multi-aspect batch export.
- Crash recovery: kill mid-edit, reopen, assert ≤ 10s loss.
- Long-session soak: hours of editing, watch for leaks/slowdown.

## Performance budgets (reference machine: 6-core, 16GB, entry GPU)

| Metric | Budget | Gate |
|---|---|---|
| Cold start | < 4 s | release |
| Project open (typical) | < 2 s | release |
| Scrub latency (show target frame) | < ~100 ms | release |
| 1080p / 3 layers preview | ≥ source fps (real-time) | release |
| 4K preview (with proxy) | smooth edit (no full-res stall) | release |
| Export 1080p H.264 (HW) | faster than real-time | release |
| A/V sync drift | < 1 frame over 30 min | **hard** |
| Crash-free session rate | ≥ 99.5% | **hard** |
| Memory (30-min 1080p project) | bounded by cache budgets, no unbounded growth | release |
| MCP interactive tool round-trip | feels instant (< ~150 ms) | release |
| Undo/redo apply | < 50 ms | release |

- Budgets are measured in CI perf jobs + a **performance dashboard**; regressions beyond threshold **fail the build**.
- Track p50 **and** p95/p99 (jank lives in the tail).

## Specialized QA areas

- **A/V sync** (highest-stakes): automated sync probes across codecs, frame rates (esp. 29.97/VFR), long timelines, speed changes.
- **Codec matrix:** matrix of container×codec×fps×bit-depth×audio; track which decode/encode HW path each takes.
- **GPU/driver matrix:** the biggest source of "works on my machine"; golden frames per vendor.
- **Cue/AI quality:** caption accuracy (WER) on an accent/noise corpus; silence-cut precision/recall; reframe subject-centering; **acceptance rate** (kept vs undone) as the north-star AI quality metric.
- **Color correctness:** known LUT/grade in→out; linear-light blend checks; scope accuracy.
- **Accessibility:** automated a11y checks + manual screen-reader/keyboard passes ([07](07-UI-UX-DESIGN-SYSTEM.md)).

## Reliability & resilience tests

- Fault injection: corrupt frame, missing media, font missing, GPU device loss, sidecar crash → editor stays up, clear recovery.
- Export robustness: cancel/resume, disk-full, codec failure isolation.
- Fuzzing: `.kxp` parser, MCP tool args, media headers.

## Stability & release gating

- **Blockers (no release):** any A/V-sync defect, crash-free < target, data-loss > 10s, watermark on free export, privacy leak (footage leaves device without consent), failed `.kxp` migration.
- **Beta rings:** internal → private beta (MVP, [13](13-MVP-SCOPE.md)) → public. Crash + perf telemetry (opt-in) per ring.

## Tooling & infra

- CI on Windows/macOS (+Linux best-effort) with GPU runners for golden frames.
- Perf dashboard with historical trend + regression alerts.
- Opt-in crash reporting & telemetry (privacy-first, [16](16-SECURITY-PRIVACY.md)) — never includes footage; aggregate metrics only.
- Real-footage corpus (licensed/owned) + synthetic edge cases, versioned.
- "Bug bash" rituals before each milestone; dogfooding (we edit our own marketing videos in it).

## Definition of Done (per feature)

- Unit + integration tests; golden frames if it renders; MCP contract test if it's a tool.
- Meets relevant perf budget; no a11y regressions; docs/changelog updated.
- Reversible (undo) verified; works offline if it's not inherently cloud.

## Open questions

- Perceptual tolerance thresholds for cross-GPU golden frames (too tight = flaky; too loose = misses bugs).
- How to benchmark Cue quality repeatably given model nondeterminism (seeded prompts + acceptance-rate sampling + scenario assertions).
- Public benchmark suite vs CapCut — which metrics, published how ([02](02-MARKET-COMPETITIVE-ANALYSIS.md)).
