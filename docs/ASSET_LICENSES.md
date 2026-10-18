# Asset Licenses

Every external 3D model, audio clip, or media asset used in the product must be recorded here.

| Asset | Source | License | Path | Notes |
|-------|--------|---------|------|-------|
| Existing simulation tweezer and pistol-grip instruments, translucent ghost instruments/needle/trails, tip cursors, pickup halo, practice needle, target rings (`ring-1..3`), corridor arc, release ring, `tissue-wall` danger zone, peg-transfer posts, midline ring, practice peg, corridor, and `board-edge` slab | Repository-authored procedural geometry | No third-party model license; repository source terms apply | `src/components/scene/` | No external meshes, textures, GLBs, image generation or asset downloads. Geometry is an educational visual approximation. |
| Detailed operating room shell, table/drape, lights, cabinetry, equipment and monitor screens | User-supplied Steady UI archive (`a5b4fa93-3d4f-4e68-9716-751390a01707.zip`) | Supplied procedural source; no external GLB or model download | `src/components/scene/scenery/` | Adapted to the installed Three.js/R3F stack. Screen textures are decorative canvas drawings. Source archive attribution notes are retained; external reference project assets are not included. |
| Steady mark, UI styling and illustration-free interface | Same user-supplied UI archive | Supplied source | `src/components/product/` | Reimplemented controls use existing repository/Radix primitives; the archive dependency bundle is excluded. |
| Geist and Geist Mono | Existing Next.js font setup / Vercel | SIL Open Font License 1.1 | Root font configuration and canvas fallback fonts | Existing font pipeline retained; no runtime Google Fonts CSS import added. |
| MediaPipe Hand Landmarker (full), float16 version 1 | [Official model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task), [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf) | Apache-2.0, as stated in model card | `public/mediapipe/hand_landmarker.task` (generated) | SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`; acquired 2026-10-17. Not surgical reference data. |
| MediaPipe Tasks Vision WASM/loaders | Installed `@mediapipe/tasks-vision` package, lockfile version 1.1.1; [upstream](https://github.com/google-ai-edge/mediapipe) | Apache-2.0; preserve bundled notices | `public/mediapipe/wasm/` (generated) | Copied unchanged from the installed package; `runtime.json` records its version. |
| MediaPipe license and attribution | [Upstream license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) | Upstream license text and applicable third-party notice | `public/mediapipe/LICENSE`, `public/mediapipe/NOTICE` | Included with deployed local runtime assets. |

Model and runtime binaries remain ignored in Git and are prepared before dev/build.
No surgical datasets, external camera recordings, or third-party 3D models were added for A1/A3.

## Room provenance

The supplied archive documents procedural Three.js geometry and canvas-drawn screens. Its reference project (`akhilm2223/yale`) is inspiration only; this integration includes no GLB, copied asset download, or external model from that project. Original ownership/license claims in the supplied source are provenance, not a new assertion of an unrelated repository's licensing. Preserve source and dependency notices when redistributing.
