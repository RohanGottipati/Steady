# Asset Licenses

Every external 3D model, audio clip, or media asset used in the product must be recorded here.

| Asset | Source | License | Path | Notes |
|-------|--------|---------|------|-------|
| MediaPipe Hand Landmarker (full), float16 version 1 | [Official model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task), [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20%28Lite_Full%29%20with%20Fairness%20Oct%202021.pdf) | Apache-2.0, as stated in model card | `public/mediapipe/hand_landmarker.task` (generated) | SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`; acquired 2026-10-17. Not surgical reference data. |
| MediaPipe Tasks Vision WASM/loaders | Installed `@mediapipe/tasks-vision` package, lockfile version 1.1.1; [upstream](https://github.com/google-ai-edge/mediapipe) | Apache-2.0; preserve bundled notices | `public/mediapipe/wasm/` (generated) | Copied unchanged from the installed package; `runtime.json` records its version. |
| MediaPipe license and attribution | [Upstream license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE) | Upstream license text and applicable third-party notice | `public/mediapipe/LICENSE`, `public/mediapipe/NOTICE` | Included with deployed local runtime assets. |

Model and runtime binaries remain ignored in Git and are prepared before dev/build.
No surgical datasets, external camera recordings, or 3D assets were added for A1.
