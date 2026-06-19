# 05 — Tech Stack & Architecture Decision Records

> These are **defaults chosen to make the plan concrete**, with rationale. Each ADR is challengeable at planning review. We optimize for: native video performance, UI velocity, cross-platform reach, small binary, and a shared command layer for UI + AI.

## Stack at a glance

| Layer | Choice | Why (one-liner) |
|---|---|---|
| App shell | **Tauri 2** (Rust host + system WebView) | Native perf + tiny binary vs Electron |
| Core / engine | **Rust** | Safety + speed for decode/composite/encode |
| UI | **React + TypeScript + Vite** | Velocity, ecosystem, hiring |
| GPU compositor | **wgpu / WebGPU + WGSL shaders** | Cross-platform GPU, one shader language |
| Media I/O | **FFmpeg / libav** (linked) + HW codecs | The codec workhorse, hardware accel |
| Audio | **Rust DSP** (cpal/symphonia + custom mixer) | Low-latency, allocation-free hot path |
| State (UI) | **Zustand/Redux-style store** mirroring core diffs | Predictable, diff-driven |
| Expressions | **Sandboxed JS (boa/quickjs)** or constrained DSL | AE-like familiarity, safe eval |
| AI copilot | **Claude API** via **MCP** + on-device models for ASR/VAD | Project-aware copilot + privacy fallback |
| MCP server | Local **sidecar** exposing command tools | Isolation + external attach |
| Packaging | Tauri bundler (MSI/NSIS, DMG, AppImage) | Native installers |
| Crash/telemetry | Opt-in, privacy-first (e.g., self-hosted) | Trust = product |

## ADR-001 — Desktop shell: Tauri over Electron

**Decision:** Use **Tauri 2** (Rust backend + OS WebView) for the desktop shell.

**Context:** We need a polished web-tech UI but native performance for video and a Rust core. Options: Electron, Tauri, fully-native (Qt/C++), Flutter desktop.

**Why Tauri:**
- **Performance & memory:** no bundled Chromium; Rust host is ideal for our engine; far smaller footprint matters for "works on a modest laptop."
- **Rust-native core:** our hot paths (FFmpeg, wgpu, audio) are Rust; Tauri makes the UI↔core bridge first-class.
- **Security model:** capability-based, good for a local-first, plugin-hosting app.
- **Binary size & startup:** small installer, fast cold start (an NFR).

**Trade-offs / risks:**
- WebView differs per OS (WebKit on macOS, WebView2 on Windows) → must test rendering consistency; pin features we rely on.
- Smaller ecosystem than Electron → some plugins/patterns we build ourselves.
- WebGPU availability varies by WebView → we may render the compositor in **native wgpu** and present into the WebView (texture handoff) rather than relying on in-WebView WebGPU. (Validate early — this is the single biggest technical spike.)

**Rejected — Electron:** heavier, larger, Node-centric; our perf-critical core is Rust anyway, so Electron's JS-host advantage doesn't help us.
**Rejected — pure Qt/C++:** maximal performance but slow UI iteration, harder hiring, weaker for the rich, animated UI we want.
**Rejected — Flutter desktop:** good UI, but weaker fit for deep native video/GPU interop and Rust core integration.

## ADR-002 — Engine language: Rust

**Decision:** Core engine, media I/O, compositor, audio, export in **Rust**.

**Why:** memory safety without GC pauses (critical for real-time audio/preview), excellent FFI to FFmpeg, mature wgpu, fearless concurrency for worker pools, single language across most of the native stack.
**Trade-offs:** steeper hiring than C++/TS in some markets; compile times; some media libs are C (FFI overhead, managed via thin safe wrappers).
**Rejected:** C++ (more footguns, slower iteration), Go (GC + weaker GPU/realtime story), Zig (too early for team scale).

## ADR-003 — GPU compositor: wgpu/WebGPU + WGSL

**Decision:** Build the frame compositor and effects on **wgpu** with **WGSL** shaders.

**Why:** one portable GPU API across Vulkan/Metal/DX12; one shader language for effects/transitions/motion; future path to web. Effects authored once run everywhere.
**Trade-offs:** WebGPU is newer; some advanced GPU features need fallbacks; driver variance → must test broadly.
**Rejected:** per-platform native (Metal+DX+Vulkan) — triple the shader work; OpenGL — deprecated trajectory.

## ADR-004 — Media: FFmpeg/libav with hardware codecs

**Decision:** Use **FFmpeg/libav** for demux/decode/encode, with hardware paths (NVENC/NVDEC, AMD AMF, Intel QuickSync, Apple VideoToolbox).

**Why:** unmatched format coverage; hardware accel is mandatory for 4K real-time and fast export (an NFR).
**Trade-offs:** **licensing** (LGPL/GPL components, patented codecs like H.264/H.265/AAC) → must build a **license-clean configuration** and handle codec royalties; large dependency; FFI surface to manage.
**Action:** dedicate a legal/licensing review (see [16](16-SECURITY-PRIVACY.md), [17](17-RISKS-MITIGATIONS.md)); prefer LGPL build, isolate GPL features, license patented codecs or rely on OS/HW-provided codecs. Favor AV1/VP9/Opus where possible for royalty-free paths.

## ADR-005 — UI: React + TypeScript

**Decision:** **React + TypeScript** (Vite) for the UI, with a diff-driven store mirroring the Rust core.
**Why:** fastest path to a rich, animated, accessible UI; deep ecosystem (virtualized lists for timeline, etc.); large hiring pool; testability.
**Trade-offs:** must be disciplined about performance (timeline can be heavy) — use canvas/WebGL for the timeline track area, virtualization, and avoid React re-render storms. Heavy pixels go to the native compositor, not the DOM.
**Rejected:** Svelte/Solid (great perf, smaller ecosystem/hiring), immediate-mode native UI (slower iteration for our design ambitions).

## ADR-006 — AI: Claude via MCP, with on-device fallbacks

**Decision:** The copilot **Cue** is **Claude** (latest model, e.g. Opus/Sonnet class) reached through an **MCP** layer that exposes editing tools; privacy-sensitive primitives (speech-to-text, voice-activity/silence detection, scene detection) run **on-device** where feasible.

**Why:** MCP gives a clean, reusable tool surface that also makes the app automatable; on-device ASR/VAD preserves the local-first promise and works offline; cloud LLM provides the reasoning/planning that makes Cue feel like a collaborator.
**Trade-offs:** cloud calls need explicit consent + clear data handling; cost management (see [14](14-MONETIZATION-BUSINESS.md)); model/version drift (pin model IDs, test prompts). On-device models add binary size and per-platform packaging.
**Rejected:** AI as isolated server-only buttons (CapCut's pattern — no project awareness); fully on-device LLM only (insufficient reasoning today for the copilot UX).

## ADR-007 — MCP server: local sidecar process

**Decision:** Run the MCP server as a **local sidecar** that translates MCP tool calls into core Commands over IPC.
**Why:** process isolation (a misbehaving tool/agent can't corrupt the editor), clean place to enforce **consent + rate limits + audit**, and it lets *external* MCP clients (other agents, automation) attach to a running project. Same command layer as the UI ([04](04-SYSTEM-ARCHITECTURE.md)).
**Trade-offs:** IPC complexity, lifecycle management. **Mitigation:** strong typed protocol, health checks, the editor remains fully usable if the sidecar is down.
**Rejected:** in-process only (simpler, but couples AI faults to the editor and blocks external attach).

## ADR-008 — Project format: open, documented `.kxp`

**Decision:** `.kxp` = a **documented, versioned** container (JSON/CBOR document + media references/packaging), human-diffable, with a published schema. Details in [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md).
**Why:** ownership/trust moat, plugin/automation friendliness, future interop (import/export to/from EDL/AAF/FCPXML/OTIO).
**Trade-offs:** stable schema + migration discipline forever. Worth it.

## ADR-009 — Expressions engine

**Decision (provisional):** Embed a **sandboxed JS engine** (e.g., quickjs/boa) for parameter expressions, with a curated, deterministic API; evaluate per-frame with strict time/CPU budgets.
**Why:** AE-style expression familiarity; powerful procedural motion.
**Open:** a constrained DSL would be safer/faster but less familiar. Spike both; decide at motion-engine milestone ([08](08-MOTION-GRAPHICS-ENGINE.md)).

## Reference dev environment

- **OS targets:** Windows 10+ (primary dev), macOS 12+ (Apple Silicon + Intel), Linux (best-effort).
- **Toolchain:** Rust stable, Node LTS, Vite, wgpu, FFmpeg (vendored/linked), CI on all three OSes.
- **Reference test machine ("mid-range"):** 6-core CPU, 16 GB RAM, entry discrete or integrated GPU — perf budgets in [15](15-TESTING-QA-PERFORMANCE.md) are measured here, not on a workstation.

## Biggest technical spikes (validate before committing)

1. **Native wgpu → WebView texture presentation** (the compositor handoff). If this is painful, reconsider shell.
2. **FFmpeg HW decode/encode** across NVIDIA/AMD/Intel/Apple with graceful fallback.
3. **Timeline rendering performance** (thousands of clips/keyframes) in the UI.
4. **MCP sidecar ↔ core command round-trip latency** (must feel instant).
5. **License-clean FFmpeg + codec royalty** path.

## Open questions

- In-WebView WebGPU vs native-wgpu-present — decided by Spike #1.
- Embedded JS vs DSL for expressions (ADR-009).
- Self-hosted vs vendor for crash/telemetry (must be privacy-first either way).
- Which on-device ASR model (size vs accuracy vs license) for captions/silence-cut.
