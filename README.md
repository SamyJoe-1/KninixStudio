# Kinetix Studio

> **Working name:** Kinetix Studio · **Codename:** Aurora · **AI Copilot:** "Cue" (powered by Claude via MCP)
>
> A pro-grade, AI-native, privacy-first video editor and motion-graphics suite built to out-class CapCut on craft, control, and trust — while staying as fast and friendly to start as CapCut is.

---

## The one-paragraph pitch

CapCut won the world by being *free, fast, and friendly*. It loses on *control, ownership, privacy, and pro motion design*. **Kinetix Studio** keeps the 60-second onboarding and "it just works" templates, then adds a real keyframe/graph-editor motion engine (After-Effects-class), a GPU compositor for true real-time preview, a **local-first** project model you actually own, and a first-class **MCP integration** that turns Claude into a hands-on editing copilot ("Cue") that can cut, caption, color, and animate by instruction. You get the easy button *and* the pro panel — without sending your footage to someone else's cloud unless you ask.

---

## Why this can win (the wedge)

| Axis | CapCut today | Kinetix Studio |
|---|---|---|
| Onboarding speed | Excellent | Match it (templates + auto-everything) |
| Pro motion graphics | Shallow (no graph editor, weak keyframing) | **Deep** — graph editor, expressions, shape layers, mattes |
| Real-time preview | Good on short clips | **GPU compositor**, scales to 4K multi-layer |
| AI assistance | Feature buttons | **Conversational copilot** that *performs* edits (MCP) |
| Privacy / ownership | Cloud-leaning, telemetry concerns, licensing disputes | **Local-first**, open project format, no forced upload |
| Extensibility | Closed | **Plugin SDK + open `.kxp` format + MCP tools** |
| Pricing honesty | Creeping paywalls, watermark surprises | Transparent tiers, **no watermark on free exports** |

The strategic bet: **"as easy as CapCut, as powerful as After Effects, with an AI editor that does the boring parts."**

---

## What's in this repository (planning phase)

This repo currently contains **planning only — no code yet** (per the brief). Everything lives in [`docs/`](docs/00-INDEX.md).

Start here → **[docs/00-INDEX.md](docs/00-INDEX.md)**

| # | Document | What it covers |
|---|---|---|
| 00 | [Index & Reading Guide](docs/00-INDEX.md) | How to navigate the plan |
| 01 | [Vision & Positioning](docs/01-VISION-AND-POSITIONING.md) | Why we exist, who we serve, north-star |
| 02 | [Market & Competitive Analysis](docs/02-MARKET-COMPETITIVE-ANALYSIS.md) | CapCut teardown + gaps we exploit |
| 03 | [Product Requirements (PRD)](docs/03-PRODUCT-REQUIREMENTS.md) | Personas, user stories, feature matrix |
| 04 | [System Architecture](docs/04-SYSTEM-ARCHITECTURE.md) | Layers, processes, data flow |
| 05 | [Tech Stack & Decisions](docs/05-TECH-STACK.md) | Tauri + Rust + WebGPU rationale, ADRs |
| 06 | [Video Engine](docs/06-VIDEO-ENGINE.md) | Decode/compositor/encode pipeline |
| 07 | [UI/UX & Design System](docs/07-UI-UX-DESIGN-SYSTEM.md) | Layout, design tokens, motion language |
| 08 | [Motion-Graphics Engine](docs/08-MOTION-GRAPHICS-ENGINE.md) | Keyframes, graph editor, expressions, presets |
| 09 | [AI Features](docs/09-AI-FEATURES.md) | Captions, silence-cut, b-roll, color, scripts |
| 10 | [MCP Integration](docs/10-MCP-INTEGRATION.md) | Claude-as-copilot tool/resource design |
| 11 | [Project File Format & Data Model](docs/11-PROJECT-FILE-FORMAT-DATA-MODEL.md) | `.kxp` schema, timeline model |
| 12 | [Roadmap & Milestones](docs/12-ROADMAP-MILESTONES.md) | Phased delivery, 0→1→pro |
| 13 | [MVP Scope](docs/13-MVP-SCOPE.md) | The smallest lovable cut |
| 14 | [Monetization & Business](docs/14-MONETIZATION-BUSINESS.md) | Tiers, pricing, GTM |
| 15 | [Testing, QA & Performance](docs/15-TESTING-QA-PERFORMANCE.md) | Quality gates, perf budgets |
| 16 | [Security & Privacy](docs/16-SECURITY-PRIVACY.md) | Local-first, data handling, AI consent |
| 17 | [Risks & Mitigations](docs/17-RISKS-MITIGATIONS.md) | What could kill us, and the plan |
| 18 | [Team & Resourcing](docs/18-TEAM-AND-RESOURCING.md) | Roles, org, hiring order |
| 19 | [Glossary](docs/19-GLOSSARY.md) | Shared vocabulary |

---

## Naming (decide later)

Working name **Kinetix Studio** is a placeholder. Candidates to A/B test: *Kinetix, Lumio, Clypse, MotionForge, Cutline, Kino, Vortex*. The AI copilot persona is **"Cue."** Final naming/branding is parked in [01-VISION](docs/01-VISION-AND-POSITIONING.md#naming).

## Status

🟡 **Planning** — no implementation started. Next gate: stakeholder review of this plan, then MVP kickoff per [docs/13-MVP-SCOPE.md](docs/13-MVP-SCOPE.md).
