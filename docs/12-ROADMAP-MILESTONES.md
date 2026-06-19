# 12 — Roadmap & Milestones

> Phased so each stage ships something usable and de-risks the next. Durations are **relative effort bands**, not promises — calibrate to the actual team ([18](18-TEAM-AND-RESOURCING.md)). Sequencing favors **de-risking the hard tech early** (compositor handoff, FFmpeg HW, MCP loop).

## Phase map (at a glance)

```
P0 Foundations  ─►  P1 MVP (Smallest Lovable)  ─►  P2 V1 Launch  ─►  P3 V2 Pro+AI  ─►  P4 Scale
  spikes/tech       editable rough cut + Cue       motion+craft+      expressions,      mobile/web,
  validation        + captions + export            graph editor +     tracking, gen-AI, marketplace,
                                                    AI core + polish   collaboration     teams
```

## P0 — Foundations & spikes (de-risk before building wide)

**Goal:** prove the architecture's risky assumptions; build the skeleton.

**Must validate (the spikes from [05](05-TECH-STACK.md)):**
1. **Native wgpu → WebView present** (compositor handoff). *Highest risk.*
2. **FFmpeg HW decode/encode** across NVIDIA/AMD/Intel/Apple + fallback.
3. **Command core + undo/redo** round-trip and `.kxp` save/load.
4. **MCP sidecar ↔ core** loop: a single tool (`timeline.split_clip`) driven by Claude end-to-end.
5. **Timeline UI perf** with thousands of clips/keyframes.

**Deliverables:** project skeleton, CI on Win/macOS, decode→display one clip, save/load `.kxp`, one Cue tool working.
**Exit criteria:** all 5 spikes green or a documented pivot. No wide feature work starts until P0 exits.

## P1 — MVP: the "Smallest Lovable Cut" (detailed in [13](13-MVP-SCOPE.md))

**Goal:** a real editor a creator can finish a Short in, with Cue doing the grunt work.

**Scope (headline):**
- Import → multi-track timeline → trim/split/ripple/snapping → playback.
- Transform keyframes + easing presets + on-canvas motion path ([08](08-MOTION-GRAPHICS-ENGINE.md) MVP row).
- Auto-captions (on-device ASR) + editable transcript + caption style presets.
- Silence removal; multi-aspect reframe (9:16/1:1/16:9).
- Core effects/transitions; basic color (LUT + wheels).
- **Cue copilot** via MCP: the "social pass" flow (Flow A, [09](09-AI-FEATURES.md)) — transcribe → silence-cut → captions → reframe → export, all reversible.
- HW export presets, **no watermark**, autosave/recovery.

**Exit criteria:** a non-engineer makes a captioned, silence-cut, multi-aspect Short end-to-end on the reference machine; perf budgets met ([15](15-TESTING-QA-PERFORMANCE.md)); crash-free ≥ 99%; A/V sync within tolerance. **Private beta** here.

## P2 — V1: Launch (craft + AI depth + polish)

**Goal:** the public 1.0 — clearly better than CapCut on craft & trust.

**Adds:**
- **Graph editor** (value + speed), shape layers, masks, **track mattes** ([08](08-MOTION-GRAPHICS-ENGINE.md) V1).
- **Animation presets + `.kxt` templates + brand kits** (seed library — see content plan below).
- Transcript-based editing (Descript-style), filler-word removal, auto-chapters.
- Audio: ducking, loudness normalization, noise reduction.
- Color: scopes, color-managed pipeline, background removal/chroma key.
- Cue V1 skills: rough-cut-from-raw, punch-up-the-hook, title generation, color-match.
- Proxies/optimized media; in-app screen/webcam capture.
- **Plugin SDK (v1)** + documented MCP tool surface for third parties.
- Onboarding, templates gallery, polish, accessibility pass.

**Exit criteria:** public launch quality — stability, performance, a premium template library, the signature Cue demos land, pricing/billing live ([14](14-MONETIZATION-BUSINESS.md)). **Public 1.0.**

## P3 — V2: Pro power + generative AI + collaboration

**Goal:** widen the moat; pull in motion designers and small studios.

**Adds:**
- **Expressions engine** + driven rigs ([08](08-MOTION-GRAPHICS-ENGINE.md) V2, ADR-009).
- Motion tracking, auto-reframe with subject tracking, particles/generators.
- Beat-synced cuts, long→short auto-repurpose, multi-language captions/translation.
- Generative (opt-in, consented): b-roll/image fill/object removal/sky replace; TTS voices.
- Collaboration: cloud sync (opt-in), comments/review, shared brand libraries (teams tier).
- Template/plugin **marketplace** (beta).

**Exit criteria:** designers build broadcast-grade motion in-app; studios adopt brand/collab; marketplace seeded.

## P4 — Scale: reach & ecosystem

**Goal:** distribution to rival CapCut's footprint where it matters.

**Adds:**
- **Mobile companion** (capture, quick edits, review, handoff to desktop) — timing decision below.
- **Web companion** (light edits, review, share).
- Real-time multiplayer editing (CRDT path designed in from [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)).
- Cloud render farm (optional), enterprise/teams, marketplace GA, HDR/log pipeline.

## Milestones & gates (summary table)

| Milestone | Stage | Hard gate |
|---|---|---|
| M0 Spikes green | P0 | All 5 technical spikes validated |
| M1 Editable rough cut | P1 | Timeline + playback + save/load |
| M2 Cue social-pass | P1 | Flow A works end-to-end via MCP, reversible |
| M3 MVP beta | P1 | Non-engineer finishes a Short; budgets met |
| M4 Graph editor + templates | P2 | Motion craft beats CapCut visibly |
| M5 V1 launch | P2 | Stability + pricing + premium library |
| M6 Expressions + tracking | P3 | AE-class motion + auto-reframe |
| M7 Collaboration + marketplace | P3 | Teams + ecosystem live |
| M8 Mobile/web + multiplayer | P4 | Reach + real-time collab |

## Content & template plan (parallel workstream)

Craft credibility needs **content**, not just engine. Run a motion-design content track from P1→P2:
- Seed **animation presets** (entrances, emphasis, text animators) using the app's easing language.
- Seed **`.kxt` templates**: lower-thirds, callouts, intros/outros, end-cards, subscribe stings, captions styles — all brand-adaptable.
- Partner with motion designers; seed the marketplace before GA.
- AI-assisted template generation (Cue) to scale the library.

## Cross-cutting workstreams (run every phase)

- **Performance & QA** ([15](15-TESTING-QA-PERFORMANCE.md)) — budgets enforced from P0.
- **Privacy & security** ([16](16-SECURITY-PRIVACY.md)) — consent model in from P1.
- **Licensing/legal** — FFmpeg/codec royalties, fonts, stock, AI provenance ([17](17-RISKS-MITIGATIONS.md)).
- **Design system** ([07](07-UI-UX-DESIGN-SYSTEM.md)) — tokens/components maintained continuously.

## Key sequencing decisions (open)

- **Mobile timing:** fast-follow V1 (social loop) vs after desktop traction (focus). *Leaning: after V1 traction; desktop craft is our wedge.*
- **Generative AI in V1 vs V2:** keep V1 about craft + trust; generative in V2 to avoid diluting the privacy story too early.
- **Marketplace timing:** beta in P3 once template tooling is solid.
- **BYOK vs hosted AI billing** affects when paid cloud features land ([14](14-MONETIZATION-BUSINESS.md)).
