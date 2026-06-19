# Kinetix Studio — Running the MVP

A **desktop** video editor (Electron + Node) built for the priorities you set:
**function over UI, buttery smooth, and genuinely multi-process** — the UI never
blocks while media work happens, exactly like CapCut. Plus a working **MCP** server so
Claude ("Cue") can drive the same project.

> Why Electron + Node and not the Rust/Tauri engine from `docs/05`? Rust/cmake aren't
> installed on this machine, but Node + **ffmpeg** are. So heavy work runs in **separate
> `ffmpeg` OS processes** orchestrated by a concurrent Job Manager — the architecture is a
> drop-in for the Rust engine later (same command core, same MCP surface).

## Prerequisites
- **Node.js** (installed — v22).
- **ffmpeg + ffprobe** on `PATH` (installed). Override with `KX_FFMPEG` / `KX_FFPROBE` env vars if needed.
- Dependencies installed: `npm install` (already done — only `electron`).

## Run the app
```bash
npm start
```
First launch downloads the Electron binary once (be patient ~1 min). A dark editor window opens.

### Edit a video (the actual workflow)
1. **⬆ Import** your own video (or **+ Demo clip** to get test footage instantly).
2. Click **＋** on a media card to drop it on the timeline.
3. Press **▶ / Space** → the clip **plays in the preview**; the playhead moves. Click the **ruler** to scrub.
4. **Click a clip** to select it (highlights, Inspector opens). **Drag** its body to move it; **drag its edges** to trim. **✂ Split** (or `S`) cuts it at the playhead. `Delete` removes it.
5. **＋ Text / ▭ Rect / ◯ Ellipse** add objects on the canvas. Click one in the preview to **select**, **drag** to move, drag the blue **handles** to resize; edit text/color/size in the Inspector. Objects also appear on the **Text/Shapes** timeline lane.
6. **⬇ Export** → stitches the timeline to an MP4 in `Videos/KinetixExports`.

> Background work (probe, thumbnails, export, demo-clip generation) runs in **separate
> `ffmpeg` processes** — the `UI … fps` meter top-right stays green even mid-export, which
> is the proof the editor never blocks while it works.

### Sections (left sidebar) — like CapCut
- **🎬 Media** — import / demo clips / library.
- **🅣 Text** — 9 text presets (heading, title, caption, colored pops…).
- **◆ Shapes** — 12 shapes (rect, rounded, circle, triangle, diamond, star, pentagon, hexagon, heart, arrow, line, ring).
- **🧩 Widgets** — animated elements: lower-third, title card, progress bar, countdown timer, badge, audio bars.
- **😀 Sticker** — 30 emoji stickers.
- **🎨 Filters** — 10 looks (B&W, sepia, warm, cool, vivid, vintage, cinematic, fade, invert) applied live to the playing clip.
- **🔊 Audio** — import audio or generate music tones (land on the audio track).

> **Imported video showed audio only?** Fixed: on import we transcode a browser-friendly
> **H.264 preview proxy** with ffmpeg (background job), so HEVC/10-bit/any-codec files now
> play. The original is kept for export. You'll briefly see a `⏳preview` tag until the proxy is ready.

### Motion, layers & selection
- **In/Out animations** — every text/shape/widget has *Animate IN* and *Animate OUT* (fade, slide L/R/up/down, pop, zoom, spin, bounce) with duration, in the Inspector. This is the "show-in / show-out."
- **Clip transitions** — per-clip fade / dip-to-white in & out (Inspector).
- **Layers panel** (right) — every object listed with z-order ▲▼, visibility 👁, lock 🔒, delete.
- **Marquee select** — drag a box on the preview to select multiple objects, then move/animate/delete them together.

> **Honest status:** preview playback, marquee + click selection, drag/move/trim/split,
> text + 12 shapes + 6 widgets + stickers, 10 filters, in/out animations, clip transitions,
> layers (z-order/visibility/lock), timeline zoom, undo/redo, duplicate, single-instance —
> all real and live in the preview. The one remaining gap: **export still renders only the
> raw video clips** — baking the overlays/animations/filters/transitions into the exported
> MP4 (so the file matches the preview) is the next step.

## Run the tests (no GUI needed)
```bash
npm run test:core   # real ffmpeg: concurrency overlap + export + undo/redo
npm run test:mcp    # real MCP server child over stdio -> control server -> engine
npm test            # both
```

## Architecture (how "smooth + multi-process" is achieved)
```
renderer (UI, never heavy) ──IPC──► main / Engine (single source of truth)
                                       │  dispatch(method, params)  ← one command layer
                                       ├─► JobManager (4 concurrent) ──► ffmpeg.exe ×N  (separate OS processes)
                                       └─► control server (localhost) ◄── MCP sidecar ◄── Claude ("Cue")
```
- `electron/core/` — `project.js` (model + undo/redo), `jobManager.js` (concurrent pool),
  `ffmpeg.js` (subprocess workers), `engine.js` (the unified `dispatch`), `controlServer.js`.
- `electron/mcp/server.js` — hand-rolled MCP (stdio JSON-RPC), 15 tools + 3 resources.
- `renderer/` — minimal dark UI with a live FPS meter.
- Full rationale: `docs/04-SYSTEM-ARCHITECTURE.md`, `docs/10-MCP-INTEGRATION.md`.

## Hook it up to Claude (MCP)
The MCP server attaches to the **running app** (start the app first). See
[`mcp-config.example.json`](mcp-config.example.json) for the Claude Desktop snippet.
Then ask Claude things like *"generate a 5s sample, add it to the timeline, and export."*
