# 09 — AI Features ("Cue")

> CapCut's AI is **isolated buttons**. Ours is **Cue** — a project-aware copilot (Claude via MCP, [10](10-MCP-INTEGRATION.md)) that understands the whole timeline and *performs reversible edits*. Plus a set of on-device "primitives" so the magic also works **offline and privately**.

## Philosophy

1. **Copilot, not autopilot.** Cue *proposes* a plan and executes reversible commands; the human stays in control. Every Cue action is one-click undoable and labeled.
2. **Project-aware.** Cue reads the timeline, media, transcript, and selection — so "make the intro punchier" means something.
3. **Local-first by default.** Privacy-sensitive primitives (speech-to-text, silence/voice detection, scene detection, face/subject detection) run **on-device** where feasible. Cloud LLM reasoning is **opt-in and consented** ([16](16-SECURITY-PRIVACY.md)).
4. **Explainable.** Cue tells you what it did and why ("Removed 14 gaps > 0.6s, total 48s trimmed").
5. **Taste-aware.** AI output respects the brand kit and the app's motion language ([07](07-UI-UX-DESIGN-SYSTEM.md), [08](08-MOTION-GRAPHICS-ENGINE.md)).

## Two layers of AI

```
┌─────────────────────────────────────────────────────────────┐
│  CUE (reasoning/orchestration) — Claude via MCP              │
│  understands intent, plans, calls editing tools, explains    │
└───────────────────────────┬─────────────────────────────────┘
                            │ uses
┌───────────────────────────▼─────────────────────────────────┐
│  PRIMITIVES (perception/transforms) — mostly on-device        │
│  ASR · VAD/silence · scene cut · subject/face detect ·       │
│  loudness · beat detect · bg-removal/matte · upscale ·       │
│  (cloud generative: image/video/voice — opt-in)              │
└──────────────────────────────────────────────────────────────┘
```

Cue is the brain; primitives are the senses and hands. Many primitives are usable directly as buttons too (so non-AI-trusting users still benefit), but Cue is what *composes* them into outcomes.

## AI feature catalogue

Legend: **[MVP] [V1] [V2] [Later]** · `device` = on-device default · `cloud` = needs network (consented).

### Captions & transcript
- [MVP] `device` **Auto-captions** (speech-to-text) with editable transcript, word timing.
- [MVP] **Caption styling** (karaoke/word-highlight presets, [08](08-MOTION-GRAPHICS-ENGINE.md)).
- [V1] **Transcript-based editing** (Descript-style): delete words in transcript → deletes video; find/replace cuts.
- [V2] `cloud/device` **Translate captions** to other languages; dubbing later.
- [V2] **Auto-chapters** from transcript (great for educators/long-form).

### Cut & pacing
- [MVP] `device` **Silence removal** (VAD): detect + remove gaps over a threshold, reviewable.
- [V1] `device` **Filler-word removal** ("um/uh/like"), reviewable.
- [V1] **Rough-cut from raw footage**: Cue assembles a first cut from selects + transcript ("make a 60s Short from this 12-min clip").
- [V2] `device` **Beat-synced cuts**: align cuts/transitions to detected music beats.
- [V2] **Long→short repurpose**: find the best clippable moments in long-form → multiple shorts (Opus-Clip-style, but in-editor and editable).

### Framing & visual
- [MVP] **Multi-aspect reframe**: 16:9 → 9:16 / 1:1 / 4:5 export-ready versions in one pass.
- [V1] `device` **Auto-reframe with subject tracking**: keep the subject centered when reframing ([08](08-MOTION-GRAPHICS-ENGINE.md) tracking).
- [V1] `device` **Background removal / matte** (person segmentation), chroma key assist.
- [V1] **Color match**: match the look/exposure of one shot to another; auto white-balance/exposure.
- [V2] `cloud` **Generative b-roll / image fill / object removal / sky replace** (assistive, clearly labeled AI, consented).
- [V2] `device` **Upscale / denoise / stabilize**.

### Audio
- [V1] `device` **Loudness normalization** (LUFS) and **auto-ducking** (lower music under voice).
- [V1] `device` **Noise reduction / de-reverb / voice isolation**.
- [V2] `cloud` **Text-to-speech voices**; voice cloning (strict consent, see [16](16-SECURITY-PRIVACY.md)).
- [V2] `device` **Auto music suggestion** matched to mood/length (with clear licensing).

### Authoring & ideation
- [V1] **"Punch up the hook"**: Cue suggests stronger opening 3 seconds (cut + caption + emphasis animation).
- [V1] **Title/lower-third generation**: Cue writes + animates on-brand titles ([08](08-MOTION-GRAPHICS-ENGINE.md) templates).
- [V2] **Script → storyboard / shot list**; **idea → rough timeline** from a brief.
- [V2] **Thumbnail generation** for the exported video (image model, consented).

## Signature flows (the demos that sell it)

### Flow A — "One-shot social pass" (the viral demo)
> User drops raw footage → *"Make this a 45s Short with captions, cut the dead air, and give me 9:16, 1:1, and 16:9."*
Cue: transcribe → select best 45s → silence-cut → captions (brand style) → reframe ×3 → queue export. Reports each step; every step undoable.

### Flow B — "Make my title premium"
> Select generic title → *"Animate it sliding up with a spring and a soft glow, on-brand."*
Cue: applies template/keyframes + glow, binds brand colors/font → hands editable keyframes to the graph editor.

### Flow C — "Tighten this tutorial"
> 40-min screen recording → *"Remove silences and filler words, add chapters and captions."*
Cue: VAD + filler removal + transcript chapters + captions → review view with all proposed cuts.

## Cue UX (in the panel, [07](07-UI-UX-DESIGN-SYSTEM.md))

- **Plan-first:** Cue shows the steps before doing big operations ("I'll do 1,2,3 — proceed?").
- **Action cards:** each executed step is a card with a summary + **Undo** + **Tweak** (open the relevant panel).
- **Streaming + cancel:** long operations stream progress and are cancellable.
- **Grounded answers:** Cue references actual project facts ("Clip 4, 00:03:12") not vague claims.
- **Voice (V2):** speak commands; hands-free editing.
- **Suggestions:** Cue can proactively offer ("This clip has 22s of silence — trim it?") but never acts unbidden.

## On-device vs cloud (decision matrix)

| Primitive | Default | Cloud option | Rationale |
|---|---|---|---|
| ASR (captions) | device | cloud (higher accuracy/lang) | privacy + offline |
| Silence/VAD | device | — | fast, private |
| Scene/subject/face detect | device | — | privacy of footage |
| Loudness/ducking/NR | device | — | deterministic DSP |
| Beat detection | device | — | local |
| Cue reasoning/planning | cloud (Claude) | (local LLM later) | needs strong reasoning |
| Generative image/video/voice | cloud | — | model size/quality |
| Translation | device-small / cloud | cloud | quality vs privacy |

Cloud features are **off until consented**, per-action transparent, with a clear indicator and a global "stay fully local" mode.

## Billing & limits (summary; full in [14](14-MONETIZATION-BUSINESS.md))

- On-device AI: unlimited, free (it's the user's compute).
- Cloud AI (Cue reasoning, generative): metered. Options under review: **bring-your-own-Claude-key**, or hosted credits in paid tiers. Likely **both** (BYOK for pros/privacy, hosted for convenience).

## Safety, quality & trust

- **Reversibility:** every AI edit is a command on the undo stack ([04](04-SYSTEM-ARCHITECTURE.md)).
- **Labeling:** AI-generated/altered media is clearly marked in the UI; export metadata can note AI assistance (configurable).
- **Consent for likeness/voice:** voice cloning / face edits require explicit confirmation; we follow a strict consent policy ([16](16-SECURITY-PRIVACY.md)).
- **No training on user footage** without explicit opt-in; default is **never** ([16](16-SECURITY-PRIVACY.md)).
- **Graceful failure:** if a primitive is unsure (low-confidence captions, ambiguous subject), Cue flags it for review rather than silently committing.

## Open questions

- BYOK vs hosted credits (or both) for cloud AI — pricing + UX ([14](14-MONETIZATION-BUSINESS.md)).
- Which on-device ASR model (accuracy/size/license/languages)?
- How proactive should Cue be by default (suggestion frequency) without being annoying?
- Generative features: which providers, and how to label/watermark AI media responsibly?
