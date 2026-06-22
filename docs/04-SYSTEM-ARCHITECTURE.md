# 04 — System Architecture

## Goals & constraints

- **Real-time-ish editing** on mid-range hardware → native performance for the hot paths (decode, composite, encode), web-tech velocity for UI.
- **One command layer** that drives both the GUI *and* the MCP/Cue copilot — so AI and humans share the exact same, reversible operations.
- **Local-first**: everything works offline; cloud/AI are optional edges.
- **Deterministic, diffable project state** → an open `.kxp` document model ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).

## High-level shape

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Kninix STUDIO (desktop app)                   │
│                                                                        │
│  ┌───────────────────────────┐      ┌──────────────────────────────┐  │
│  │        UI LAYER            │      │      CUE / AI LAYER           │  │
│  │  (Web tech in Tauri WV)    │      │  Chat panel · skills · plans  │  │
│  │  React + TS + WebGPU       │◄────►│  talks to local MCP server    │  │
│  │  Timeline, Inspector,      │      └───────────────┬──────────────┘  │
│  │  Preview, Library, Graph   │                      │                 │
│  └─────────────┬─────────────┘                      │                 │
│                │  Commands (typed, reversible)       │ MCP tools       │
│                ▼                                     ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                 COMMAND / DOCUMENT CORE  (Rust)                    │ │
│  │  • Project document (timeline graph, layers, keyframes)           │ │
│  │  • Command bus + undo/redo (event-sourced)                        │ │
│  │  • Validation, invariants, selection, time model                  │ │
│  │  • Serialization to/from .kxp                                      │ │
│  └───────┬───────────────────────┬───────────────────────┬──────────┘ │
│          │                       │                       │            │
│          ▼                       ▼                       ▼            │
│  ┌───────────────┐     ┌──────────────────┐     ┌──────────────────┐  │
│  │ MEDIA I/O     │     │ RENDER / COMPOSE  │     │ AUDIO ENGINE     │  │
│  │ FFmpeg/libav  │     │ WebGPU/wgpu       │     │ mixing, DSP,     │  │
│  │ decode, demux │     │ shader graph,     │     │ resample, meters │  │
│  │ HW accel      │     │ frame compositor  │     │                  │  │
│  └───────┬───────┘     └─────────┬─────────┘     └────────┬─────────┘  │
│          │                       │                        │            │
│          └───────────► EXPORT / ENCODE (FFmpeg + HW encoders) ◄───────┘ │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  PLATFORM SERVICES: file system, settings, telemetry (opt-in),    │ │
│  │  crash reporting, plugin host, license, update                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
        │ optional, opt-in, consented edges
        ▼
┌───────────────────┐   ┌────────────────────┐   ┌──────────────────────┐
│ AI services        │   │ Cloud sync/storage │   │ Stock/asset/publish  │
│ (Claude API, ASR,  │   │ (project + media)  │   │ APIs (TikTok/IG/YT)  │
│  on-device models) │   │                    │   │                      │
└───────────────────┘   └────────────────────┘   └──────────────────────┘
```

## The central idea: a single Command Core

Everything that mutates a project is a **Command** — a typed, validated, reversible operation (e.g., `SplitClip`, `AddKeyframe`, `ApplyEffect`, `SetCaptionStyle`). The UI emits commands. **Cue emits the same commands via MCP tools.** This guarantees:

- AI and human edits are identical in power and **equally undoable**.
- Every change is **auditable** ("Cue did X") and **reversible** in one step.
- The document model has one source of truth and clear invariants.

```
User click / drag ─┐
                   ├─► Command ─► validate ─► apply to Document ─► emit diff ─► UI re-render
Cue (via MCP)    ──┘                              │
                                                  └─► push onto undo stack (event-sourced)
```

See [10-MCP](10-MCP-INTEGRATION.md) for how MCP tools map onto commands, and [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md) for the document model.

## Process / threading model

- **UI thread** (WebView): rendering of panels, interaction, lightweight state. Never blocks on heavy work.
- **Core thread(s)** (Rust): document mutations, command processing, serialization — single-writer for determinism, with fast snapshotting.
- **Render workers**: GPU compositor jobs (preview frames, thumbnails) on a job queue; results pushed to UI as textures.
- **Media workers**: decode/demux, proxy generation, waveform/peak extraction — parallel, cancellable.
- **Audio thread**: real-time-safe mixing/playback (low latency, no allocations on the hot path).
- **Export pipeline**: dedicated, off the interactive path, with progress + cancellation.
- **AI/MCP**: out-of-process or async tasks; never block editing; results arrive as commands or proposals.

Communication: typed message passing (Rust ↔ WebView via Tauri IPC; workers via channels). Backpressure and cancellation are first-class (scrubbing must always feel live).

## Playback & preview pipeline (interactive path)

```
Playhead time T
   │
   ▼
Resolve visible layers at T (document query)
   │
   ▼
For each layer: get source frame (decode/cache) → apply effects (shader graph) 
   │                                                       │
   └──────────────► Compositor (WebGPU): blend layers, transforms, masks
                                   │
                                   ▼
                         Preview frame → display
   (parallel) Audio engine mixes tracks at T → output
```

Caching: decoded-frame cache (LRU, GPU-aware), render cache for unchanged segments, proxy media for heavy sources. Detail in [06-VIDEO-ENGINE](06-VIDEO-ENGINE.md).

## Module breakdown (logical)

| Module | Responsibility | Tech |
|---|---|---|
| `core-document` | Project model, time, layers, keyframes, invariants | Rust |
| `core-command` | Command bus, undo/redo, event sourcing, diffs | Rust |
| `core-serde` | `.kxp` read/write, migrations, packaging | Rust |
| `media-io` | Demux/decode, HW accel, proxies, waveforms | Rust + FFmpeg |
| `render-compositor` | Layer compositing, transforms, masks, blend | Rust + wgpu/WGSL |
| `effects` | Effect/transition shader graph, LUTs, color mgmt | Rust + WGSL |
| `motion` | Keyframe eval, easing, graph editor data, expressions | Rust (+ JS sandbox for expressions) |
| `audio-engine` | Mixing, DSP, meters, silence/loudness | Rust |
| `export` | Encode pipeline, presets, batch/queue | Rust + FFmpeg HW |
| `ai-cue` | Copilot orchestration, skills, planning | TS + Rust bridge |
| `mcp-server` | MCP tools/resources mapping to commands | Rust or TS |
| `ui` | All panels, interactions, state | React + TS + WebGPU |
| `platform` | FS, settings, update, crash, license, plugins | Rust + Tauri |

## Data flow for a Cue-driven edit (end to end)

```
1. User: "Cut the silences and add captions."
2. Cue (Claude) reads project state via MCP resource (timeline JSON).
3. Cue plans: [detect_silence] → [remove_ranges] → [transcribe] → [add_captions].
4. Cue calls MCP tools → each maps to a core Command (validated).
5. Core applies commands, pushes to undo stack, emits diffs.
6. UI updates timeline live; Cue reports "Removed 14 gaps, added 38 captions. Undo all?"
7. User reviews, tweaks, or one-click undoes.
```

Every AI action is **proposed → applied → reversible**, and visible in the edit history.

## Extensibility

- **Plugins** run in a sandboxed host: effect plugins (WGSL + params schema), panel plugins (web UI), exporter plugins. Capability-scoped, no raw FS by default.
- **MCP tools** are the same surface third-party copilots/agents can use (documented). This makes Kninix *automatable*, not just AI-assisted.

## Failure & recovery

- Autosave + crash recovery (event log replay to last consistent state).
- Render/export isolated so a codec crash doesn't take down the editor.
- Media offline handling (relink), missing-font fallback, corrupt-project repair pass.

## Open questions

- MCP server **in-process** (Rust) vs **sidecar** process? (Leaning sidecar for isolation + easy external attach; ADR pending in [05](05-TECH-STACK.md).)
- Expressions sandbox: embedded JS engine vs a constrained DSL? (JS-lite for familiarity vs DSL for safety/perf.)
- Single-writer core vs multi-writer with CRDT for future multiplayer — design the document model so CRDT is possible later ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
