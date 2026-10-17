# A1 hand tracking

## Running and assets

Run `npm install`, then `npm run dev`, and open
`http://localhost:3000/dev/hand-tracking?debug=1` in current Chrome on macOS.
Use `localhost` consistently: Next's development origin protections can block client
hydration when a server advertised as localhost is accessed through 127.0.0.1.
The route is intentionally 404 in production and is absent from product navigation.

`npm run prepare:vision` runs automatically before dev/build. It copies all six
WASM/loaders from the installed MediaPipe package, verifies the cached model by
SHA-256, and downloads the pinned version only if absent/invalid. Asset writes are
atomic; a checksum mismatch never replaces an existing model. First preparation
needs network access, but valid cached assets can be prepared offline. An invalid
cache cannot support offline startup. Fetches have a 60-second timeout.

The generated files under `public/mediapipe/` must be included in the deployment's
static assets. Keep the source-controlled LICENSE/NOTICE. A dependency upgrade
requires regenerating assets so SDK and WASM versions continue to match. See the
asset-license inventory for model URL, checksum, and attribution.

## Reuse from A2

- `useHandTracking()` returns `videoRef`, `snapshotRef`, `diagnosticsRef`, lifecycle
  `state`, and `start()`/`stop()`. Attach `videoRef` to one muted, plays-inline video.
  The hook owns cleanup; consumers must not stop its stream or mutate observations.
- `TrackingSnapshot` contains `tMs` (`performance.now()` milliseconds) and nullable
  `left`/`right` raw observations. Null means no valid observation for that frame.
  A 500 ms watchdog clears observations if video stops producing results. Consumers
  should also check age before using a snapshot after browser suspension.
- `RawTrackedHand` contains stable `handedness`, `handednessConfidence`, 21 image
  landmarks, 21 world landmarks, and image-space `palmCenter` (mean of 0/5/9/17).
  Confidence is the SDK's classification probability for the assigned label (the
  complement of its reported score if continuity overrides its label), not
  geometric accuracy or a per-hand tracking/presence score.
- Image landmarks remain **unmirrored SDK coordinates**, with image Y downward.
  World landmarks remain SDK local hand coordinates; their origins differ per
  hand. Neither is calibrated scene geometry. A2 owns conversion to
  `scene-canonical-v1`; never apply preview mirroring to raw control data twice.
- Existing shared `HandFrame` is unchanged. A2 must derive real calibrated pinch,
  rotation and control values before creating one. A1 supplies no placeholder poses.
- Diagnostics expose backend, fallback reason, inference time (including bitmap
  capture/transfer), completed frames in the preceding second, and total frames.
  Snapshots/diagnostics use refs; lifecycle state changes only on lifecycle events.
  The HUD samples at 4 Hz. Canvas drawing runs independently of React rendering.

## Scheduling, identity, and fallbacks

The worker is bundled as a **classic worker** by Next/Turbopack. Use MediaPipe's
classic WASM loader (`FilesetResolver.forVisionTasks(root, false)`), including inside
the worker. Its ES-module loader fails under Turbopack's classic `importScripts`
bootstrap. The real-runtime browser test guards this integration.

Initialization tries GPU, then CPU. Unsupported/failed worker initialization falls
back to main-thread inference; a runtime worker/capture failure may switch once to
that fallback. A fallback failure ends the session with retry instructions. The
fallback uses the same GPU-then-CPU setup and 30 FPS cap. Debug mode reports why
fallback happened. Main-thread synchronous WASM cannot be preempted by a JavaScript
timer; worker frame and bitmap capture waits are bounded at two seconds, while
detector initialization is bounded at 15 seconds.

Only one frame is processed at a time, including bitmap capture. Video callbacks
are preferred; animation callbacks deduplicate `video.currentTime` when unavailable.
Intermediate frames are skipped, not queued. Background visibility pauses inference,
clears observations/identity history, and rejects results from before that change;
foreground visibility resumes without another permission prompt. The camera stream
remains open during background suspension. Stop, navigation, unmount, disconnect,
or terminal errors release it. Stopping during a pending permission prompt also
stops any stream returned later. Session generations reject late results from an
earlier start; worker frame IDs correlate responses.

Identity assignment examines both possible slot assignments rather than trusting
SDK array order or screen side. It uses image-palm distances and confidence-weighted
label disagreements. Recently observed identities are reserved for 500 ms without
publishing stale landmarks. Equally plausible assignments are missing rather than
silently swapped. Defaults are named constants in `hand-identity.ts`; tests cover
crossings, conflicting labels, and reacquisition. Complete overlap cannot guarantee
identity; remove/re-show hands or restart if labels were initialized incorrectly.

No raw frames or landmarks are recorded, persisted, or uploaded by Steady. MediaPipe
1.1.1's upstream README says input processing is on-device and the SDK may send
performance/usage metrics to Google; see its [privacy notice](https://goo.gle/mediapipe-privacy).
Do not describe all SDK network activity as absent. Tracking continues after assets
load if network access is lost. This is an educational simulation prototype.

## Verification

Automated checks:

```bash
npm run prepare:vision
npm run typecheck
npm run lint
npm test
npm run test:e2e -- tests/e2e/hand-tracking.spec.ts --workers=1
npm run build
```

Install the matching browser once with `npx playwright install chromium --only-shell`.
Playwright uses Chromium's synthetic video device. Mocked detector tests cover
repeat starts/stops, permission retry and debug visibility; the real worker test
loads the actual local model/WASM, processes synthetic frames, and keeps processing
offline. A separate test runs the actual main-thread fallback without workers. These do not
prove anatomical handedness accuracy, landmark quality, or laptop-camera speed.

Before declaring full A1 acceptance, manually verify on the target Mac:

1. Start explicitly; show each known anatomical hand separately, then both. Confirm
   labels and cyan/amber overlays line up with the mirrored preview, including
   after resizing and with a 4:3 camera feed.
2. Track both hands for two uninterrupted minutes. Record actual FPS and inference
   time; target 20–30 FPS. Check the React profiler for frame-driven rerenders.
3. Cross hands slowly, overlap briefly, remove/reintroduce each hand, and try bright
   and moderate lighting. Missing hands must never appear as fresh observations.
4. Switch tabs and return. Stop and restart several times. Navigate away and confirm
   the camera indicator turns off. Disconnect/reconnect an external camera.
5. Deny permission and retry after granting it. Simulate missing model assets and
   worker failure. Confirm actionable errors or the displayed fallback backend.
6. Disconnect the network after assets are loaded and verify tracking continues.

Record measured outcomes in CONTEXT.md. Physical-camera/React-profiler checks remain
manual until actually performed; synthetic browser tests do not substitute for them.
