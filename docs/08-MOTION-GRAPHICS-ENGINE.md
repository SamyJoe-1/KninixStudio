# 08 — Motion-Graphics Engine

> This is our **craft moat** — the thing CapCut structurally lacks. Written as a motion-graphics designer: the engine must give After-Effects-class control (keyframes, graph editor, easing, shape layers, mattes, expressions, presets) while staying approachable enough that a CapCut graduate can animate a title in two minutes.

## Goals

- **Smooth, controllable animation** of any parameter via keyframes with real interpolation and a **graph editor**.
- **Reusable**: animation presets and full templates (`.kxt`) that are *editable*, not locked.
- **Procedural power**: expressions and driven parameters for the advanced tier.
- **Designer-grade defaults**: things look good before you touch a curve (great easing out of the box).
- **Performance**: keyframe evaluation is cheap and deterministic per frame ([06](06-VIDEO-ENGINE.md)).

## Core concepts & data model (summary; schema in [11](11-PROJECT-FILE-FORMAT-DATA-MODEL.md))

```
Layer
 ├─ Transform: position(x,y[,z later]), scale, rotation, anchorPoint, opacity
 ├─ Properties: any animatable param (effect params, text props, mask params...)
 │     └─ each Property = static value  OR  Keyframe track  OR  Expression
 ├─ Masks: bezier shapes (animatable), feather, mode (add/subtract/intersect)
 ├─ Effects: ordered chain, each with animatable params
 └─ TrackMatte: alpha/luma from layer above (or explicit matte source)

Keyframe
 ├─ time (frame-accurate)
 ├─ value (scalar / vector / color / bezier-path)
 ├─ interpolation: hold | linear | bezier(in/out handles)  [temporal]
 ├─ spatial interpolation (for position paths): linear | bezier (motion path)
 └─ easing handles (influence + velocity) editable in graph editor
```

Everything animatable shares this model, so the **graph editor, keyframe UI, and Cue tools work uniformly** across transform, effects, text, masks, and color.

## Interpolation & easing

- **Temporal interpolation:** Hold, Linear, Bezier (per-keyframe in/out handles) — standard AE-style.
- **Spatial interpolation:** position keyframes form a **motion path** on canvas with bezier handles (smooth arcs vs straight lines).
- **Easing presets** (one-click, then tweak): `Linear, Ease, Ease In, Ease Out, Ease In-Out, Emphasized, Spring, Bounce, Anticipate, Overshoot, Elastic`. These are the **same curves as the UI motion language** ([07](07-UI-UX-DESIGN-SYSTEM.md#motion-language)) so good taste is the default.
- **Roving keyframes** for constant-velocity motion along a path.
- **Auto-ease** ("smooth") to convert linear stutter into graceful motion in one click.

## The Graph Editor (Pro)

The differentiator over CapCut. Expands inside the timeline area ([07](07-UI-UX-DESIGN-SYSTEM.md)):

- **Value graph**: parameter value over time, drag keyframes + bezier handles.
- **Speed graph**: velocity over time — the pro way to control "snappy vs floaty."
- Multi-property editing, normalize/separate dimensions (X/Y/Z), snapping, handle-influence drag.
- Visual easing readout (in/out %), numeric entry for precision.
- **Separate dimensions** for position (animate X and Y independently).

## Shape layers, masks & mattes

- **Shape layers**: parametric rectangles/ellipses/polygons/paths, with fill/stroke (animatable width, dashes), trim paths (the classic "draw-on" line animation), repeaters.
- **Masks**: animatable bezier masks per layer; feather; add/subtract/intersect; expansion.
- **Track mattes**: alpha & luma mattes (use one layer's alpha/luma to reveal another) — essential for reveals, text-in-image, shaped video.
- **Mask/shape paths are keyframeable** (morphing shapes).

## Text & kinetic typography

- **Rich text layers**: font/weight/size/tracking/leading, fill/stroke/shadow, gradients.
- **Animators / per-character animation**: animate position/opacity/scale/color across characters/words/lines with a **range selector** (the AE text-animator concept) — powering "word-by-word," "typewriter," "wave," "cascade."
- **Caption styles**: karaoke/word-highlight, pop, bounce — built on the same animator system, exposed as one-click presets ([09](09-AI-FEATURES.md) auto-generates the text; this animates it).
- **Path text** (text on a curve) — later.

## Presets & templates

Two reuse levels:

1. **Animation presets** — a saved keyframe/easing recipe applied to a property or layer (e.g., "Fade + rise in, 220ms emphasized"). Drag-drop from a gallery; fully tweakable after.
2. **Templates (`.kxt`)** — full composed motion graphics (animated lower-thirds, logo stings, callouts, end-cards, intros) with **exposed parameters** (text, colors, logo, timing) — MOGRT-like but **open and editable**. Brand kits ([03](03-PRODUCT-REQUIREMENTS.md)) feed fonts/colors/logo into templates automatically.

A strong **seed library** ships at launch (see content plan in [12](12-ROADMAP-MILESTONES.md)); users and third parties can author/sell more (marketplace, [14](14-MONETIZATION-BUSINESS.md)).

## Expressions & driven parameters (advanced, V2)

- **Expressions**: small sandboxed scripts that compute a property from time, other properties, audio, or math — `wiggle()`, `loopOut()`, `linear()/ease()`, link to another layer's value, audio-amplitude-driven scale, etc. (ADR-009 in [05](05-TECH-STACK.md)).
- **Driven parameters / rigs**: expose "control" sliders on a template that drive many internal params (e.g., one "Intensity" knob).
- **Determinism & safety**: per-frame CPU/time budget, no I/O, no nondeterminism unless seeded; errors degrade gracefully (hold last good value + warning).

## Effects & generators (motion-relevant)

- **Stylize**: glow, blur (gaussian/directional/radial), sharpen, vignette, chromatic aberration.
- **Distort**: transform, corner-pin, warp, displacement, wave.
- **Generate**: gradients, solids, shapes, noise, grids; **particle/emitter system** (V2) for sparkles/confetti/snow.
- **Time**: speed ramps, time remap, echo/trails.
- All effect params are animatable and graph-editable like anything else.

## Motion tracking & auto-motion (V2)

- **2D point/planar tracking** → attach text/graphics to moving subjects.
- **Auto-reframe / subject tracking** → keeps the subject centered when reframing 16:9→9:16 (a top creator need; Cue can invoke it, [09](09-AI-FEATURES.md)).
- **Auto-animate** ("magic motion"): Cue proposes tasteful entrance/emphasis animations for a selected layer, then hands you editable keyframes.

## How Cue plugs into motion (AI × craft)

Because keyframes/easing/text-animators are all first-class commands ([04](04-SYSTEM-ARCHITECTURE.md)), **Cue can author motion** too: *"animate this title to slide up with a spring and a soft glow,"* *"make the logo draw on over 1.2s,"* *"add subtle wiggle to the sticker."* Cue emits keyframe/effect commands that the user then refines in the graph editor. AI proposes; the designer perfects. MCP tool surface in [10](10-MCP-INTEGRATION.md).

## Phasing (motion engine specifically)

| Phase | Capability |
|---|---|
| **MVP** | Transform keyframes, easing presets, bezier handles, on-canvas motion path, basic text animation/caption presets |
| **V1** | Graph editor (value+speed), shape layers, masks, track mattes, animation presets, `.kxt` templates, brand-kit binding |
| **V2** | Expressions, driven rigs, particles/generators, motion tracking, auto-reframe, auto-animate, kinetic-type animators |
| **Later** | 3D layers/camera/lights, advanced planar tracking, mesh warp |

## Quality bar (designer's acceptance)

- Default easing must look intentional, never linear-robotic.
- Graph editor must feel as precise as AE's (handle dragging, speed graph).
- Templates must look *premium* and brand-adaptable, not "stock."
- Text animation must be smooth at any caption length and language.

## Open questions

- Expressions: JS-lite vs DSL (ADR-009) — affects authoring UX and safety.
- Do we adopt an interchange concept (OTIO for edit, custom for motion) to ease AE/MOGRT import later?
- Particle system: build vs integrate; scope for V2.
- How much auto-animate is "tasteful default" vs "uncanny" — needs design QA with real designers.
