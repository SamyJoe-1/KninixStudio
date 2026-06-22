# 00 — Index & Reading Guide

This is the planning package for **Kninix Studio** (codename *Aurora*), an AI-native video editor + motion-graphics suite designed to compete with and surpass CapCut, with a polished GUI and deep **MCP** integration so Claude ("Cue") can act as a hands-on editing copilot.

> **Phase:** Planning only. No code is written yet — by design. These documents are the contract we build against.

## How to read this

**If you have 10 minutes** → read [01 Vision](01-VISION-AND-POSITIONING.md) + [13 MVP Scope](13-MVP-SCOPE.md).

**If you are an investor / stakeholder** → 01 Vision → [02 Market](02-MARKET-COMPETITIVE-ANALYSIS.md) → [14 Monetization](14-MONETIZATION-BUSINESS.md) → [12 Roadmap](12-ROADMAP-MILESTONES.md).

**If you are an engineer** → [04 Architecture](04-SYSTEM-ARCHITECTURE.md) → [05 Tech Stack](05-TECH-STACK.md) → [06 Video Engine](06-VIDEO-ENGINE.md) → [08 Motion Engine](08-MOTION-GRAPHICS-ENGINE.md) → [10 MCP](10-MCP-INTEGRATION.md) → [11 Data Model](11-PROJECT-FILE-FORMAT-DATA-MODEL.md).

**If you are a designer / motion artist** → [07 UI/UX](07-UI-UX-DESIGN-SYSTEM.md) → [08 Motion Engine](08-MOTION-GRAPHICS-ENGINE.md) → [03 PRD](03-PRODUCT-REQUIREMENTS.md).

**If you are a PM** → [03 PRD](03-PRODUCT-REQUIREMENTS.md) → [13 MVP](13-MVP-SCOPE.md) → [12 Roadmap](12-ROADMAP-MILESTONES.md) → [15 QA](15-TESTING-QA-PERFORMANCE.md).

## Document map

```
docs/
├── 00-INDEX.md                          ← you are here
├── 01-VISION-AND-POSITIONING.md         Why, who, north-star metric, naming
├── 02-MARKET-COMPETITIVE-ANALYSIS.md    CapCut/Premiere/DaVinci/Descript teardown
├── 03-PRODUCT-REQUIREMENTS.md           Personas, JTBD, user stories, feature matrix
├── 04-SYSTEM-ARCHITECTURE.md            Process model, layers, data flow, diagrams
├── 05-TECH-STACK.md                     Choices + Architecture Decision Records
├── 06-VIDEO-ENGINE.md                   Decode → compositor → encode, color mgmt
├── 07-UI-UX-DESIGN-SYSTEM.md            Layout, tokens, components, motion language
├── 08-MOTION-GRAPHICS-ENGINE.md         Keyframes, graph editor, expressions, presets
├── 09-AI-FEATURES.md                    The AI feature catalogue + UX
├── 10-MCP-INTEGRATION.md                MCP server: tools, resources, prompts, safety
├── 11-PROJECT-FILE-FORMAT-DATA-MODEL.md .kxp schema, timeline data model
├── 12-ROADMAP-MILESTONES.md            Phases, milestones, exit criteria
├── 13-MVP-SCOPE.md                      Smallest lovable product
├── 14-MONETIZATION-BUSINESS.md          Tiers, pricing, GTM, unit economics
├── 15-TESTING-QA-PERFORMANCE.md         Test strategy, perf budgets, benchmarks
├── 16-SECURITY-PRIVACY.md               Local-first, consent, data handling
├── 17-RISKS-MITIGATIONS.md              Risk register
├── 18-TEAM-AND-RESOURCING.md            Roles, hiring order, org shape
└── 19-GLOSSARY.md                       Shared vocabulary
```

## Decisions already made (defaults, challengeable)

These are senior-engineer defaults chosen to keep the plan concrete. Each has an ADR in [05-TECH-STACK](05-TECH-STACK.md) and can be revisited at the planning review.

1. **Desktop-first** (Windows + macOS), then web companion, then mobile. CapCut is mobile-led; we win the *pro/creator* desktop seat first, where motion-graphics depth matters.
2. **Tauri shell + Rust core + WebGPU compositor.** Native performance for video, web-tech velocity for UI. (Electron considered & rejected — see ADR-001.)
3. **FFmpeg/libav** for decode/encode with **hardware codecs** (NVENC/AMF/QuickSync/VideoToolbox).
4. **Local-first** project model with an **open `.kxp` format**; cloud is optional sync, never required.
5. **MCP is a first-class surface**, not a bolt-on: the same command layer drives the UI *and* Cue.
6. **No watermark on free exports.** Honesty as a moat against CapCut's paywall creep.

## Open questions parked for review

- Final product name & brand (see [01](01-VISION-AND-POSITIONING.md#naming)).
- Mobile timing: fast-follow vs. wait for desktop traction (see [12](12-ROADMAP-MILESTONES.md)).
- Bring-your-own-key vs. hosted AI billing (see [09](09-AI-FEATURES.md) + [14](14-MONETIZATION-BUSINESS.md)).
- Plugin marketplace revenue share (see [14](14-MONETIZATION-BUSINESS.md)).

## Conventions in these docs

- **MUST / SHOULD / MAY** follow RFC-2119 intent.
- `code font` = identifiers, file names, MCP tool names.
- Diagrams are ASCII so they render anywhere and diff cleanly.
- Each doc ends with **Open questions** so review is structured.
