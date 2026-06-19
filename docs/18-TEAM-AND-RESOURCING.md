# 18 — Team & Resourcing

> What it actually takes to build this. Realistic about the fact that we're combining three hard disciplines — **NLE engineering, real-time GPU/media, and AI product** — plus motion-design craft. Hire to de-risk in order ([12](12-ROADMAP-MILESTONES.md), [17](17-RISKS-MITIGATIONS.md)).

## Disciplines required

| Discipline | Why critical | Rarity |
|---|---|---|
| **Rust systems / media** | Engine, decode/encode, FFmpeg FFI, audio realtime | High |
| **GPU / graphics (wgpu/WGSL)** | Compositor, effects, color, the perf wedge | High |
| **Media/codec specialist** | Sync, VFR, HW codecs, color management | Very high |
| **App/UI engineering (React/TS + Tauri)** | The GUI, timeline, graph editor, perf in UI | Medium |
| **AI/ML + MCP** | Cue orchestration, on-device models, tool design | Medium-high |
| **Product design (UX)** | Progressive-Pro UX, accessibility | Medium |
| **Motion-graphics designer** | Templates, presets, easing taste, demos | Medium |
| **Product management** | Scope discipline (the #1 risk), sequencing | Medium |
| **QA / perf / release eng** | Stability/perf gates, golden frames | Medium |
| **Legal/licensing (fractional)** | Codec royalties, AI/IP, privacy | Fractional |

## Hiring order (de-risk-driven)

**P0 (spikes) — tiny senior pod (~4–6):**
- 1 Eng lead / architect (Rust + systems).
- 1 GPU/graphics engineer (wgpu) — owns Spike #1 (compositor handoff).
- 1 media/codec engineer (FFmpeg/HW) — owns Spike #2.
- 1 app/UI engineer (Tauri/React) — skeleton + timeline perf spike.
- 1 AI engineer (MCP + Claude) — owns the Cue tool loop spike.
- Fractional: design lead, PM, legal.

> Keep P0 small and senior. The spikes decide the architecture; you want depth, not headcount.

**P1 (MVP) — grow to ~8–12:**
- +1 audio/DSP engineer (sync, silence-cut, ducking).
- +1 motion-graphics designer (presets/easing for MVP, demo polish).
- +1 product designer (onboarding, Progressive-Pro).
- +1 QA/perf engineer (budgets, golden frames, corpus).
- PM full-time (scope guardrails).

**P2 (V1) — ~15–22:**
- +Graphics/effects engineers (graph editor, masks/mattes, scopes, color).
- +AI engineers (V1 Cue skills, on-device models).
- +2–3 motion designers (template/preset library — content is a workstream).
- +Frontend engineers (graph editor UI, accessibility).
- +Plugin-SDK / DX engineer.
- +Release/build/security engineer.

**P3+ (V2/scale) — ~25–40+:**
- Collaboration/backend (sync, teams), marketplace, mobile/web pods, growth/marketing, support, more designers.

## Org shape (as it grows)

```
Founders / leadership
├── Engine team        (Rust core, media, audio, export)        ← the moat's foundation
├── Graphics team      (compositor, effects, color, motion eng)  ← the craft
├── App/UI team        (Tauri/React, timeline, graph editor, a11y)
├── AI team            (Cue, MCP, on-device models)              ← the differentiator
├── Design team        (product UX + motion-graphics content)    ← taste + templates
├── QA/Platform        (perf, golden frames, release, security)
└── GTM/Business       (PM, marketing, growth, support, legal)   ← grows later
```

The **Engine + Graphics + AI** trio is the irreplaceable core; **Design (motion content)** is what makes the craft *visible*; **QA/Platform** is what makes it *trustworthy*.

## Build vs buy decisions

| Component | Lean | Why |
|---|---|---|
| Decode/encode | **Buy** (FFmpeg) | Don't reinvent codecs |
| Compositor/effects | **Build** (wgpu) | This is the craft moat |
| Motion engine | **Build** | Core differentiation vs CapCut |
| ASR / on-device models | **Buy/integrate** (open models) | Mature; integrate not invent |
| LLM reasoning | **Buy** (Claude) | Best-in-class; wrap via MCP |
| Crash/telemetry | **Buy** (privacy-first) | Solved problem |
| Color science | **Build on standards** | Use known transforms/LUTs |
| Templates/content | **Build + partner + AI-assist** | Library is a flywheel |

## Critical hires (the ones that gate everything)

1. **GPU/graphics engineer** — owns the highest-risk spike; without this, no smooth preview.
2. **Media/codec engineer** — sync/VFR/HW codecs; without this, no trust.
3. **Eng lead/architect** — holds the command-core design that unifies UI + AI.
4. **Senior motion-graphics designer** — turns the engine into demos that sell.

These four can be the difference between a tech demo and a product. Consider top contractors/consultants to accelerate spikes if FTEs are slow to find ([17](17-RISKS-MITIGATIONS.md) R13).

## Ways of working

- **Phase gates** with hard exit criteria ([12](12-ROADMAP-MILESTONES.md)); no wide build before P0 spikes pass.
- **Dogfooding**: edit our own marketing/tutorial videos in the product from MVP on.
- **Design+Eng paired** on the motion engine (taste needs to meet implementation).
- **Perf/QA budgets owned by everyone**, enforced in CI ([15](15-TESTING-QA-PERFORMANCE.md)).
- **Small senior teams early**, scale only after architecture is proven.

## Budget shape (qualitative)

- Capital-intensive pre-revenue (R17): senior salaries, GPU/test hardware, codec/licensing, AI usage during dev.
- Keep burn lean by staying small through P0–P1; scale headcount only post-MVP validation.
- On-device-first AI keeps ongoing COGS low ([14](14-MONETIZATION-BUSINESS.md)), which favors a leaner long-term org than cloud-render competitors.

## Open questions

- In-house vs contractor for the P0 spikes (speed vs continuity).
- Where to base the team given the rarity of Rust+GPU+media talent (hub vs remote-first).
- How big a motion-design content team to fund pre-launch (library thinness is R10).
- Fractional vs full-time legal given codec/AI/privacy complexity.
