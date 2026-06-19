# 13 — MVP Scope ("Smallest Lovable Cut")

> The MVP is **not** a stripped editor — it's the **smallest product a real creator would choose over CapCut for a specific job**. That job: *turn raw footage into a captioned, silence-cut, multi-aspect Short, with Cue doing the grunt work — fast, locally, watermark-free.*

## MVP thesis (one sentence)

> If a creator can drop a raw clip and, in minutes, get an **editable** captioned + silence-cut + reframed Short — with an AI copilot that actually performed the edits and everything is undoable and stays on their machine — they'll feel the difference from CapCut immediately.

## The single hero flow ("the wedge demo")

**Flow A — One-shot social pass** ([09](09-AI-FEATURES.md)):
1. Import a 12-min raw clip.
2. *"Cue, make this a 45s Short with captions, cut the dead air, give me 9:16, 1:1, 16:9."*
3. Cue: transcribe → pick 45s → silence-cut → captions (styled) → reframe ×3 → queue export — each step reversible, with diffs.
4. User refines the hook, tweaks a caption, exports.
5. **Result:** three watermark-free files, made locally, in a fraction of the manual time.

Everything in MVP exists to make this flow real, refinable, and trustworthy — plus enough manual editing that it's a genuine editor, not a one-trick toy.

## In scope (MVP) — MoSCoW

### MUST
- **Import:** common video/audio/image via FFmpeg; drag-drop; media library with thumbnails.
- **Timeline:** multi-track (video/audio/text); trim, split (blade), ripple delete, move; snapping; magnetic + free; markers; in/out.
- **Playback:** frame-accurate scrub, JKL, real-time preview of 1080p/≥3 layers on reference machine.
- **Transform + keyframes:** position/scale/rotation/opacity/anchor; easing presets; bezier handles; on-canvas motion path.
- **Text/captions:** text layers; **auto-captions (on-device ASR)**; editable transcript; caption style presets (word-highlight).
- **AI/Cue (MCP):** the social-pass flow + individual tools (transcribe, silence-cut, reframe, captions) — all reversible via shared command layer ([10](10-MCP-INTEGRATION.md)).
- **Silence removal** (VAD) with review.
- **Multi-aspect reframe + export** (9:16/1:1/16:9), batch export.
- **Effects/transitions (core set):** cut, dissolve, slide, zoom; blur, glow, color-adjust, crop, transform.
- **Color (basic):** LUT support + lift/gamma/gain wheels.
- **Export:** HW-accelerated, platform presets, **no watermark**.
- **Project:** `.kxp` save/load, autosave, crash recovery, unlimited-session undo/redo.
- **Privacy:** local-first; explicit consent before any cloud AI; "fully local" mode.

### SHOULD
- Audio ducking (high delight, cheap-ish) — pull in if capacity allows.
- Proxy media for heavy 4K.
- Command palette (Ctrl/Cmd-K).
- Brand kit (fonts/colors/logo) feeding captions/titles.

### COULD
- In-app screen/webcam recording.
- Transcript-based editing prototype (delete words → cut video).
- Filler-word removal.

### WON'T (this release — see [12](12-ROADMAP-MILESTONES.md))
- Graph editor, shape layers, masks/mattes, expressions (V1/V2).
- Generative AI (b-roll, image fill, TTS) (V2).
- Motion/object tracking, beat-sync (V2).
- Collaboration, cloud sync, marketplace (V1/V3).
- Mobile/web (P4).
- Scopes, node effect graph, advanced color (V1).

## Explicit MVP non-goals (protect focus)

- Not trying to match CapCut's **template volume** — we ship a small, premium seed set and lean on Cue + editability.
- Not trying to be a pro NLE yet (no multicam, nesting, advanced color).
- Not chasing every codec — cover the common creator formats well.

## MVP success criteria (ship gate)

| Dimension | Bar |
|---|---|
| **Wedge demo** | A non-engineer completes Flow A end-to-end unaided on the reference machine. |
| **Editor legitimacy** | User can also manually edit (trim/keyframe/caption/effect/export) without Cue. |
| **Performance** | Meets preview/scrub/export budgets in [15](15-TESTING-QA-PERFORMANCE.md). |
| **Reliability** | Crash-free session ≥ 99%; autosave loss window ≤ 10s; export A/V sync < 1 frame/30 min. |
| **Reversibility** | Every Cue action undoable in one step; visible action history. |
| **Trust** | No footage leaves device without consent; no watermark; `.kxp` opens/saves reliably. |
| **Delight** | Beta users say the captions/silence-cut/reframe pass saved them real time vs CapCut. |

## What we measure in beta

- Time-to-first-export (onboarding).
- Cue action **acceptance rate** (kept vs undone).
- WEPAC proxy (projects exported/active user/week) ([01](01-VISION-AND-POSITIONING.md)).
- Crash-free rate, render success rate, A/V-sync defects (must trend to ~0).
- Qualitative: "would you use this instead of CapCut for Shorts?"

## Rough build order within MVP (maps to [12](12-ROADMAP-MILESTONES.md) P1)

1. Decode→display→timeline→trim/split→save/load (`document.json`/`.kxp`).
2. Playback engine + scrub + JKL + multi-track.
3. Keyframes + easing + on-canvas transform.
4. Effects/transitions core + basic color.
5. On-device ASR → captions → transcript editing → caption styles.
6. Silence detection/removal; reframe; batch export (HW).
7. **MCP sidecar + Cue panel**; wire the social-pass flow; reversibility + diffs.
8. Autosave/recovery, onboarding, polish, perf hardening → beta.

(1–4 are "a real editor"; 5–7 are "the wedge"; 8 makes it lovable.)

## Risks specific to MVP

- **Compositor handoff** (Spike #1) slips → preview perf at risk. *Mitigation: resolve in P0 before MVP.*
- **ASR quality** on-device varies by accent/noise → caption acceptance dips. *Mitigation: editable transcript, optional cloud ASR (consented), confidence flags.*
- **Scope creep** toward graph editor/templates. *Mitigation: WON'T list is firm; those are V1.*
- **Cue reliability** (tool composition errors). *Mitigation: skill prompts for the hero flow, strong tool contracts, scenario tests ([10](10-MCP-INTEGRATION.md), [15](15-TESTING-QA-PERFORMANCE.md)).*

## Open questions

- Pull **audio ducking** and **brand kit** from SHOULD into MUST? (Both are high-delight, moderate cost.)
- Ship **transcript-based editing** as a COULD prototype to test the Descript-style hook early?
- Cloud ASR fallback at MVP for accuracy, or strictly on-device to protect the privacy story first?
