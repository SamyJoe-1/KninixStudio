# 16 — Security & Privacy

> Privacy is our **core differentiator and moat** ([01](01-VISION-AND-POSITIONING.md), [02](02-MARKET-COMPETITIVE-ANALYSIS.md)) — the one thing CapCut structurally can't easily match. So this is not a compliance afterthought; it's a product pillar. The promise: **your footage and your project stay on your machine unless you explicitly choose otherwise.**

## Privacy principles (the promise)

1. **Local-first by default.** All editing, on-device AI, and rendering happen locally and offline. No upload required to use the product.
2. **No footage leaves the device without explicit, specific, remembered consent.** Per-action transparency for anything cloud.
3. **A true "Fully Local" mode** that hard-disables every network/cloud feature — verifiable, not just a toggle.
4. **No training on user content** without explicit opt-in. Default = **never**.
5. **Data minimization.** We collect the least; telemetry is opt-in, aggregate, and never includes media.
6. **You own your files.** Open `.kxp` ([11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md)); export without watermark; no lock-in.
7. **Transparency.** Clear, plain-language data flows; AI-altered media is labeled.

## Data classification

| Class | Examples | Default handling |
|---|---|---|
| **Media (most sensitive)** | user footage, audio, images | **On device only.** Never uploaded unless a consented cloud feature needs it. |
| **Derived analysis** | transcripts, silence maps, scene/subject data | On device (cache); leaves only if cloud feature used + consented |
| **Project (`.kxp`)** | timeline, edits, brand kit | On device; cloud sync is opt-in (Studio tier) |
| **Account** | email, license, billing | Minimal; standard secure handling if cloud account exists |
| **Telemetry/crash** | aggregate usage, crash traces | **Opt-in**, aggregate, **no media**, scrubbed |
| **AI prompts/context** | text sent to Claude for Cue reasoning | Only with consent; minimized; see AI section |

## Consent model (how cloud AI is gated)

- **Off until consented.** Cloud Cue reasoning and generative features are disabled until the user opts in — with a plain explanation of *what is sent* (e.g., "the timeline structure and transcript text — not your video pixels — go to Claude to plan edits").
- **Granular & remembered.** Separate consents for: (a) cloud LLM reasoning, (b) cloud ASR/translation, (c) generative media, (d) publishing to platforms. Each remembered, each revocable.
- **Per-action transparency** ([10](10-MCP-INTEGRATION.md)): the UI indicates when an action uses the cloud and what it sends; large/expensive ops confirm first.
- **Data minimization for Cue:** by default Cue gets **metadata and text** (timeline JSON, transcript), **not raw frames**. Tools that genuinely need a frame (e.g., a generative fill) request that specific frame with explicit consent.
- **BYOK option** ([14](14-MONETIZATION-BUSINESS.md)): with the user's own key, data goes directly to their provider under their account/terms — we're not in the loop.

## "Fully Local" mode (verifiable)

- A global mode that **hard-disables** all network egress for AI/cloud/publish/sync — only on-device primitives remain (captions, silence-cut, detection, DSP).
- Designed to be **verifiable** (e.g., no outbound connections; documented; ideally externally auditable). This is a marketing-grade trust claim, so it must be literally true.

## AI-specific privacy & ethics

- **No training on user content** by default; opt-in only, clearly explained, revocable, and never required for features.
- **Provenance/labeling:** AI-generated or AI-altered media is labeled in-app; export can embed provenance metadata (e.g., content-credentials style) — configurable.
- **Likeness & voice consent:** voice cloning / face manipulation require explicit, affirmative confirmation that the user has rights/consent; we refuse obvious abuse patterns. ([09](09-AI-FEATURES.md))
- **Prompt/data retention:** for hosted AI, define and disclose retention; prefer zero/short retention; never use footage for training.

## Application security

- **Capability-scoped Tauri** ([05](05-TECH-STACK.md)): the WebView/UI can't touch arbitrary FS/OS; explicit allow-lists.
- **Plugin sandbox** ([04](04-SYSTEM-ARCHITECTURE.md)): third-party effects/panels/exporters run with declared capabilities only — no raw FS/network by default; signed/reviewed for marketplace.
- **MCP safety** ([10](10-MCP-INTEGRATION.md)): sidecar enforces consent gate, capability scoping (read/edit/export), rate limits, and an audit log; external MCP clients require user-approved attach with scoped permissions; localhost-only + auth for external transport.
- **Supply chain:** dependency pinning, SBOM, vulnerability scanning, reproducible builds where possible; code signing of releases; verified updater (signed updates, anti-tamper).
- **Input hardening:** fuzz `.kxp` and media parsers ([15](15-TESTING-QA-PERFORMANCE.md)); treat all media as untrusted; isolate decoders (a malicious file must not own the app).
- **Secrets:** API keys (BYOK) stored in the OS secure store (Keychain/Credential Manager), never in plaintext project files.
- **Crash/telemetry pipeline:** scrub paths/PII, never transmit media, opt-in, self-hosted or privacy-respecting vendor.

## Compliance & legal posture

- **GDPR/CCPA-aligned:** lawful basis, data-subject rights (access/delete/export), DPA for any cloud processing, clear privacy policy.
- **Children/young users:** age-appropriate handling consistent with platform rules.
- **Licensing hygiene** (security-adjacent trust): FFmpeg/codec royalties, fonts, stock, and AI-model licenses tracked ([05](05-TECH-STACK.md), [17](17-RISKS-MITIGATIONS.md)).
- **Jurisdiction/trust narrative:** be explicit about where any cloud data is processed and under whose terms — directly answering the geopolitical-trust concerns that dog CapCut.

## Threat model (sketch)

| Threat | Mitigation |
|---|---|
| Malicious media file exploits decoder | Sandboxed/isolated decode, fuzzing, untrusted-input posture |
| Malicious plugin exfiltrates footage | Capability sandbox, no default FS/network, signing/review |
| Rogue MCP client edits/exports/exfiltrates | Scoped attach approval, consent gate, audit log, rate limits |
| Cloud feature leaks more than intended | Data minimization (text/metadata not pixels), per-action transparency, Fully-Local mode |
| Compromised update channel | Signed updates, verified updater, reproducible builds |
| Secret/key theft | OS secure store, never in `.kxp`, no plaintext logging |
| Telemetry over-collection | Opt-in, aggregate, no media, scrubbed, documented |

## Privacy as product (make the promise visible)

- Onboarding states the local-first promise plainly.
- A persistent indicator shows when anything is using the cloud.
- Publish the privacy posture + "Fully Local" verification; consider third-party audit. Trust claims must be *demonstrable*, because the whole positioning rests on them.

## Open questions

- Self-hosted vs vendor for telemetry/crash (must be privacy-first either way).
- Default AI consent copy + granularity — needs legal + UX review.
- Provenance standard to adopt for AI media labeling (e.g., content credentials).
- Third-party privacy audit before public launch — when and by whom.
- Retention terms for hosted AI prompts (target: minimal/zero, no training).
