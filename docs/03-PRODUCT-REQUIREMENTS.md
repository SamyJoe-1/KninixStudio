# 03 — Product Requirements (PRD)

## Purpose

Define *what* Kninix Studio does, for *whom*, and *why*, at a level that engineering ([04](04-SYSTEM-ARCHITECTURE.md)) and design ([07](07-UI-UX-DESIGN-SYSTEM.md)) can build against. Scope/sequencing lives in [12-Roadmap](12-ROADMAP-MILESTONES.md) and [13-MVP](13-MVP-SCOPE.md).

## Personas

### P1 — Maya, the Creator-Operator (primary)
- Runs a cooking channel: 4 Shorts + 1 long video/week across TikTok/IG/YouTube.
- Edits on a mid-range Windows laptop. Time-poor. Cares about captions, pacing, multi-aspect export, brand consistency.
- **Pain:** captioning and reframing for 3 platforms is hours of tedium; CapCut's titles look generic.
- **Win:** Cue does captions + silence-cut + 9:16/1:1/16:9 versions in one pass; she polishes the hook.

### P2 — Sam, the Motion-Curious Editor (primary)
- Edits client promos in CapCut/Premiere basics; wants animated titles and logo stings without learning AE.
- **Pain:** keyframing is crude; no graph editor; presets look templated.
- **Win:** graph editor + expression-lite + a strong preset library that's tweakable, not locked.

### P3 — Dana, the Small-Studio Lead (secondary)
- 5-person agency; brand kits, client deliverables, consistency, review cycles.
- **Pain:** inconsistent brand application, version chaos, handoff friction.
- **Win:** shared brand kits, reusable templates, project versioning, comment/review.

### P4 — Leo, the Educator (secondary)
- Long-form tutorials, screen + webcam, needs chaptering, silence-cut, clean captions.
- **Pain:** trimming dead air across 40-minute recordings.
- **Win:** transcript-based editing + silence-cut + auto-chapters.

## Jobs To Be Done (JTBD)

1. *When I have raw footage and a deadline, help me get to a polished, captioned, correctly-sized cut fast — so I can post on time.*
2. *When my titles look generic, give me animation depth I can control — so my brand looks premium.*
3. *When I distrust cloud tools, let me work locally and own my files — so I'm not exposed.*
4. *When editing is tedious, let me delegate the boring parts to an assistant — so I focus on creative decisions.*

## Feature catalogue (capability map)

Legend: **[MVP]** ship first · **[V1]** launch · **[V2]** fast-follow · **[Later]** future.

### A. Media & Import
- [MVP] Import video/audio/image (common codecs via FFmpeg), drag-drop, folder watch.
- [MVP] Media library with thumbnails, metadata, search.
- [V1] Proxy/optimized-media generation for heavy 4K.
- [V1] Recording capture (screen, webcam, mic) in-app.
- [V2] Cloud/stock asset browser; stock music with clear licensing.
- [V2] Auto-tagging media by content (AI).

### B. Timeline & Editing
- [MVP] Multi-track timeline, ripple/insert/overwrite, trim, split, slip/slide.
- [MVP] Magnetic + free-placement modes; snapping; markers.
- [MVP] Playback engine with frame-accurate scrubbing (JKL), in/out points.
- [MVP] Undo/redo (command-based, unlimited within session).
- [V1] Nested sequences / compound clips.
- [V1] Multicam sync & switching.
- [V1] Adjustment layers.
- [V2] Speed ramping with optical-flow interpolation.

### C. Text, Titles & Captions
- [MVP] Text layers with rich styling; safe-area guides.
- [MVP] Auto-captions (speech-to-text) with editable transcript.
- [MVP] Caption styling presets (karaoke/word-by-word highlight).
- [V1] Title template library (animated lower-thirds, callouts).
- [V1] Brand kit (fonts, colors, logo) applied to text.
- [V2] Multi-language caption translation.

### D. Motion Graphics (our craft differentiator — see [08](08-MOTION-GRAPHICS-ENGINE.md))
- [MVP] Keyframes on transform (position/scale/rotation/opacity/anchor).
- [MVP] Easing presets + bezier handles.
- [V1] **Graph editor** (value + speed graphs).
- [V1] Shape layers, masks, track mattes.
- [V1] Preset/MOGRT-style animated templates (`.kxt`).
- [V2] Expression engine (sandboxed JS-lite) + driven parameters.
- [V2] Particle/emitter system, generators.
- [Later] 3D layers, camera, lights.

### E. Effects, Transitions & Color
- [MVP] Core transitions (cut, dissolve, slide, zoom, wipe).
- [MVP] Core effects (blur, glow, color adjust, crop, transform).
- [MVP] LUT support; basic color wheels (lift/gamma/gain).
- [V1] Scopes (waveform, vectorscope, histogram); color-managed pipeline.
- [V1] Node-based effect graph (Pro mode).
- [V1] Background removal / chroma key.
- [V2] Object tracking / motion tracking; auto-reframe (subject tracking).
- [V2] AI relight / sky replace (assistive).

### F. Audio
- [MVP] Multi-track audio, volume/pan, fades, waveform display.
- [MVP] Silence detection & removal.
- [V1] Audio ducking (auto lower music under voice), normalization (loudness/LUFS).
- [V1] Noise reduction, de-reverb (on-device where possible).
- [V2] Beat detection & beat-synced cuts; auto music selection.
- [V2] Voice isolation, text-to-speech voices.

### G. AI Copilot "Cue" (see [09](09-AI-FEATURES.md), [10](10-MCP-INTEGRATION.md))
- [MVP] Conversational panel that can perform timeline edits via MCP command layer.
- [MVP] Skills: captions, silence-cut, multi-aspect reframe, "make a rough cut from this footage."
- [V1] B-roll suggestions, color-match shots, "punch up the hook," chaptering.
- [V1] Explainable actions + one-click undo of any Cue action.
- [V2] Long→short auto-repurpose, script-to-storyboard, voice commands.

### H. Export & Delivery
- [MVP] Hardware-accelerated export; presets per platform (TikTok/IG/YT/1080p/4K).
- [MVP] **No watermark on free tier.**
- [V1] Batch/queue export, multi-aspect export in one job.
- [V1] Direct publish to platforms (optional, consented).
- [V2] Render farm / cloud render (optional).

### I. Projects, Collaboration & Brand
- [MVP] Local project files (`.kxp`), autosave, recovery, versions.
- [V1] Brand kits; reusable templates.
- [V1] Project packaging (collect media) for handoff.
- [V2] Cloud sync (opt-in), comments/review, shared libraries.
- [Later] Real-time multiplayer editing.

### J. Extensibility
- [V1] Plugin SDK (effects, panels, exporters).
- [V1] MCP tool surface documented for third parties.
- [V2] Template/plugin marketplace.

## Non-functional requirements (NFRs)

| Area | Requirement |
|---|---|
| **Performance** | Real-time preview of 1080p, ≥3 layers, on mid-range hardware; 4K with proxies. See budgets in [15](15-TESTING-QA-PERFORMANCE.md). |
| **Startup** | Cold start < 4s on reference machine. |
| **Reliability** | Crash-free session rate ≥ 99.5%; autosave ≤ 10s data loss window. |
| **A/V sync** | Export sync drift < 1 frame across a 30-min timeline. |
| **Privacy** | Local-first; no footage leaves device without explicit consent. See [16](16-SECURITY-PRIVACY.md). |
| **Accessibility** | Keyboard-first, screen-reader labels, high-contrast, scalable UI. WCAG 2.1 AA target for UI chrome. |
| **i18n** | UI localizable; captions multi-language (V2). |
| **Platforms** | Windows 10+/macOS 12+ at launch; Linux best-effort; web/mobile later. |
| **Offline** | Full editing offline; only AI cloud features need network (and have on-device fallbacks where feasible). |

## User stories (sample, MVP slice)

- *As Maya, I drop a 12-min raw clip and tell Cue "make this a 60s Short with captions," and get an editable rough cut I can refine.*
- *As Maya, I export 9:16, 1:1, and 16:9 versions from one timeline in a single batch.*
- *As Sam, I animate a title with a graph editor and save it as a reusable template.*
- *As Leo, I remove all silences over 0.6s across a 40-min recording with one action, then review the cuts.*
- *As any user, I undo anything Cue did in one step and see exactly what it changed.*

Acceptance criteria for each are tracked in the backlog (created at MVP kickoff), not here.

## Explicit non-goals (for focus)

- Not a DAW (deep music production) — we do editing-grade audio only.
- Not a 3D/compositing suite (Nuke/Blender) at launch.
- Not a DAM/asset-management platform.
- Not a social network — we publish *to* platforms, we don't host a feed.

## Open questions

- Do we ship in-app screen/webcam recording in MVP or V1? (Leans V1; big value for educators.)
- Transcript-based editing (Descript-style) — MVP or V1? (Strong differentiator; likely V1, prototyped in MVP.)
- How much of audio (ducking/normalization) is MVP vs V1? (Ducking is high-delight; consider pulling into MVP.)
