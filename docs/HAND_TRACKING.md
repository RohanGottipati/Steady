# Hand tracking and calibrated controls (A1/A2)

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
- Existing shared `HandFrame` is unchanged. A2 now derives calibrated pinch,
  rotation and control values through `useHandControls(tracking)`. A1 continues to
  supply raw observations without placeholder poses.
- Diagnostics expose backend, fallback reason, inference time (including bitmap
  capture/transfer), completed frames in the preceding second, and total frames.
  Snapshots/diagnostics use refs; lifecycle state changes only on lifecycle events.
  The HUD samples at 4 Hz. Canvas drawing runs independently of React rendering.

## A2 calibration and control handoff

Start the camera, then select **Calibrate controls**. The three automatic stages are:

1. **Neutral/open:** hold both open hands steady for 750 ms of valid observations.
2. **Pinch:** close each thumb/index pair and hold for 750 ms.
3. **Workspace:** keep palms open toward the camera. Follow the arrow checklist
   above the webcam and move **one hand at a time** from its neutral position left,
   right, up and down in the mirrored preview. Hold briefly until each arrow checks
   off, then follow the next prompt. Keep the other hand relaxed and visible.
   Each hand needs at least 1,500 ms of valid observation plus all four directions;
   simply holding still cannot complete it. Completed arrows remain saved through
   tracking interruptions and tab suspension.

The three seconds are valid sampling time, not a guaranteed wall-clock duration.
Both hands must eventually be observed. Invalid geometry, ambiguous labels, wrong
poses, sample gaps over 120 ms, or instability reset the stationary stage's sample
window. In workspace, each hand is captured independently; invalid input or gaps
reset only its unfinished directional holds, not confirmed directions. Missing
hands cannot earn credit or finish calibration. Neutral/pinch time out after 15
foreground seconds each; workspace allows 45 seconds. **Retry workspace** preserves
confirmed arrows and neutral/pinch measurements; **Start calibration over** or
cancel clears everything. Background time is excluded from all stage timeouts.

Calibration uses median centers/scales/pinch ratios, sign-aligned quaternion
averaging for a stable neutral palm, and the median of each confirmed directional
hold for workspace range. Each excursion must reach at least 0.035 image-height
units and remain there for 120 ms across at least three valid observations. A
single-frame outlier cannot check off an arrow. Neutral
pinch ratio must be at least 0.55; closed ratio must be at most 0.5 and at least
0.15 below open. These are prototype defaults, not anatomical or clinical criteria.

### Reusable interface

`useHandControls(tracking)` composes with the **same** `useHandTracking()` instance;
it does not acquire or release a camera. It returns:

- `snapshotRef`: high-frequency `ControlSnapshot` for A3 to consume in `useFrame`.
- `calibrate()` / `cancel()`: explicit calibration/reset actions. After a workspace
  timeout, `calibrate()` retries that step in place while the camera format matches.
- `setPlanar(boolean)`: constrain depth to the configured neutral Z.
- `ui`: a 4 Hz UI sample containing calibration state, profile and controls.

The deterministic implementation is `HandControlsController` in
`src/lib/vision/hand-controls.ts`; types are in `control-types.ts` beside it. The
constructor accepts `ControlMappingOptions` overrides for rest positions, XY
travel, maximum depth and rotation. No shared schemas or schema version changed.

`CalibrationProfile` contains video dimensions and independent left/right profiles
with neutral center, apparent palm scale, neutral rotation, open/closed pinch,
derived enter/release thresholds, and positive left/right/down/up movement ranges.
Profiles are tied to the current camera stream and dimensions. Stop, error,
restart, stream replacement, format change, unmount and Activity teardown clear
them. Backend fallback and ordinary tab suspension preserve them with recovery
gating. Profiles and calibration samples are memory-only.

`ControlSnapshot` exposes `sourceTMs`, `calibrated`, `canProgress`, and nullable-target
left/right slots. `sourceTMs` is the last consumed source timestamp, **not** a render
timestamp; do not record a new sample merely because the display callback ran.
Each slot exposes status, `lastSeenMs`, a nullable `hand`, a nullable/held `target`,
and `rotationHeld`. Consumers must not mutate snapshots, profiles, or their arrays.

- `hand` is an existing-schema `HandFrame` only for usable current input.
  Landmarks/world landmarks and `palmCenter` stay in unmirrored SDK coordinates.
  `palmRotation` is the neutral-relative, clamped and filtered canonical rotation
  actually supplied to the target; `pinchRatio` is the **measured** world-space
  thumb/index distance divided by MCP palm width. `isPinching` is debounced.
- `confidence` preserves A1's assigned-label classification probability. It is
  not landmark accuracy. Calibration requires clear labels (at least 0.75);
  live label confidence below 0.5 holds orientation and inhibits progression,
  while geometric position/pinch remain available.
- `ToolControlTarget` contains `id`, canonical `position`, `rotation`, and
  `jawClosed`. A3 owns instrument geometry, tip position and held objects. Do not
  fabricate a `ToolState` with a placeholder tip or interpret missing targets as
  release events.

### Coordinates and filtering

Image center displacement maps once to user-right/up coordinates. Apparent palm
width uses image aspect ratio; local world coordinates provide palm basis and
scale-independent pinch, never absolute scene position. World points are reflected
into the control convention before reconstructing a right-handed orthonormal
basis. Reflection matrices themselves are not converted to quaternions. Relative
orientation is `current * inverse(neutral)` in the canonical basis.

Default rest positions are left `(-0.5, 0, 0)` and right `(0.5, 0, 0)`, with ±0.75
scene-unit XY travel around each rest. Depth is
`clamp(2 * (apparentScale / neutralScale - 1), -1, 1) * 0.15` around neutral Z.
Smaller hands appear farther away; larger appear nearer. Palm tilt can also affect
this proxy. Use **Planar depth fallback** in debug mode if depth is unstable.
These are normalized simulator units, not measured centimeters.

Position uses timestamp-based [One Euro filtering](https://gery.casiez.net/1euro/),
with a control-specific min cutoff of 3 Hz, beta 0.75, and derivative cutoff 1 Hz.
Quaternion smoothing uses the same base cutoff/gain with a 1 Hz smoothed angular
speed and shortest-path spherical interpolation. The generic filter's defaults
remain unchanged. These control settings replace the initial 1 Hz / beta 0.5
tuning after Person A reported slight lag throughout movement.
Relative orientation is capped at 90°. A jump over 60° within 120 ms holds the
previous orientation; a stable new pose is accepted after three consistent samples
and smoothly approached. Degenerate geometry never produces a fabricated pose.
Synthetic 0.5 Hz motion tests at 20/30 tracking FPS showed about 119–121 ms of
position-filter phase lag with the old settings. Regression tests now require
position **and** rotation filter phase lag below 70 ms, while suppressing injected
stationary jitter to less than 45% RMS amplitude. These measure filter response,
not camera-to-display latency; target-Mac verification remains necessary.
The numeric HUD samples at 4 Hz independently of the canvas/display loop.
A3 should additionally
interpolate display transforms without changing the control/evaluation stream.

Each hand's enter threshold is `closed + 0.28 * (open - closed)` and release is
`closed + 0.40 * (open - closed)`. State changes require 100 ms of uninterrupted
observations beyond the appropriate threshold. The deadband preserves grip.
Calibration thresholds and live measured ratios are displayed in debug mode.

### Loss and recovery

Source timestamps are consumed once. Duplicate, reordered, future and nonfinite
timestamps cannot advance calibration, pinch debounce or recovery. A2 expires
observations at 200 ms even if A1's camera callback stalls before its watchdog.
Missing or invalid hands clear `hand` and inhibit `canProgress` immediately.
Targets and grip remain held: `grace` before 200 ms, `lost` afterward. Visibility
and backend suspension mark controls unavailable immediately.

Recovery requires three consecutive valid frames per hand, with gaps at most
120 ms. Positions resume from the held target with fresh filter derivatives;
pinch evidence restarts while retaining the last grip state. Reopening after
recovery still requires the debounce interval. Neither an absent hand nor a
background tab auto-releases anything. A3/A4 must honor `canProgress` and treat held
targets as held controls, not new observations or exercise events.

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

Person A reviewed the preview on 2026-10-17 and reported it looks good. The formal
two-minute physical-camera soak, profiler, and measured performance checks below
remain pending; preview approval does not imply those measurements were taken.

After the workspace guidance/recovery fix, Person A retried the A2 preview on
2026-10-17 and explicitly confirmed that calibration completes and pinching opens
and closes the controls. Those manual checks passed. After receiving the remaining
recovery/rotation/depth/crossings/two-minute checklist, Person A reported that it
seems all mostly good, with no specific remaining failure identified. This is
broad qualitative feedback; individual results, a measured soak, FPS/latency and
profiler evidence have not been supplied.
Person A subsequently reported slight lag throughout movement. Control-specific
filter tuning and synthetic responsiveness/jitter tests were added. Person A
retested and accepted the revised responsiveness for now on 2026-10-17. This is
qualitative acceptance; measured end-to-end latency, tracking FPS and inference
time have not been recorded.

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

A2 unit tests additionally cover calibration quality/timeout/cancellation,
coordinate mapping and aspect ratio, independent profiles, pinch chatter and
interrupted evidence, filtering, quaternion limits/signs, malformed/stale input,
frozen video, grip-preserving loss, recovery and crossing. Hook regressions cover
Strict Mode, Activity teardown/resume, stream changes, backend suspension, tab
visibility, and absence of frame-driven React rendering. A2 browser scenarios use
nondegenerate synthetic hands through the worker boundary to calibrate, move,
pinch, lose/recover, cancel/retry, use planar depth and restart the camera.
Workspace regressions also cover independent hand capture, sequential directions,
preserved completed arrows through missing/weak/closed-hand input and suspension,
rejection of single-frame spikes, and workspace-only retry after its 45-second
timeout. Browser coverage verifies the visible arrow checklist and completion
with one hand moving at a time across a tracking interruption.

Run both browser files with `npm run test:e2e -- --workers=1`. For a local-only
unit run use `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`; the B0
integration file applies migrations and seeds to the configured database.

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

Before declaring A2/M1 physically accepted, also verify:

1. Complete the three stages with real hands. Check timeout/retry, interrupted
   poses, lighting and left/right correctness. Record actual calibration duration.
2. Hold hands still, then move deliberately along each axis. Inspect jitter and
   responsiveness, including 4:3 input. Measure latency rather than assuming the
   target (<120 ms median) was achieved.
3. Pinch repeatedly and partially around each displayed threshold. Remove a
   pinching hand briefly and for more than 200 ms; verify held grip, paused
   progression, smooth recovery and deliberate release.
4. Rotate gradually, cross/overlap hands and move toward/away from the camera.
   Confirm no flips; compare constrained depth with the planar fallback.
5. Switch tabs, stop/restart, resize the display and disconnect/reconnect the
   camera. Profiles must survive ordinary tab suspension but require recalibration
   for a new stream or capture format. Check profiler behavior during a two-minute
   soak. Record measured tracking FPS, latency, lighting and hardware in CONTEXT.md.
