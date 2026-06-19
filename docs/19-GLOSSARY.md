# 19 — Glossary

Shared vocabulary so docs, design, and engineering mean the same thing. Terms grouped by area.

## Product / project terms

- **Kinetix Studio** — working product name (placeholder; see [01](01-VISION-AND-POSITIONING.md#naming)).
- **Cue** — the AI copilot persona (Claude via MCP) that performs reversible edits ([09](09-AI-FEATURES.md), [10](10-MCP-INTEGRATION.md)).
- **Progressive Pro** — one UI that scales from CapCut-simple to AE-deep via a Pro toggle/contextual reveals ([07](07-UI-UX-DESIGN-SYSTEM.md)).
- **Wedge / hero flow** — the "one-shot social pass" (Flow A): raw footage → captioned, silence-cut, multi-aspect Short ([09](09-AI-FEATURES.md), [13](13-MVP-SCOPE.md)).
- **Local-first** — everything works on-device/offline by default; cloud is opt-in ([16](16-SECURITY-PRIVACY.md)).
- **Fully Local mode** — a verifiable mode that hard-disables all network/cloud features ([16](16-SECURITY-PRIVACY.md)).
- **BYOK** — Bring Your Own Key: user supplies their own AI provider key ([14](14-MONETIZATION-BUSINESS.md)).
- **WEPAC** — Weekly Exported Projects per Active Creator, the north-star metric ([01](01-VISION-AND-POSITIONING.md)).
- **MoSCoW** — Must/Should/Could/Won't scope prioritization ([13](13-MVP-SCOPE.md)).

## File / data terms

- **`.kxp`** — Kinetix Project: open, versioned, diffable project container ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **`.kxt`** — Kinetix Template: a reusable motion-graphics template (a profile of `.kxp` with exposed params) ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **document.json** — the canonical timeline graph; single source of truth ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **Timebase** — rational frame rate (`fps`/`scale`) giving frame-accurate, drift-free time ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **Media index** — mapping of media IDs to file paths + hashes for linking/relink ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **Packaging / collect** — copy referenced media into the bundle for portable handoff.
- **Proxy / optimized media** — lower-res/all-intra stand-ins for smooth editing of heavy 4K/HEVC ([06](06-VIDEO-ENGINE.md)).

## Architecture terms

- **Command** — a typed, validated, reversible operation that mutates the document; the shared layer for UI *and* Cue ([04](04-SYSTEM-ARCHITECTURE.md)).
- **Command core** — the single Rust module that validates/applies commands and manages undo ([04](04-SYSTEM-ARCHITECTURE.md)).
- **Event sourcing** — persisting edits as an append-only command log for recovery/audit ([04](04-SYSTEM-ARCHITECTURE.md), [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **Diff** — the summary of what a command changed (returned to UI and Cue).
- **Sidecar** — the out-of-process MCP server that translates tool calls into commands ([10](10-MCP-INTEGRATION.md)).
- **ADR** — Architecture Decision Record (the numbered decisions in [05](05-TECH-STACK.md)).
- **CRDT** — Conflict-free Replicated Data Type; the future basis for real-time multiplayer ([04](04-SYSTEM-ARCHITECTURE.md), [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).

## Engine / graphics terms

- **Compositor** — the GPU engine that blends layers per frame; same graph for preview and export ([06](06-VIDEO-ENGINE.md)).
- **wgpu / WebGPU** — cross-platform GPU API used for compositing/effects ([05](05-TECH-STACK.md)).
- **WGSL** — the shader language for effects/transitions ([05](05-TECH-STACK.md)).
- **FFmpeg / libav** — media demux/decode/encode library ([05](05-TECH-STACK.md), [06](06-VIDEO-ENGINE.md)).
- **Hardware codecs** — GPU/SoC encoders/decoders: NVENC/NVDEC, AMD AMF, Intel QuickSync, Apple VideoToolbox ([06](06-VIDEO-ENGINE.md)).
- **WYSIWYG (render)** — preview frame equals export frame within tolerance ([06](06-VIDEO-ENGINE.md), [15](15-TESTING-QA-PERFORMANCE.md)).
- **Working color space / linear light** — compositing in linear, wide-gamut space; display via a view transform ([06](06-VIDEO-ENGINE.md)).
- **LUT** — Look-Up Table for color looks/conversions ([06](06-VIDEO-ENGINE.md)).
- **Scopes** — waveform/vectorscope/histogram/parade for color analysis ([06](06-VIDEO-ENGINE.md)).
- **VFR** — Variable Frame Rate footage; conformed at import to avoid sync drift ([06](06-VIDEO-ENGINE.md), [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- **A/V sync drift** — audio/video misalignment over time; a hard-gated defect ([15](15-TESTING-QA-PERFORMANCE.md)).
- **Render/frame cache** — caches of composited segments/decoded frames to keep editing fluid ([06](06-VIDEO-ENGINE.md)).

## Motion-graphics terms

- **Keyframe** — a value at a time; animation interpolates between keyframes ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Easing** — the shape of motion between keyframes (linear/bezier/spring/etc.) ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Graph editor** — value/speed-curve editor for precise motion control; key craft feature ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Speed graph** — velocity-over-time view (snappy vs floaty) ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Motion path** — spatial bezier path traced by position keyframes ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Anchor point** — the pivot for scale/rotation ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Mask** — a bezier shape that limits where a layer/effect shows ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Track matte** — using one layer's alpha/luma to reveal another ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Shape layer / trim paths** — parametric vector graphics; "draw-on" line animation ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Text animator / range selector** — per-character/word text animation (typewriter, wave, cascade) ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Expression** — a small sandboxed script computing a property procedurally (`wiggle`, `loopOut`) ([08](08-MOTION-GRAPHICS-ENGINE.md), ADR-009).
- **Driven parameter / rig** — a control that drives many internal params (e.g., one "Intensity" knob) ([08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Adjustment layer** — applies effects to everything beneath it ([03](03-PRODUCT-REQUIREMENTS.md)).
- **MOGRT-like** — reusable, parameterized animated template (our open `.kxt`) ([08](08-MOTION-GRAPHICS-ENGINE.md)).

## AI / MCP terms

- **MCP** — Model Context Protocol: exposes tools + resources so Claude can act ([10](10-MCP-INTEGRATION.md)).
- **Tool (MCP)** — an action Cue can take; maps to a core Command ([10](10-MCP-INTEGRATION.md)).
- **Resource (MCP)** — read-only project context Cue can fetch (timeline, transcript, etc.) ([10](10-MCP-INTEGRATION.md)).
- **Skill / prompt template** — a pre-composed tool sequence for a common flow ([10](10-MCP-INTEGRATION.md)).
- **Consent gate** — the chokepoint enforcing opt-in before any cloud/egress ([10](10-MCP-INTEGRATION.md), [16](16-SECURITY-PRIVACY.md)).
- **On-device primitive** — local model/DSP (ASR, VAD, detection) usable offline/privately ([09](09-AI-FEATURES.md)).
- **VAD** — Voice Activity Detection (powers silence removal) ([09](09-AI-FEATURES.md)).
- **ASR** — Automatic Speech Recognition (powers captions/transcript) ([09](09-AI-FEATURES.md)).
- **Auto-reframe** — re-centering subject when changing aspect ratio ([08](08-MOTION-GRAPHICS-ENGINE.md), [09](09-AI-FEATURES.md)).
- **Acceptance rate** — share of Cue edits kept (not undone); the key AI-quality metric ([15](15-TESTING-QA-PERFORMANCE.md)).
- **Provenance / content credentials** — metadata labeling AI-generated/altered media ([16](16-SECURITY-PRIVACY.md)).

## Audio terms

- **Ducking** — auto-lowering music under voice ([03](03-PRODUCT-REQUIREMENTS.md), [09](09-AI-FEATURES.md)).
- **LUFS / loudness normalization** — standard for consistent perceived loudness ([06](06-VIDEO-ENGINE.md), [09](09-AI-FEATURES.md)).
- **Waveform / peaks** — visual amplitude display precomputed per media item ([06](06-VIDEO-ENGINE.md)).

## Process terms

- **Spike** — a focused technical experiment to de-risk an assumption ([12](12-ROADMAP-MILESTONES.md), [05](05-TECH-STACK.md)).
- **Phase gate** — milestone with hard exit criteria before proceeding ([12](12-ROADMAP-MILESTONES.md)).
- **Golden frame/audio** — stored reference output for regression testing ([15](15-TESTING-QA-PERFORMANCE.md)).
- **Hard gate** — a defect class that blocks release regardless of schedule (A/V sync, crash-free, privacy, watermark, migration) ([15](15-TESTING-QA-PERFORMANCE.md), [17](17-RISKS-MITIGATIONS.md)).
- **Reference machine** — the mid-range spec perf budgets are measured on ([05](05-TECH-STACK.md), [15](15-TESTING-QA-PERFORMANCE.md)).
