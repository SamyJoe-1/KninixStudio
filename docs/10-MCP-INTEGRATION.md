# 10 — MCP Integration (Claude as a hands-on editing copilot)

> This is the headline architectural feature: a **Model Context Protocol (MCP)** server that exposes Kinetix's editing capabilities as **tools** and the project state as **resources**, so **Claude ("Cue") can actually perform edits** — and so third-party agents/automation can drive the editor too. The same command layer powers the GUI and MCP ([04](04-SYSTEM-ARCHITECTURE.md)), guaranteeing AI edits are as powerful and reversible as human ones.

## What MCP gives us

- **Cue can *do*, not just *say*.** Instead of describing how to cut silence, Cue calls `timeline.remove_ranges` and it happens — reversibly.
- **One surface, two consumers.** Tools map to core Commands; GUI and AI share them. No "AI-only" half-baked path.
- **Automatable & extensible.** External MCP clients (other agents, scripts, CI for video) can attach to a project. Kinetix becomes *programmable*.
- **Auditable & safe.** A single chokepoint to enforce consent, rate limits, validation, and an action log.

## Topology

```
┌────────────┐   MCP (stdio/ws)   ┌────────────────────┐   IPC    ┌──────────────────┐
│  Claude /   │◄──────────────────►│  KINETIX MCP SERVER │◄────────►│  CORE COMMAND     │
│  Cue client │   tools/resources  │  (local sidecar)    │ commands │  DOCUMENT (Rust)  │
└────────────┘                     │  • tool registry    │          │  validate+apply+  │
        ▲                          │  • consent gate     │          │  undo + diffs     │
        │ also usable by           │  • rate limit/audit │          └─────────┬────────┘
        │ external MCP clients     │  • resource serializer        UI reflects │ diffs
        └──────────────────────────┴────────────────────┘◄───────────────────┘
```

- **Sidecar process** ([ADR-007](05-TECH-STACK.md)): isolation + the ability for external clients to attach to a running editor session.
- **Transport:** MCP over stdio for the embedded Cue; a local socket/ws option for external attach (localhost, authenticated).
- **The editor never blocks on the sidecar**; if it's down, the GUI still works, Cue is just unavailable.

## Resources (read-only context Cue can fetch)

MCP **resources** expose project state so Claude reasons over *actual* facts:

| Resource URI | Content |
|---|---|
| `kxp://project/summary` | name, duration, fps, resolution, aspect, track count, tier |
| `kxp://project/timeline` | full timeline graph (tracks, clips, in/out, layers) as JSON |
| `kxp://project/selection` | currently selected clips/layers/keyframes |
| `kxp://media/library` | imported media list + metadata (no raw pixels) |
| `kxp://media/{id}/transcript` | transcript + word timings (if captioned) |
| `kxp://media/{id}/analysis` | scenes, silence map, loudness, subject tracks (if computed) |
| `kxp://project/brandkit` | fonts, colors, logo for on-brand output |
| `kxp://catalog/effects` | available effects + param schemas |
| `kxp://catalog/templates` | available `.kxt` templates + exposed params |
| `kxp://project/history` | recent commands (what changed, by whom) |

Resources are **read-only** and **privacy-scoped** (metadata, not raw footage, unless a tool explicitly needs a frame).

## Tools (actions Cue can take — each maps to a core Command)

> Naming: `domain.verb_object`. Every tool is **validated**, **reversible** (single undo entry), and returns a **diff summary**. Tools are grouped; this is the day-one surface (expands over time).

### Project & timeline
```
project.get_state()                       → summary
timeline.add_clip(media_id, track, at)    → place media
timeline.move_clip(clip_id, track, at)
timeline.trim_clip(clip_id, in, out)
timeline.split_clip(clip_id, at)
timeline.remove_clip(clip_id)
timeline.remove_ranges(ranges[])          → ripple-delete time ranges (silence-cut)
timeline.add_track(kind)                  → video|audio|text|adjustment
timeline.set_playhead(at)
timeline.add_marker(at, label)
```

### Media & analysis
```
media.import(path)                        → media_id
media.transcribe(media_id)                → transcript (on-device ASR)
media.detect_silence(media_id, threshold) → silence ranges
media.detect_scenes(media_id)             → scene cuts
media.detect_subject(media_id)            → subject/face tracks
```

### Text, captions & titles
```
text.add(track, at, content, style?)      → text layer
text.style(layer_id, style)               → font/size/color/animation preset
captions.generate(from_media_id, style?)  → caption layers from transcript
captions.edit(caption_id, content)
title.from_template(template_id, params)  → animated title (.kxt)
```

### Motion & effects (the craft tools — see [08](08-MOTION-GRAPHICS-ENGINE.md))
```
keyframe.add(layer_id, property, time, value, easing?)
keyframe.set_easing(keyframe_id, easing)
motion.apply_preset(layer_id, preset_id)        → e.g. "slide-up spring"
effect.apply(target_id, effect_id, params)      → glow/blur/color/etc.
effect.set_param(effect_id, param, value|keyframes)
transition.apply(between_clip_a, clip_b, type, duration)
mask.add(layer_id, shape)                        → bezier mask
matte.set(layer_id, source_layer_id, kind)       → alpha|luma
```

### Color & audio
```
color.auto_balance(clip_id)
color.match(source_clip_id, target_clip_id)
color.apply_lut(clip_id, lut_id)
audio.normalize(track_id, target_lufs)
audio.duck(music_track_id, under_track_id, amount)
audio.reduce_noise(clip_id)
```

### Framing & export
```
reframe.auto(aspect, track_subject?)             → reposition/scale for new aspect
sequence.duplicate_as(aspect)                    → multi-aspect variant
export.render(preset, range?)                    → queued export job
export.batch(presets[])                          → multi-aspect/format batch
```

### Meta (control & safety)
```
edit.undo(steps?)          edit.redo(steps?)
edit.checkpoint(label)     → named restore point before a big op
edit.describe_changes()    → human summary of recent Cue actions
```

> **Composition over count:** Cue chains these (e.g., Flow A in [09](09-AI-FEATURES.md) = transcribe → detect_silence → remove_ranges → captions.generate → reframe.auto ×3 → export.batch). We keep tools small, orthogonal, and well-described so the model composes them reliably.

## Tool design principles (so Claude uses them well)

1. **Clear, narrow contracts.** Each tool does one thing; rich descriptions + typed params + examples (the model's accuracy depends on this).
2. **IDs not guesses.** Tools return stable IDs; Cue references them, never invents.
3. **Reversible & atomic.** One tool call = one undo entry; multi-step plans wrap in a `checkpoint`.
4. **Diff in the result.** Every call returns what changed ("removed 14 ranges, 48.2s"), so Cue can report and self-correct.
5. **Validation at the gate.** Invalid ops fail fast with actionable errors the model can recover from.
6. **Idempotency where possible.** Re-running a plan shouldn't double-apply.
7. **Read before write.** Cue fetches resources to ground actions in real state.

## Consent, safety & guardrails

- **Consent gate:** cloud reasoning and any media leaving the device require explicit, remembered consent ([16](16-SECURITY-PRIVACY.md)). A global **"fully local"** mode disables cloud tools.
- **Capability scoping:** external MCP clients get scoped permissions (read-only vs edit vs export); user approves attach.
- **Rate limiting & cost guard:** prevent runaway loops/expensive ops; confirm before large exports or generative spend.
- **Audit log:** every tool call recorded (who/what/when/diff) and visible in Cue's action history ([07](07-UI-UX-DESIGN-SYSTEM.md)).
- **Sandboxing:** tools cannot touch arbitrary filesystem/network; only declared capabilities.
- **No destructive surprises:** irreversible-ish ops (overwrite export, delete media) require confirmation; everything timeline-level is undoable.
- **Determinism:** same plan + same project → same result (important for trust and testing).

## Prompts & skills

The MCP server can also expose **prompt templates** ("skills") — e.g., *"social-pass"*, *"tighten-tutorial"*, *"premium-title"* — that pre-compose tool sequences and give Cue a reliable starting recipe, while still letting it adapt. These map to the signature flows in [09](09-AI-FEATURES.md).

## Why this beats CapCut's AI

| | CapCut AI | Kinetix + MCP |
|---|---|---|
| Awareness | per-feature | whole-project (resources) |
| Action | fixed buttons | composable tools → any workflow |
| Reversibility | varies | every action undoable (shared command layer) |
| Extensible | no | external agents/automation can attach |
| Privacy | cloud-leaning | local-first, consented cloud, fully-local mode |
| Transparency | opaque | plan + diff + audit log |

## Testing the MCP surface

- **Contract tests** per tool (schema, validation, diff correctness, undo).
- **Scenario tests**: run the signature flows end-to-end via MCP, assert timeline state.
- **Adversarial**: malformed args, race conditions, cancellation, sidecar-down behavior.
- **Latency budget**: tool round-trip must feel instant for interactive tools.
See [15-TESTING](15-TESTING-QA-PERFORMANCE.md).

## Open questions

- Exact transport for external attach (ws vs local socket) + auth model.
- Granularity: do we expose ultra-fine tools (per-keyframe) or coarser intents and let the core decompose? (Leaning: small orthogonal tools + skill prompts for common chains.)
- Versioning the tool surface (semver) so external clients don't break on updates.
- How much project state to expose by default vs on-demand (token/perf budget for Cue's context).
