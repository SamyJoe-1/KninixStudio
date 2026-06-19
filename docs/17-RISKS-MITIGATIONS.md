# 17 — Risks & Mitigations (Risk Register)

> Honest accounting of what could kill the project, ranked, with mitigations and owners. Reviewed at every milestone gate ([12](12-ROADMAP-MILESTONES.md)). Scoring: **Impact** (1–5) × **Likelihood** (1–5) = **Score**.

## Top risks (scored)

| # | Risk | Imp | Lik | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R1 | **Compositor handoff** (native wgpu → WebView) is slow/fragile → poor preview perf | 5 | 3 | 15 | P0 Spike #1 before any wide build; fallback to native render surface or reconsider shell ([05](05-TECH-STACK.md)) | Eng lead |
| R2 | **Performance on modest hardware** falls short → loses the wedge | 5 | 3 | 15 | HW codecs, proxies, render/frame caches, perf budgets as hard gates ([06](06-VIDEO-ENGINE.md),[15](15-TESTING-QA-PERFORMANCE.md)) | Engine |
| R3 | **Scope explosion** (we're building 3 hard products: NLE + motion engine + AI) | 5 | 4 | 20 | Ruthless MVP ([13](13-MVP-SCOPE.md)); phase gates; WON'T lists; one hero flow first | PM |
| R4 | **Codec/FFmpeg licensing & royalties** (H.264/H.265/AAC patents, GPL) | 4 | 3 | 12 | License-clean LGPL build, isolate GPL, prefer AV1/Opus + OS/HW codecs, legal review ([05](05-TECH-STACK.md),[16](16-SECURITY-PRIVACY.md)) | Legal+Eng |
| R5 | **AI cloud cost** erodes margins / makes Free unsustainable | 4 | 3 | 12 | On-device-first AI, BYOK, hosted credit caps, caching ([09](09-AI-FEATURES.md),[14](14-MONETIZATION-BUSINESS.md)) | PM+Eng |
| R6 | **Cue reliability** (tool-composition errors, bad edits) damages trust | 4 | 3 | 12 | Strong tool contracts, skill prompts for hero flows, reversibility, scenario tests ([10](10-MCP-INTEGRATION.md),[15](15-TESTING-QA-PERFORMANCE.md)) | AI lead |
| R7 | **A/V sync defects** (esp. VFR/29.97) → instant credibility loss | 5 | 2 | 10 | Rational timebase, VFR conform, sync probes as **hard gate** ([06](06-VIDEO-ENGINE.md),[15](15-TESTING-QA-PERFORMANCE.md)) | Engine |
| R8 | **GPU/driver fragmentation** → "works on my machine" rendering bugs | 4 | 3 | 12 | wgpu abstraction, golden-frame matrix per vendor, fallbacks ([15](15-TESTING-QA-PERFORMANCE.md)) | Engine |
| R9 | **Distribution gap vs CapCut** (no TikTok flywheel) | 4 | 4 | 16 | Don't fight on distribution; win the niche (craft/trust/copilot), travel via hero demos + comparison SEO + marketplace flywheel ([02](02-MARKET-COMPETITIVE-ANALYSIS.md),[14](14-MONETIZATION-BUSINESS.md)) | GTM |
| R10 | **Template/content thinness** at launch feels empty vs CapCut | 3 | 4 | 12 | Seed premium library, design partners, AI-assisted templates, marketplace ([08](08-MOTION-GRAPHICS-ENGINE.md),[12](12-ROADMAP-MILESTONES.md)) | Design |
| R11 | **Tauri/WebView inconsistency** across OSes | 3 | 3 | 9 | Pin features, cross-OS CI, native render path for heavy pixels ([05](05-TECH-STACK.md)) | Eng |
| R12 | **CapCut closes the craft gap** (adds graph editor/AI copilot) | 4 | 2 | 8 | Move fast on stacked moats (local-first + open + copilot); they can't easily match privacy/openness ([02](02-MARKET-COMPETITIVE-ANALYSIS.md)) | All |
| R13 | **Hiring** Rust+GPU+media talent is hard | 4 | 3 | 12 | Phased hiring, contractors for spikes, strong eng brand, buy-vs-build on hardest bits ([18](18-TEAM-AND-RESOURCING.md)) | Founders |
| R14 | **Privacy promise broken** (a leak/telemetry slip) destroys the whole thesis | 5 | 2 | 10 | Privacy as architecture not policy, Fully-Local mode, audits, no-media telemetry, gate releases on it ([16](16-SECURITY-PRIVACY.md)) | Security |
| R15 | **Model/version drift** (Claude updates change Cue behavior) | 3 | 3 | 9 | Pin model IDs, prompt regression tests, abstraction over provider, BYOK ([05](05-TECH-STACK.md),[10](10-MCP-INTEGRATION.md)) | AI lead |
| R16 | **Generative-AI legal exposure** (training data, deepfakes, IP) | 4 | 2 | 8 | Vet providers, consent for likeness/voice, provenance labeling, refuse abuse ([09](09-AI-FEATURES.md),[16](16-SECURITY-PRIVACY.md)) | Legal |
| R17 | **Runway/funding** before traction (capital-heavy build) | 5 | 3 | 15 | Tight MVP, beta monetization, milestone-based funding, narrow beachhead | Founders |

## The three risks that most likely kill us (focus here)

1. **R3 Scope** — building an NLE *and* an AE-class motion engine *and* an AI copilot at once. **The single biggest threat.** Antidote: the MVP is one hero flow + a legit-but-minimal editor; everything else is phased.
2. **R1/R2 Performance** — if preview/export aren't smooth on a normal laptop, the "easy + powerful" promise collapses. Antidote: prove the compositor + HW codecs in P0; budgets are hard gates.
3. **R9/R17 Distribution & funding** — we can build something great and still die unseen or unfunded. Antidote: a narrow beachhead, demos that travel, trust narrative, and milestone-gated capital.

## Risk responses by type

- **Technical (R1,R2,R7,R8,R11):** de-risk in **P0 spikes**; budgets/goldens as gates; native paths for hot pixels.
- **Product/scope (R3,R6,R10):** phase gates, WON'T lists, hero-flow focus, content workstream.
- **Business/legal (R4,R5,R9,R16,R17):** royalty-free codec bias, on-device-first economics, niche GTM, legal reviews, lean burn.
- **Trust (R14):** privacy as architecture; verifiable Fully-Local; release-blocking on any leak.
- **Competitive (R12):** speed + stacked moats incumbents can't pivot to quickly.

## Assumptions we're betting on (if wrong, revisit strategy)

- A meaningful segment **distrusts cloud editors** and will pay/switch for local-first + ownership.
- **Motion-graphics depth** is a real unmet need above CapCut and below AE.
- An **action-taking AI copilot** is a 10× workflow win, not a gimmick.
- **On-device AI** is good enough for the high-frequency tedium (captions/silence/detection) to keep COGS low.
- We can reach **acceptable performance on modest hardware** with Tauri+Rust+wgpu.

Each assumption has an early validation point (beta metrics, spikes, willingness-to-pay research).

## Review cadence

- Risk register reviewed at every milestone gate; scores updated; new risks added.
- Any **hard-gate** breach (A/V sync, crash-free, privacy, watermark, migration) blocks release regardless of schedule.

## Open questions

- Buy vs build for the hardest engine pieces (e.g., license a media SDK vs raw FFmpeg)?
- Funding strategy: bootstrap to beta vs raise for a longer runway given capital intensity (R17)?
- How publicly to position against CapCut given their parent's scale (R9/R12)?
