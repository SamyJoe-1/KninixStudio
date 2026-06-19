# 07 — UI/UX & Design System

> Designed as a senior **motion-graphics designer + product designer** would: the app must *feel* like good motion design — fluid, precise, confident — and must scale from "first reel in 5 minutes" to "graph editor at 2am."

## Design principles

1. **Progressive disclosure ("Progressive Pro").** Default UI is calm and CapCut-simple. A **Pro toggle** (and contextual reveals) unlock graph editor, scopes, node effects, expressions. *Same project, no second app.*
2. **Direct manipulation first.** Drag on the canvas, on the timeline, on keyframes. Numbers are always editable, but you rarely *need* them.
3. **Reversible & legible.** Every action — human or Cue — is undoable and shows what changed. Trust through transparency.
4. **Keyboard-first, mouse-friendly.** Pros live on shortcuts (JKL, I/O, ripple, blade). Beginners never need them.
5. **The app is motion design.** Transitions in the UI use the same easing vocabulary we give users. Nothing janky; nothing gratuitous.
6. **Quiet by default, powerful on demand.** Panels collapse; the canvas is the hero.
7. **Accessible.** Keyboard operable, screen-reader labelled, high-contrast, scalable. WCAG 2.1 AA for chrome.

## Primary layout (desktop)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  TOP BAR: project · undo/redo · play controls · aspect · [Pro ◻] · Export   │
├───────────────┬───────────────────────────────────────────┬────────────────┤
│  LEFT          │                CANVAS / PREVIEW            │  RIGHT          │
│  • Media lib   │           (program monitor, hero)         │  • Inspector    │
│  • Templates   │        safe-areas, transform handles      │    (selected    │
│  • Effects     │        on-canvas text editing             │     clip/layer) │
│  • Audio/music │                                           │  • Properties + │
│  • Brand kit   │                                           │    keyframes    │
│                │                                           │  • Color / Audio│
├───────────────┴───────────────────────────────────────────┴────────────────┤
│  TIMELINE  (tracks, clips, keyframes, markers)   │  CUE PANEL (dockable)     │
│  ruler · zoom · snapping · magnetic/free toggle  │  chat + proposed edits    │
│  ▸ graph editor expands here in Pro mode         │  + action history/undo    │
└──────────────────────────────────────────────────┴───────────────────────────┘
```

- **Cue panel** is dockable (right or bottom) and collapsible; it shows the conversation, proposed/applied actions, and a one-click "undo this action" per item.
- **Inspector** is contextual: pick a clip → trim/speed/effects; pick a text layer → type/animation; pick a keyframe → easing.
- **Timeline ↔ Graph editor**: the timeline track area expands to reveal the value/speed graph for the selected property in Pro mode.

## Modes

| Mode | Audience | Surfaces shown |
|---|---|---|
| **Quick** (default) | Maya/Leo | Library, canvas, simple timeline, captions, Cue, export presets |
| **Pro** (toggle) | Sam/Dana | + graph editor, scopes, node effects, masks/mattes, expressions, advanced color/audio |
| **Focus** | everyone | Hide all but canvas + minimal transport (review/preview) |

Pro is **per-user-sticky** but **non-destructive**: a Quick user can open a Pro project; advanced properties are visible read-friendly, editable when Pro is on.

## Core interaction patterns

- **Timeline editing:** drag-trim, blade/split (B), ripple delete, slip/slide, snapping (toggle S), magnetic vs free placement, markers (M), in/out (I/O), JKL shuttle, zoom to fit / to playhead.
- **On-canvas:** move/scale/rotate handles, anchor-point editing, text edit in place, mask drawing, safe-area + grid overlays.
- **Keyframing:** ⏺ to set, navigate prev/next keyframe, right-click easing menu, drag to graph editor for fine control (see [08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Cue:** type or speak an instruction; Cue shows a **plan** ("I'll do A, B, C"), executes as reversible commands, and reports diffs. Inline "Apply / Tweak / Undo."
- **Command palette** (Ctrl/Cmd-K): search any action, effect, or Cue skill — power-user accelerator.

## Design tokens (foundations)

> Tokens are the contract between design and code; named, themeable, never hard-coded.

### Color (dark-first; light theme parity)
```
--bg-app            #0E0F12   (near-black, low fatigue for long sessions)
--bg-panel          #16181D
--bg-elevated       #1E2128
--stroke-subtle     #2A2E37
--text-primary      #F2F4F8
--text-secondary    #A7AEBC
--text-disabled     #5B6271
--accent            #6C5CE7   (brand violet — energy/motion)
--accent-hover      #8577F0
--accent-press      #5A4BD6
--positive          #2BD9A8
--warning           #F5A524
--danger            #FF5C72
--cue               #36C5F0   (Cue/AI surfaces, distinct from accent)
--track-video       #3A86FF
--track-audio       #2BD9A8
--track-text        #F5A524
--keyframe          #F2F4F8
```
- **Semantic, not literal:** components reference `--accent`, not the hex. Themes (Dark, Light, High-Contrast) swap token values.
- **AI surfaces** use the `--cue` hue so users always know what's machine-proposed vs human.

### Typography
```
--font-ui      Inter / SF / Segoe (system-adaptive), tabular numbers for timecode
--font-mono    JetBrains Mono (timecode, expressions, values)
Scale: 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32  (UI is dense; 13 is base)
```
Tabular/monospaced numerals everywhere we show timecode, frames, and parameter values (no jitter while scrubbing).

### Spacing, radius, elevation
```
space: 2 4 6 8 12 16 24 32 48        (4-based grid)
radius: 4 (controls) · 8 (panels) · 12 (modals) · full (chips)
elevation: 0 panels · 1 popovers · 2 modals/menus (soft, low-contrast shadows)
```

### Iconography
- 1.5px stroke, 20px grid, rounded joints — consistent with the springy motion language. Custom set for editor verbs (blade, ripple, slip, matte, keyframe).

## <a name="motion-language"></a>Motion language (the app's own motion design)

The UI uses a small, disciplined easing/duration system — and we expose the *same* curves to users as presets, so the product teaches motion taste by example.

```
Durations:   instant 80ms · fast 140ms · base 220ms · slow 360ms · deliberate 500ms
Easing:
  standard   cubic-bezier(.2,0,0,1)      (most UI transitions)
  emphasized cubic-bezier(.2,0,0,1) + overshoot (entrances)
  spring      tension/friction tuned, for drag-release & snapping feedback
Principles:
  • Motion has meaning (origin, hierarchy, continuity) — never decoration.
  • Snapping/keyframe interactions get a subtle spring for tactility.
  • Nothing animates longer than it informs; respect "reduce motion" OS setting.
```

These same curves appear in the **animation preset library** ([08](08-MOTION-GRAPHICS-ENGINE.md)) — "Standard," "Emphasized," "Spring," "Bounce," "Anticipate" — so users get pro-grade easing by default.

## Component inventory (build order)

**Foundations:** Button, IconButton, Toggle, Slider, NumberField (scrubbable), Select, Tabs, Tooltip, Popover, Menu, Modal, Toast, Tag/Chip, ColorSwatch, Avatar.
**Editor-specific:** TransportControls, TimecodeField, Timeline (ruler, track, clip, keyframe lane), GraphEditor, Inspector sections, KeyframeButton, CurvePicker, EffectCard, PresetGallery, MediaCard, WaveformView, Scopes, CueMessage, CueActionCard (apply/undo), CommandPalette, SafeAreaOverlay.

## Onboarding & empty states

- **First run:** "Start from footage" / "Start from a template" / "Let Cue rough-cut it." Time-to-first-export is a tracked metric.
- **Empty timeline:** drop zone + 3 starter actions; Cue offers "Want me to build a rough cut?"
- **Templates** front-and-center (matching CapCut's strength) but every template is fully editable (unlike locked templates).

## Responsiveness & density

- Min window ~1280×800; layout reflows panels; panels collapse to icon rails on narrow widths.
- Density toggle (Comfortable/Compact) for laptop vs big-monitor.
- High-DPI crisp; UI scale setting independent of OS scaling.

## Accessibility specifics

- Full keyboard map (documented, remappable); visible focus rings.
- Screen-reader labels for transport, timeline objects, and Cue actions ("Clip 3 moved to 00:12:04").
- Respect OS "reduce motion," "increase contrast," font scaling.
- Color is never the only signal (icons + text for track types, warnings).

## Look-and-feel north star

Premium, calm, *motion-literate*. Closer to a Linear/Arc-grade craft bar than a toy. The first five seconds should say "this is pro," the first five minutes should say "but I'm not lost."

## Open questions

- Default theme: dark-first is decided; do we ship light at launch or fast-follow?
- Cue panel default dock (right vs bottom) — test with users.
- How much of the graph editor surfaces in Quick mode (a teaser to drive Pro adoption)?
- Mobile/tablet layout is a separate spec ([12](12-ROADMAP-MILESTONES.md)) — not covered here.
