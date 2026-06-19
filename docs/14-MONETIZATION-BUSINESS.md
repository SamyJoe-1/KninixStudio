# 14 — Monetization & Business

> Business model must reinforce the **trust moat**, not undercut it. CapCut's vulnerability is paywall-creep and watermark surprises; our pricing must feel **honest** — that *is* marketing. Monetize **pro power, AI convenience, and teams**, never basic editing or export.

## Principles

1. **Free tier is genuinely useful** — full manual editing, **no watermark on exports**. This is a wedge against CapCut's biggest goodwill leak.
2. **Charge for leverage, not for the basics** — pro motion/color, AI convenience (hosted cloud AI), teams/collaboration, marketplace.
3. **Transparent & predictable** — no surprise gates mid-export; clear what each tier includes.
4. **Privacy is never a paid feature** — local-first applies to all tiers; you don't pay to keep your footage private.
5. **Bring-your-own-key respected** — power users can plug their own Claude/API key and avoid our AI markup.

## Tiers (proposed)

| Tier | Price (illustrative) | Who | Includes |
|---|---|---|---|
| **Free** | $0 | Maya starting out | Full manual editing, multi-track, keyframes, captions (on-device ASR), core effects, **watermark-free export**, `.kxp`, local-first, on-device AI primitives, **BYOK** for Cue |
| **Pro** | ~$12–18/mo (or annual) | Creator-Operator, Motion-Curious | Everything in Free + **graph editor, shape layers, masks/mattes, expressions, scopes, advanced color, templates library, proxies**, hosted Cue AI credits (generous monthly pool), priority export |
| **Studio / Teams** | ~$25–40/seat/mo | Small studios/agencies | Everything in Pro + **shared brand kits, collaboration/review, shared libraries, cloud sync, SSO, admin, more AI credits, marketplace discounts** |
| **Enterprise** | custom | larger orgs | Teams + security/compliance, on-prem/self-host AI options, SLA, custom integrations |

> Prices are **placeholders** for modeling, pending willingness-to-pay research. Anchor: clearly cheaper than Premiere/AE; competitive with Filmora/Descript; "free that's actually free" undercuts CapCut's goodwill problem.

## What's free vs paid (the honesty line)

**Always free:** manual editing, multi-track, keyframes + easing, on-device captions, silence-cut, core effects/transitions, **watermark-free export**, local-first privacy, `.kxp` ownership, BYOK AI.

**Paid (Pro+):** graph editor & advanced motion, expressions, scopes/advanced color, premium template library, proxies/optimized media, **hosted** Cue AI (so you don't need your own key), batch/priority export, collaboration & teams, marketplace seller tools.

**Never gated:** privacy, ownership of your files, export without watermark.

## AI economics (the tricky part)

Cloud AI (Cue reasoning via Claude, generative features) has real per-use cost. Strategy:

- **On-device AI = free & unlimited** (user's compute): captions, silence/VAD, scene/subject detect, loudness/ducking/NR, beat detect. Covers most "tedium tax" value at zero marginal cost to us.
- **Cloud Cue reasoning & generative = metered.** Two paths offered:
  - **BYOK (Bring Your Own Key):** user supplies their Claude/API key — they pay the provider directly; we charge $0 marginal. Great for pros & privacy folks. Available even on Free.
  - **Hosted credits:** Pro/Studio include a monthly AI credit pool; overage via add-on packs. Convenient, no key setup.
- **Cost guardrails** ([10](10-MCP-INTEGRATION.md)): confirm before expensive ops; show credit cost; rate-limit runaway loops; cache results.

> Decision parked: do we offer **both** BYOK + hosted at launch (recommended) or hosted-only? BYOK protects the privacy/pro narrative and caps our AI cost exposure; hosted maximizes convenience/margin. **Recommendation: both** ([09](09-AI-FEATURES.md)).

## Additional revenue lines

- **Template/plugin marketplace** (P3): creators sell `.kxt` templates, presets, effect plugins; we take a revenue share (open % TBD — keep creator-favorable to seed supply). Reinforces the ecosystem moat.
- **Stock/music** (later): licensed assets store with clean licensing (a CapCut pain point we can do honestly).
- **Cloud render / sync** (later): optional paid cloud services for those who want them — never required.

## Unit-economics sketch (to validate, not gospel)

- **Free user cost ≈ ~$0 to serve** (local-first; no forced cloud; on-device AI on their hardware). This makes a generous free tier *sustainable* — a structural advantage over cloud-render competitors.
- **Pro margin** = subscription − (hosted AI credits used + support + infra). Keep AI usage bounded via on-device defaults + BYOK option.
- **Studio margin** higher (seats + lower relative support); collaboration infra is the main cost.
- **Marketplace** = high-margin rev-share once supply exists.

Key lever: **on-device-first AI keeps COGS low**, which lets Free stay free and Pro stay cheap — directly attacking CapCut's monetization friction.

## Go-to-market (summary; positioning in [01](01-VISION-AND-POSITIONING.md)/[02](02-MARKET-COMPETITIVE-ANALYSIS.md))

- **Beachhead:** Motion-Curious Creator-Operators on desktop who feel CapCut's ceiling + distrust the cloud.
- **Hero asset:** the Flow-A "one-shot social pass" demo + a "make my title premium" graph-editor demo — these travel.
- **Narrative:** *"As easy as CapCut, as powerful as After Effects, with an AI editor that does the boring parts — and your footage never leaves your machine. No watermark. Ever."*
- **Channels:** creator/motion-design communities, YouTube tutorials, comparison SEO ("CapCut alternative, no watermark, private"), template marketplace as a flywheel, design partnerships.
- **Conversion:** Free (watermark-free, on-device AI, BYOK) → Pro (graph editor, templates, hosted AI) → Studio (teams).
- **Trust proof:** publish privacy posture + benchmark comparisons (render speed, A/V sync, motion quality) vs CapCut.

## Pricing risks & responses

| Risk | Response |
|---|---|
| Free tier too generous → weak conversion | Gate **pro craft + hosted AI convenience + teams**, which are the real willingness-to-pay; free stays a loss-leader funded by low COGS |
| AI cloud costs blow up margins | On-device-first + BYOK + credit caps + caching |
| Race-to-bottom vs free CapCut | Don't compete on "free editing" — compete on craft, trust, copilot leverage |
| Codec/font/stock **licensing** costs | Favor royalty-free codecs (AV1/Opus), OS/HW codecs, clearly-licensed assets ([17](17-RISKS-MITIGATIONS.md)) |

## KPIs (business)

- Free→Pro conversion rate; Pro→Studio expansion.
- ARPU, gross margin (watch AI COGS), CAC payback.
- WEPAC ([01](01-VISION-AND-POSITIONING.md)) as the leading retention/engagement signal.
- Marketplace GMV + active sellers (P3+).
- Net revenue retention (teams).

## Open questions

- Final price points (needs willingness-to-pay research).
- BYOK + hosted at launch vs hosted-only (recommend both).
- Marketplace revenue share % (creator-favorable to seed supply).
- One-time-purchase option (à la Final Cut) vs subscription-only — appeals to anti-subscription sentiment but complicates AI/cloud costs. Consider a "perpetual desktop + optional AI subscription" hybrid.
