# 06 — Video Engine

The video engine is the heart that makes "real-time-ish editing on a modest laptop" true. It spans **decode → compositor → encode**, plus color management and caching. Built in Rust ([05 ADR-002](05-TECH-STACK.md)) on FFmpeg ([ADR-004](05-TECH-STACK.md)) and wgpu ([ADR-003](05-TECH-STACK.md)).

## Design goals

- **Frame-accurate** scrubbing and playback; never lie about what a frame looks like.
- **Real-time preview** of 1080p with several layers/effects on the reference machine; 4K via proxies.
- **Color-correct** pipeline (defined working space, predictable LUT/grade results).
- **Deterministic export** that matches preview (WYSIWYG) within tolerance.
- **Resilient**: a bad frame/codec doesn't crash the editor.

## Pipeline overview

```
                         ┌──────────────── DOCUMENT (timeline graph) ───────────────┐
                         │  layers, clips, effects, keyframes, color, time          │
                         └──────────────────────────┬───────────────────────────────┘
                                                    │ query at time T
                                                    ▼
   ┌──────────────┐    decoded     ┌──────────────────────────────┐    composited   ┌─────────────┐
   │  MEDIA I/O    │  frames (GPU   │   COMPOSITOR (wgpu)           │     frame      │  PREVIEW     │
   │  demux+decode │──textures)────►│  per-layer: source→effects→   │───────────────►│  display     │
   │  HW accel     │                │  transform→mask→blend         │                │  + scopes    │
   └──────┬───────┘                 └──────────────┬───────────────┘                └─────────────┘
          │ caches                                  │ same graph
          ▼                                         ▼
   ┌──────────────┐                        ┌──────────────────────────────┐
   │ FRAME / PROXY │                        │   EXPORT (encode)             │
   │ CACHES        │                        │  render each frame → FFmpeg   │
   └──────────────┘                        │  HW encoder → muxed file      │
                                           └──────────────────────────────┘
```

The compositor graph used for **preview** and **export** is the **same**, guaranteeing WYSIWYG (only resolution/quality/caching differ).

## 1. Media I/O (decode path)

- **Demux + decode** via FFmpeg/libav. Prefer **hardware decode** (NVDEC, QuickSync, AMF, VideoToolbox) with a software fallback.
- **Output** decoded frames as GPU textures where possible (zero/low-copy to the compositor). Pixel formats normalized to the working space.
- **Seeking:** keyframe-aware seek + decode-to-target for frame accuracy; maintain small decode-ahead buffers for smooth playback and JKL shuttle.
- **Proxies / optimized media:** generate lower-res or all-intra proxies (e.g., for long-GOP 4K/HEVC) so editing stays fluid; transparent proxy/full switch; full-res used at export.
- **Audio extraction:** decode audio to the audio engine; precompute **waveform peaks** for display.
- **Variable frame rate (VFR)** handling: detect and conform to a sequence timebase to avoid sync drift (a known mobile-footage pain).

### Caching strategy
- **Decoded-frame cache** (LRU, memory + GPU budget aware).
- **Render cache**: cache composited output of unchanged timeline segments; invalidate by content hash of the segment's command state.
- **Thumbnail/filmstrip cache** for the timeline.
- **Waveform/peaks cache** per media item.
All caches are budget-bounded and degrade gracefully under memory pressure.

## 2. Compositor (the GPU heart)

A **node/shader graph** evaluated per output frame:

```
for each visible layer (back → front), at time T:
   src   = sample source frame (or generator/text/shape rasterization)
   fx    = apply effect chain (WGSL passes; params evaluated from keyframes/expressions at T)
   xform = apply transform (position/scale/rotation/anchor) + motion blur (optional)
   mask  = apply masks / track mattes
   out   = blend(out, layer_result, blend_mode, opacity)
return out  → working color space → display transform (or → export encode)
```

- **Effects as shader passes**: each effect = one or more WGSL passes with a typed parameter schema; chains are fused where possible to reduce passes.
- **Transforms**: GPU-sampled with high-quality filtering; sub-pixel accurate.
- **Masks & mattes**: alpha/luma mattes, feathering, shape masks (from the motion engine, [08](08-MOTION-GRAPHICS-ENGINE.md)).
- **Blend modes**: normal, add, screen, multiply, overlay, etc., computed in linear light.
- **Motion blur**: optional, sampled across shutter; off by default for performance.
- **Adjustment layers**: effects applied to everything beneath.
- **Quality tiers**: preview can drop to half-res / cheaper filtering while scrubbing, snap to full on pause.

## 3. Color management

- **Working space:** composite in **linear light** with a defined wide gamut; display through a view transform (sRGB/Rec.709 default; HDR/Rec.2020 path later).
- **Input transforms:** tag/decode media to the working space (Rec.709/sRGB now; log/HDR later).
- **LUTs:** 1D/3D LUT support for looks and technical conversions.
- **Grade tools:** lift/gamma/gain wheels, curves, HSL qualifiers; primaries first, secondaries later.
- **Scopes:** waveform, vectorscope, histogram, RGB parade (Pro mode) — computed from the actual composited frame.
- **Goal:** predictable, reproducible color; export matches preview. (DaVinci-grade finishing is *not* the launch goal; correctness and trust are.)

## 4. Audio (interface to the audio engine)

Tight cousin of video; full detail belongs to the audio module, but the engine must keep **A/V sync < 1 frame** across long timelines:
- Sample-accurate audio timeline aligned to the video timebase.
- Real-time mixing during playback; render-accurate mix at export.
- Resampling to a project sample rate; clock derived from one master timebase.

## 5. Export / encode

- **Frame-exact render** of each output frame through the *same compositor graph*, fed to FFmpeg with a **hardware encoder** (NVENC/AMF/QuickSync/VideoToolbox), software fallback (x264/x265/SVT-AV1).
- **Presets** per target (TikTok 9:16, IG 1:1/4:5, YouTube 16:9 1080p/4K, etc.): resolution, fps, codec, bitrate/quality, audio.
- **Codecs:** H.264 (compat), H.265 (efficiency), **AV1/VP9** (royalty-free path), ProRes/DNxHR (intermediate, later); audio AAC/Opus.
- **Batch & multi-aspect:** one timeline → multiple aspect/format outputs in a single queued job (a core creator workflow).
- **Determinism & integrity:** verify A/V sync, no dropped frames; report any defects. **No watermark on free tier.**
- **Pipeline isolation:** export runs off the interactive path; a codec crash is contained and reported, not fatal.

## 6. Performance budgets (measured on reference machine)

| Scenario | Target |
|---|---|
| 1080p, 3 layers, basic effects | Real-time preview (≥ source fps), smooth scrub |
| 4K source (with proxy) | Smooth edit; full-res only at export |
| Scrub latency | < ~100 ms to show target frame |
| Export speed (1080p H.264 HW) | Faster than real-time on HW encoder |
| Memory under a 30-min 1080p project | Bounded by cache budgets; no unbounded growth |

Full methodology & gates in [15-TESTING-QA-PERFORMANCE](15-TESTING-QA-PERFORMANCE.md).

## 7. Resilience

- Per-decode error isolation (skip/repeat frame, surface a warning, never crash).
- Missing/offline media → clear relink flow; placeholder frames.
- GPU device loss → recreate context, rebuild caches.
- Export failure → resumable/retryable; partial output cleaned up.

## Open questions

- Native-wgpu-render → present into WebView vs in-WebView WebGPU (the Spike #1 from [05](05-TECH-STACK.md)).
- HDR/log pipeline: launch with Rec.709 only, design data model for HDR later — when do we invest?
- Proxy format default (all-intra H.264 vs ProRes-Proxy vs DNxHR LB) per platform.
- How aggressive is scrub-time quality degradation before users notice? (Tune via testing.)
