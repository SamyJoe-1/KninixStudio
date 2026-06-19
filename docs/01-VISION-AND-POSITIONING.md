# 01 — Vision & Positioning

## North star

> **Make professional-quality motion editing feel as effortless as a conversation — without giving up ownership of your work or your footage.**

We are building the editor where a first-timer ships a clean captioned reel in 5 minutes, *and* a motion designer builds a broadcast-grade animated title with a graph editor and expressions — in the **same** app, with an **AI copilot** that can do the tedious 80% on command.

## The problem we attack

1. **The skill cliff.** CapCut/Reels-tier tools are easy but shallow; Premiere/After Effects are powerful but brutal to learn. There is no tool that scales smoothly from "drag a clip" to "drive a graph editor."
2. **The trust gap.** Creators increasingly distrust where their footage goes (cloud processing, telemetry, training data, shifting Terms of Service, content-licensing disputes, and geopolitical bans). They want **local-first** and **own-your-files**.
3. **The tedium tax.** 80% of editing is mechanical: cutting silence, syncing captions, color-matching shots, resizing for platforms, beat-syncing cuts. This is *exactly* what an AI copilot should absorb — but today's "AI features" are isolated buttons, not an assistant that understands the whole project.

## Our answer

A desktop-first editor with three differentiating pillars:

### Pillar 1 — Depth without the cliff ("Progressive Pro")
A single UI that reveals complexity on demand. Default view is CapCut-simple. A **Pro toggle** unlocks graph editor, expressions, node-based effects, scopes, and color-management. Same project, no re-learning, no second app.

### Pillar 2 — Cue, the AI copilot (Claude via MCP)
Not buttons — a **collaborator**. You can say *"cut the dead air, add captions in our brand style, and make a 9:16 version for Shorts,"* and Cue performs real, reversible edits on your timeline through the same command layer the UI uses. See [10-MCP-INTEGRATION](10-MCP-INTEGRATION.md).

### Pillar 3 — Local-first & open
Your media stays on your machine by default. The project file (`.kxp`) is an **open, documented, diffable format**. Cloud is *opt-in sync*, AI is *opt-in and consented per action*. No watermark on free exports. This is both an ethic and a moat — it is the one thing the incumbents structurally cannot copy quickly.

## Positioning statement

> **For** creators and small teams who have outgrown CapCut but don't want After Effects,
> **Kinetix Studio is** an AI-native video & motion-graphics editor
> **that** delivers pro depth with a friendly UI and an AI copilot that actually does the work,
> **unlike** CapCut (shallow, cloud-leaning, paywall-creeping) and Premiere/AE (powerful but punishing),
> **because** we pair a real motion engine with a conversational copilot and a local-first, own-your-work model.

## Who we serve (priority order)

1. **The Creator-Operator** — solo/duo running a YouTube/TikTok/IG presence. Volume editing, wants speed + polish + captions + multi-aspect export. *Primary ICP.*
2. **The Motion-Curious Editor** — competent in CapCut/Premiere basics, frustrated by the ceiling on titles/animation. Wants graph editor and presets without AE.
3. **The Small Studio / Agency** — 2–10 people, brand templates, shared asset kits, consistency, client deliverables. Wants templates + collaboration + brand kits.
4. **The Educator / Course Creator** — long-form, screen-recordings, talking head, needs silence-cut, captions, chaptering.

Explicitly **not** day-one targets: Hollywood color finishing (DaVinci's turf), broadcast NLE switching workflows, 3D compositing (Nuke/Blender). We may touch these later; we don't anchor on them.

## North-star metric & guardrails

- **North-star:** *Weekly Exported Projects per Active Creator (WEPAC).* It captures "people finishing real work," which is the only thing that compounds.
- **Input metrics:** time-to-first-export (onboarding), Cue-assisted edit acceptance rate, % projects using Pro features (depth adoption), 7-day retention.
- **Guardrail metrics:** crash-free session rate, render success rate, export A/V-sync defects, privacy incidents (must be 0).

## Brand & tone

- **Voice:** calm, competent, a little playful. We respect the user's craft and time.
- **Cue's persona:** a sharp assistant editor — proactive, never pushy, always reversible, explains what it did. Cue *proposes*; the user *disposes*.
- **Motion language:** confident, springy-but-controlled easing; nothing janky. The app itself should feel like good motion design (see [07-UI-UX](07-UI-UX-DESIGN-SYSTEM.md#motion-language)).

## <a name="naming"></a>Naming (open)

Working name: **Kinetix Studio**. The product needs a name that signals *motion + intelligence + ownership*, is short, pronounceable globally, and has trademark + domain headroom.

| Candidate | Read | Risk |
|---|---|---|
| **Kinetix** | motion/energy | possible TM collisions in tech |
| **Lumio** | light/clarity | generic-ish |
| **Clypse** | "clip" + eclipse | spelling friction |
| **MotionForge** | descriptive, pro | long |
| **Cutline** | editorial, crisp | journalism term |
| **Kino** | film heritage | very common word |

**Decision:** parked. Run trademark + domain + app-store name search before MVP marketing. Use "Kinetix Studio" internally until then. AI copilot persona **"Cue"** is retained regardless of product name.

## What "beating CapCut" concretely means (success definition)

We are not trying to beat CapCut's *install count* in year one. We win by being the obvious upgrade:

1. **Craft win:** a motion designer can build something in Kinetix they *cannot* build in CapCut.
2. **Speed win:** a creator finishes a routine reel at least as fast as CapCut, with Cue doing the grunt work.
3. **Trust win:** a privacy-conscious creator chooses us *because* of local-first + no watermark.
4. **Retention win:** WEPAC and 7-day retention beat CapCut benchmarks within the target segment.

## Open questions

- Final brand name & visual identity — needs legal + market test.
- Do we lead marketing with "AI copilot" or "own your work / privacy"? (Hypothesis: privacy as trust anchor, AI as wow.)
- How loudly do we position against CapCut by name vs. category? (Likely category-first publicly, CapCut-comparison in SEO/landing.)
