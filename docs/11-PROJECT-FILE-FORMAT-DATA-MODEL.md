# 11 — Project File Format & Data Model

> The `.kxp` format is a **trust + extensibility moat**: open, documented, versioned, diffable. You own your work. It is also the single source of truth that the GUI, the compositor, and Cue/MCP all read and mutate ([04](04-SYSTEM-ARCHITECTURE.md)).

## Design goals

1. **Own-your-work:** human-readable, documented, no lock-in; published schema.
2. **Deterministic:** the same document renders the same frames every time ([06](06-VIDEO-ENGINE.md)).
3. **Diffable & mergeable:** stable IDs, ordered structures, designed so future CRDT/multiplayer is possible ([04](04-SYSTEM-ARCHITECTURE.md)).
4. **Portable:** media referenced by path/hash; packageable ("collect files") for handoff.
5. **Versioned & migratable:** every document carries a schema version; migrations are first-class.
6. **Interop-ready:** import/export bridges to OTIO / FCPXML / EDL / AAF (later).

## Container layout

`.kxp` is a **directory or zipped bundle** (zip = single shareable file; dir = better for git/diff during work). Either form holds:

```
project.kxp/
├── manifest.json          # schema version, app version, ids, created/modified
├── document.json          # the timeline graph (source of truth; CBOR option for size)
├── media/
│   ├── media-index.json   # id → {path|relpath, hash, codec, fps, dur, resolution}
│   └── (optional collected media when packaged)
├── caches/                # NON-canonical: proxies, peaks, thumbs, transcripts (regenerable)
│   ├── proxies/  peaks/  thumbnails/  analysis/
├── assets/                # project-local fonts, luts, brand kit, custom templates
└── history/               # optional event log (event-sourced edits) for recovery/audit
```

- **Canonical state = `document.json`.** Everything in `caches/` is regenerable and excluded from "what the project *is*."
- **Media is referenced, not embedded** by default (local-first; your footage stays where it is). Packaging copies/relinks for transport.
- **Hashes** let us detect moved/changed media and drive the render cache.

## `document.json` model (conceptual schema)

> Illustrative JSON (not final). Conventions: every entity has a stable `id`; times are in a rational timebase (frame-accurate, no float drift); colors carry a color space.

```jsonc
{
  "schemaVersion": "1.0.0",
  "timebase": { "fps": 30000, "scale": 1001 },   // 29.97 as rational; supports 24/25/30/60...
  "sequence": {
    "id": "seq_main",
    "resolution": { "w": 1920, "h": 1080 },
    "aspect": "16:9",
    "colorSpace": "rec709",
    "duration": 54000,                            // in timebase units
    "tracks": [
      {
        "id": "trk_v1", "kind": "video", "index": 0, "locked": false, "muted": false,
        "clips": [
          {
            "id": "clp_001",
            "mediaId": "med_abc",
            "timelineIn": 0, "timelineOut": 3600,  // position on the sequence
            "sourceIn": 1200, "sourceOut": 4800,   // trim within the source
            "speed": 1.0,
            "enabled": true,
            "layer": {                              // the per-clip layer (see motion model, doc 08)
              "transform": {
                "position": { "anim": [ /* keyframes */ ], "value": [960, 540] },
                "scale":    { "value": [100, 100] },
                "rotation": { "value": 0 },
                "anchor":   { "value": [960, 540] },
                "opacity":  { "value": 100 }
              },
              "effects": [
                { "id": "fx_1", "type": "glow", "params": { "intensity": { "value": 0.4 } }, "enabled": true }
              ],
              "masks": [],
              "trackMatte": null
            },
            "transitions": { "in": null, "out": { "type": "dissolve", "duration": 300 } }
          }
        ]
      },
      { "id": "trk_a1", "kind": "audio", "index": 0,
        "clips": [ { "id": "clp_a1", "mediaId": "med_abc", "timelineIn": 0, "timelineOut": 3600,
                     "gain": -3.0, "pan": 0, "fades": { "in": 120, "out": 240 } } ] },
      { "id": "trk_t1", "kind": "text", "index": 0, "clips": [ /* caption/title layers */ ] },
      { "id": "trk_adj1", "kind": "adjustment", "index": 0, "clips": [ /* adjustment layers */ ] }
    ],
    "markers": [ { "id": "mk_1", "at": 1500, "label": "hook", "color": "warning" } ]
  },
  "compositions": [ /* nested sequences / compound clips referenced by id */ ],
  "brandKit": { "fonts": ["Inter"], "colors": ["#6C5CE7"], "logoMediaId": "med_logo" },
  "settings": { "tier": "pro", "lastPlayhead": 1500 }
}
```

### Animatable property model (shared everywhere — see [08](08-MOTION-GRAPHICS-ENGINE.md))

```jsonc
// A property is one of: static value, keyframe track, or expression.
"opacity": { "value": 100 }                                  // static
"scale":   { "anim": [
    { "id":"kf1", "t": 0,    "v":[80,80],   "interp":"bezier",
      "easeIn":{"x":0.2,"y":0}, "easeOut":{"x":0,"y":1} },
    { "id":"kf2", "t": 600,  "v":[100,100], "interp":"bezier" }
] }
"rotation": { "expr": "wiggle(2, 5)" }                        // expression (V2, sandboxed)
```

Keyframes carry stable `id`s so the graph editor, MCP `keyframe.*` tools, and undo all reference them precisely.

## Time model

- **Rational timebase** (`fps`/`scale`) → frame-accurate, no float accumulation, clean for 23.976/29.97/59.94.
- All times (clip in/out, keyframes, markers) are **integer units** of the timebase.
- **VFR sources** are conformed at import to the sequence timebase ([06](06-VIDEO-ENGINE.md)) to prevent A/V drift.

## Media index & linking

```jsonc
// media-index.json
{ "med_abc": {
    "relpath": "../footage/clipA.mp4",
    "absHint": "D:/footage/clipA.mp4",
    "hash": "blake3:…",
    "codec": "h264", "fps": "30000/1001", "duration": 18000,
    "resolution": {"w":3840,"h":2160}, "hasAudio": true } }
```

- **Relink flow:** if `relpath`/`absHint` miss, match by `hash` then prompt. Offline media → placeholder frames, project still opens.
- **Packaging ("collect"):** copy referenced media into `media/`, rewrite to `relpath` → fully portable bundle.

## Event log / history (optional, powers recovery + audit)

Edits are **commands** ([04](04-SYSTEM-ARCHITECTURE.md)); we can persist them as an append-only log:

```jsonc
{ "seq": 412, "ts": "...", "actor": "cue", "cmd": "timeline.remove_ranges",
  "args": {...}, "inverse": {...}, "diff": "removed 14 ranges (48.2s)" }
```

- Enables crash recovery (replay to last consistent state), an audit trail of **who changed what (human vs Cue)**, and the basis for future collaborative merge.
- The log is regenerable/compactable; `document.json` remains the canonical snapshot.

## Versioning & migration

- `schemaVersion` is semver. **Readers must migrate forward** via a registered chain of migrations (1.0 → 1.1 → …).
- **Forward-compat:** unknown fields are preserved (round-trip safe) so a newer project opened in an older build degrades gracefully where possible, and never silently drops data it can keep.
- We publish the schema + a validator; breaking changes get a major bump + a documented migration.

## Interop (later)

- **Export/import:** OpenTimelineIO (OTIO) for edit interchange; FCPXML / EDL / AAF bridges; LUT (.cube), font, and image/video standards already native.
- Motion-graphics templates `.kxt` are a **profile of `.kxp`** (a composition + exposed parameters) — see [08](08-MOTION-GRAPHICS-ENGINE.md).

## Why JSON (+ optional CBOR)

- **JSON** for diffability, git-friendliness, human inspection, and the trust story.
- **CBOR** as an optional compact binary encoding of the *same* model for large projects/perf (lossless, switchable).
- Either way the **model is identical**; encoding is a detail.

## Open questions

- Zip bundle vs directory as the **default** save form (dir = diff-friendly; zip = one file to share). Likely dir while editing, zip on "export project."
- Event log: on by default (audit/recovery) vs opt-in (size)? Leaning on-by-default with compaction.
- CRDT-ready IDs now vs retrofit later — cheap to design in now ([04](04-SYSTEM-ARCHITECTURE.md)); decide at data-model milestone.
- How much analysis (transcripts/scene maps) is canonical vs cache — privacy implication ([16](16-SECURITY-PRIVACY.md)).
