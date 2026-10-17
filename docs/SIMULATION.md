# A3/A4/A5/S1/A6 simulation, training, and replay handoff

The development-only `/dev/hand-tracking?debug=1` route combines A1/A2 tracking and
calibration with two kinematic 3D instruments, the A4 Needle Passing exercise
state machine, and the A5 translucent ghost motion renderer. Start the camera, calibrate, approach
the needle’s pickup circle with an **open** colored tip ring, wait for the circle
to turn green and the “tip aligned” prompt, then pinch. Guide the held needle
through Entry Ring 1, rotate your wrist through Apex Ring 2, exit through Ring 3,
move into the upper-right release ring, and open to release. **Reset scene** restores the needle, exercise progress, and ghost playback without restarting camera/calibration.
The route remains 404 in production.

The background grid is a visual guide; the needle has the only large pickup
circle, while the three mounted target rings (`ring-1`, `ring-2`, `ring-3`), the
corridor guide arc, the release ring, and the lower `tissue-wall` danger bar drive
A4's 8-segment exercise progression. In `Learn` mode (and in `Practice` mode when toggled
on or auto-triggered), A5 renders translucent reference instruments, a ghost needle,
and reference tool-tip path trails (`0.5x`/`1x` speed, `progress-coupled`/`continuous` sync,
and runtime switching between the canonical synthetic reference and the workspace-fitted
JIGSAWS `Needle_Passing_E005` expert trial). S1 connects these systems to `/train/needle-passing` with deterministic results; dual
user-versus-reference post-attempt replay is now available through A6. This is an educational motion-control
prototype; task-object physics and anatomical fidelity are not claimed.

## S1 runtime, results, and local persistence

`TrainingSession` composes one existing tracker/control hook on the product route.
Quick start retains its preset workspace/pinch defaults but now captures each visible
hand's neutral wrist orientation and palm scale from its first eligible open observation
after the normal three-frame recovery gate. Using identity as the SDK wrist baseline
could clamp a neutral hand at 90° and block entry. Every quick-start click resets the
attempt and control-filter history; full guided calibration remains unchanged.
`TrainingRuntime` owns simulation, exercise, ghost, B6 coaching, attempt identity,
and completion. `SceneContent` calls `runtime.advance(liveControls, delta, now)` once
per visible display frame. The older controller props remain usable for isolated
scene tests. The runtime never writes into the webcam-owned control ref.

- Camera samples retain their original freshness/duplicate/reordering gates. Fixtures
  consume sequential 30 Hz numerical samples with a separate monotonic clock; elapsed
  display time accumulates with a 100 ms per-frame cap. Learn holds the first waypoint
  during its demonstration instead of consuming grasp/entry frames. Fixture pickup
  always uses assistance; the webcam's assistance preference is preserved.
- Mode, source, one-hand, assistance, and explicit retry transitions reset recording,
  fixture cursor, coaching, result, and attempt identity. Source changes explicitly reset
  source watermarks; ordinary simulation resets retain stale-input protection.
  Hidden tabs/context loss suspend progression and cancel pending coaching. Restoration
  resumes from fresh input without catching up the hidden interval. Fixtures re-seed
  their last generated pose before the next waypoint to preserve a paused close edge;
  this seed is not an additional evaluation frame.
- Completion freezes one validated `CompletedAttemptBundle`, so further camera frames
  cannot rescore or save duplicates. Stopping the camera preserves that result.
  Recording-limit/incomplete/evaluation failures show a restart action and never save
  a partial score. Route/effect cleanup releases camera resources and invalidates old
  asynchronous UI updates. The scene's React boundary supplies renderer retry.
- Evaluation uses the authoritative recorded tool stream and a snapshot of the
  unsmoothed canonical scene guide, independently of ghost source, smoothing, speed,
  and visibility. Right-tool attempts swap the canonical active reference slot;
  one-hand attempts park the inactive reference slot at the recorded rest pose.
  Shared `AttemptResult`, `SavedAttempt`, and the 20-metric order are unchanged.
- `EvaluationScene.dangerBoxes` adds optional axis-aligned boxes alongside the existing
  sphere API. S1 supplies `TISSUE_WALL_ZONE` directly. The exercise and metric use
  inclusive boundaries with a `1e-9` numerical tolerance. The safety metric measures
  aligned tool-tip occupancy; it is not continuous needle-body collision detection.
- `CoachingSignalsAdapter` derives finite-difference speeds from accepted timestamps,
  held-needle corridor deviation, danger state, early release, required-minus-achieved
  rotation, and target-plane crossing followed by reversal. Interrupted histories reset.
  The runtime evaluates B6 every ~333 active ms. Rotation tolerance/range are 3°/12°
  to match A4's 12° gate. B6's 500 ms commit delay, suppression/cooldown/cap, and separate
  recording/message gates remain intact. Eligible messages appear as text; committed
  events populate `AttemptResult.importantEvents`. Assessment records/speaks nothing.
- `attempt-cache.ts` exposes asynchronous save/get/latest/clear functions using the
  existing `idb` dependency. Database `steady-attempts`, version 1, store `attempts`,
  keys by `result.id`; saved replay frames retain tool telemetry and omit raw hand
  landmark/debug observations. Writes/retention serialize and retain the newest 20 webcam
  attempts. Corrupt entries are ignored/pruned. Blocked opens time out after 1.5 s;
  quota, security, or unsupported-storage errors fall back to bounded memory. Saving
  never delays result presentation. Webcam attempts then POST a compact payload to
  `/api/attempts`. A failed or missing Tiger response keeps the IndexedDB row and
  records `cloudSyncStatus` `failed` so a later retry uses the same attempt id.
  Fixtures stay session-only, do not enter that queue, and do not call live speech,
  review, or upload APIs. Speech failures leave the on-screen coaching line. A failed
  replay chunk shows a retry that returns to training; scores already on the attempt stay.

Manual S1 acceptance on Chrome/macOS:

1. From a fresh library visit, start one camera, calibrate, watch Learn's ghost, and
   complete all eight segments. Check the inline result and all 20 metric details.
2. Stop the camera: the finished result must remain. Try again, restart the camera,
   and verify recalibration is required. Check one-hand completion on either side.
3. Deny permission, run each demo fixture, restart it, change mode, and return to
   webcam. No fixture should request a camera or enter normal saved history.
4. During a pass, leave/re-enter tracking, hide/restore the tab, and lose/restore
   WebGL. Progress must freeze and ownership must not drop solely because input paused.
5. Disable networking after local assets load. Finish a pass and verify results still
   work. With device storage blocked, verify the memory-only save message.
6. Check actual camera-track release when leaving the route. Record measured target-Mac
   FPS/latency/soak separately; synthetic Chromium input is not physical signoff.

## A6 recording and replay handoff

Implementation follows `docs/A6_PLAN.md` after pulling S1 PR #12 from main
(`a1f1c2a`). `TrainingRuntime` remains the single owner of active progression,
evaluation, and local saving. A6 does not add a competing recording/evaluation
loop, change shared schemas, or change the existing cache.

- `ExerciseController.getReplayRecording()` returns detached tool-only motion
  frames plus equally indexed `ReplaySceneFrame`s (needle world pose/owner and
  left/right visibility). Every evaluation frame, including short-segment and
  terminal frames, has a sidecar. No frame is recorded at display FPS. Overflow
  sets `truncated`; S1's existing recording-limit error prevents partial results,
  and the replay controller rejects truncated recordings.
- At completion the runtime freezes `lastReplay: CompletedReplay`: attempt ID,
  recording/sidecars, worst-moment markers, and the exact adapted, unsmoothed
  canonical scoring reference. It reuses S1's `adaptReferenceForAttempt`, including
  right-hand and single-hand adaptation. Ghost settings/JIGSAWS do not affect it.
  Use the reference snapshot, not a lookup by ID: the scene guide and committed
  synthetic reference currently share an ID but contain different trajectories.
- Runtime reset, calibration loss, camera stop, and WebGL retry preserve the
  latest completed replay. A new completed attempt replaces it. Replay packages
  contain no camera images or hand landmarks. They are memory-only and disappear
  on page reload/navigation; the original newest-20 tool-motion cache is unchanged.
- `ReplayController` (`src/lib/simulation/replay-controller.ts`) accepts
  `{ skillId, userFrames, reference, sceneFrames?, truncated? }`. Inputs are copied
  and validated. Empty inputs show an empty state; one-frame recordings are static
  in synchronized mode. Timestamps may be equal (last observation wins) but cannot
  decrease. Invalid tool IDs/geometry/quaternions and mismatched sidecars are rejected.
  Reference segments must form a single canonical Needle Passing sequence; raw
  JIGSAWS/repeated procedures are outside this chunk. Unknown/repeated user segments
  render without a synchronized comparison rather than fabricated matching poses.
- `play()`, `pause()`, `setSpeed(0.25 | 0.5 | 1)`, `setMode("synchronized" | "original")`,
  `seekTime(ms)`, `seekProgress(0..1)`, and `seekMarker(ReplayMarker)` control a
  ref-backed `snapshot`. `update(deltaSeconds)` advances display playback only;
  it never controls the simulation or recalculates scores. Time/progress seeks use
  the current mode's playback timeline and pause. Play at the end restarts.
- The review surface calls `seekToTaskStart()` once when opened: seek to three
  recorded seconds before the first confirmed `practice-needle` owner, relative to
  the recording's first timestamp, and remain paused. Clamp to the beginning for
  early pickups; use the beginning when no pickup exists. Scene ownership is
  authoritative when sidecars exist; tool-only recordings use `heldObjectId`,
  never jaw closure. Later releases/re-grabs do not move this initial anchor.
  Manual seeking and issue markers still cover the entire recording, and scoring
  uses all original frames. Renderer retries preserve the selected cursor.
- Synchronized mode uses the user timeline, with each segment aligned by normalized
  frame index, matching the evaluator's convention rather than A4's overall
  `normalizedProgress`. Original mode advances both recordings from their own start,
  using recorded timestamps, and holds whichever stream finishes first. Tracking
  pauses are absent from the active-attempt clock; neither mode recreates those
  wall-clock pauses.
- **Markers contain reference timestamps.** `seekMarker` locates that reference
  segment/frame progress, maps it into the user's segment, switches to synchronized
  mode, and pauses. It returns `false` without moving when the segment is absent.
  Paused marker alignment also preserves exact reference progress when a user
  segment has only one frame and its clock cannot represent that progress.
  Markers must come from evaluation against the supplied reference snapshot.
- Default rendering interpolates recorded tips and shortest-path unit quaternions,
  resolving grip origins through the shared `TIP_OFFSET`. Jaw/ownership/visibility
  changes occur at their observed frames, never halfway to an event. Optional
  `setSmoothing("centered-7")` averages only inside the same segment and event run,
  preserving endpoints and event-adjacent samples. `"recorded"` restores the exact
  samples. `setShowExpert`/`setShowPaths` control overlays. `getTrails()` supplies
  cached independent line-segment endpoints; invisible intervals create gaps.
- Held user needles use the recorded grip-relative attachment and the displayed
  owner pose; free needles use recorded world poses. Tool-only input has no needle
  rendering. The reference layer shows tool trajectories, without fabricating an
  unrecorded expert needle pose. Deviation connectors and angle readouts describe
  the currently displayed geometry, including optional smoothing; they are not
  replacements for authoritative score/evidence values.
- `ReplayScene` is a camera-independent client-loaded R3F scene, preloaded during
  training so an already-loaded session can open its first replay offline. It updates groups
  through refs, caches path geometry, and disposes replaced/unmounted resources.
  Its loop pauses on hidden tabs/context loss/teardown and discards stale resume
  deltas. Retry reuses the recording/cursor and requires explicit Play to resume.
  The training wrapper mounts either live training or replay, with 4 Hz UI sampling.

For B8, construct a controller with the recording and its exact evaluation
reference, pass it to `ReplayScene` with a stable `onStatus` callback, and call
`seekMarker(result.worstMoments[index])` from issue buttons. `ThreeDReplayPreview`
is the minimal A6 control surface/example. SavedAttempt's existing motion-only
frames also work, but B8/persistence must supply the matching reference adaptation;
the saved schema alone does not retain single-hand metadata or the needle sidecar.
A6 does not add history/reload navigation or silently reconstruct missing data.

Manual replay acceptance: finish either S1 fixture or a webcam pass, stop the
camera, open Replay latest attempt, and inspect pickup/early release/final release,
both timing modes, scrubbing, marker jumps, and each speed. Hide/show reference
and paths, compare recorded/smoothed views, hide/restore the tab, and lose/retry
WebGL. The cursor should stay put through interruptions. Return to training and
verify a fresh exercise, with the previous replay still available. Target-Mac
performance measurements remain a separate physical acceptance step.

## S2 narrated replay handoff

S2 uses the A6 package. Models explain measurements; they never score motion or
receive webcam video. The integration includes the live-review dependency needed
for narration; broader Tiger retrieval remains separate.

- `planReplayNarration` (`src/lib/simulation/replay-narration.ts`) chooses the
  focus marker and the sentence. Marker order is highest severity, then earlier
  `tMs`, then `metricId`, then `segmentId`. A non-empty
  `CompletedReplay.review.replayNarration` replaces the sentence and still focuses
  that marker. The deterministic sentence names the skill, segment, metric,
  explanation data, and severity. Empty marker lists produce no speech.
- `ReplayController.armFocusPause(marker)` plays from the current cursor,
  including the A6 `seekToTaskStart()` lead-in, and pauses on the marker's
  existing aligned pose. A cursor already at or past the marker pauses there
  immediately. `seekTime`, `seekProgress`, `seekMarker`, and `setMode` clear the
  arm so playback cannot snap back. `divergenceEmphasis` is true only during that
  pause. `focusPoint` is the midpoint of the larger displayed tip difference.
- `ReplayScene` turns the deviation connectors white and moves the orthographic
  camera onto `focusPoint` while emphasis is on, then restores the overview camera.
  Reference visibility is turned on at the pause so the existing comparison shows.
- `ThreeDReplayPreview` shows the sentence immediately. After the scene is ready
  it arms the focus pause, then calls `AudioManager.speak` once. Skip, play,
  mode changes, timeline seeks, and unmount call `cancel()`. Speech does not call
  `play()` or `seek`. Assessment's live `voiceCoachingLevel: "none"` path is
  unchanged; the post-attempt line still speaks. Speech failure leaves the text up.
- `TrainingRuntime` records `mode` and sets `review.replayNarration` from B8's
  `buildDeterministicReview`. One optional review request per completed webcam attempt
  replaces it only after schema/focus validation. Results and replay share the accepted
  review; reset invalidates older responses. Review is frozen when opening replay so
  a later response cannot change a sentence that is already being spoken.
  `ThreeDReplayPreview initialMarker` still holds the clicked issue instead of
  playing through it. B8's results chrome stays; narration is added on that surface.

## Interfaces and ownership

`HandTrackingPreview` owns one tracker and composes `useHandControls(tracking)`.
A3 receives that control ref and never acquires or stops a camera itself.

`ToolSimulationController({ assisted: true })`
(`src/lib/simulation/tool-simulation.ts`) provides:

- `update(controls, nowMs)`: accepts eligible source input and returns only that
  call's grab/release events, each with source timestamp, tool ID and object ID.
  Consumers process the return value once; events are not accumulated/persisted.
- `snapshot`: nullable left/right shared `ToolState` values, readiness/reason,
  last accepted simulation `sourceTMs`, assistance mode, and the needle's pose and nullable owner.
  Pausing retains the previous accepted timestamp, never a render timestamp.
- `suspend(reason?)`: holds poses/ownership and clears acquisition arming.
- `reset()`: restores the scene without release events. The reset `epoch` tells
  display code to initialize poses again. The source-consumption watermark is
  retained so an old observation cannot be replayed after reset.
- `attachment`: the object's pose relative to its owning instrument grip.
- `setAssisted(boolean)`: changes pickup mode and resets the scene without
  recalibrating or acquiring another camera. A new close edge is still required.
- `pickupFeedback(snapshot)`: shared geometry-derived radius, per-tool range state,
  readiness and actionable instruction for the visible halo and 4 Hz UI. An open
  in-range tool takes feedback priority over a nearer closed tool.

Snapshots/attachments/input are read-only to consumers. The controller copies
transform data without mutating A2. Simulation interfaces are owned by Person A;
shared schemas and data version remain unchanged. A4 consumes authoritative
snapshots/events, readiness and assistance mode; assisted poses must not be
treated as unassisted precision measurements. A5 can reuse instrument geometry
with its own poses and read A4's `modeHooks` and normalized progress.

## A4 exercise state machine and mode hooks

`ExerciseController` (`src/lib/exercise/exercise-controller.ts`) and
`needle-passing-config.ts` (`src/lib/exercise/needle-passing-config.ts`) bind to
Person B's `needlePassingSkill` (`src/data/skills/needle-passing.ts`) without
modifying shared contracts:

- **Checkpoints (`scene-canonical-v1`):**
  - `practice-needle` starts at `(0, 0.35, 0)`.
  - `ring-1` (Entry): `(-0.16, 0.24, 0)`, alignment radius `0.15` (assisted) / `0.13` (free), gate radius `0.11` (assisted) / `0.08` (free), orientation tolerance `<= 45°`.
  - `ring-2` (Apex / Rotation): `(0, 0.18, 0)`, engagement radius `0.13` (assisted) / `0.11` (free), gate radius `0.11` (assisted) / `0.08` (free), required wrist rotation delta `>= 12°` relative to the orientation captured at `entry`.
  - `ring-3` (Exit): `(0.16, 0.24, 0)`, gate radius `0.11` (assisted) / `0.08` (free).
  - `release-zone`: `(0.20, 0.36, 0)`, radius `0.10` (assisted) / `0.08` (free).
  - `tissue-wall` danger zone: box centered at `(0, 0.01, 0)` with half-extents `(0.35, 0.06, 0.12)` (`y ∈ [-0.05, 0.07]`).
- **Phases and 8-segment sequence:**
  - `idle -> demonstration (Learn mode only) -> active (approach -> grip -> align -> entry -> rotation -> exit -> release) -> complete`.
  - Invalid-action guardrails: un-held tools cannot advance past `grip`; touching later rings out of order cannot skip earlier segments; early needle release sets `needleDropped: true` and holds the active segment until re-acquired; penetrating `tissue-wall` sets `inDangerZone: true`, increments `dangerZoneCount`, accumulates `dangerZoneDurationMs`, and blocks forward segment transitions until clear.
- **Mode behavior hooks (`ModeBehaviorHooks`):**
  - `learn`: enters `demonstration` phase on calibration (`3,000 ms` foreground timer or `Start attempt`), keeps `ghostVisible: true`, `canToggleGhost: false`, `showPathGuide: true`, `highlightCurrentTarget: true`, `voiceCoachingLevel: "full"`, `showLiveCoaching: true`.
  - `practice`: starts in `active` (`approach`) with `ghostVisible: false`, `canToggleGhost: true` (`toggleGhost()`), and auto-enables `ghostVisible: true` (`ghostAutoTriggered: true`) after `1,500 ms` of sustained corridor deviation (`> 0.12` units).
  - `assessment`: starts in `active` (`approach`) and strictly enforces `ghostVisible: false`, `canToggleGhost: false`, `ghostAutoTriggered: false`, `showPathGuide: false`, `highlightCurrentTarget: false`, `voiceCoachingLevel: "none"`, `showLiveCoaching: false`.
- **Recorded motion output (`getRecordedMotion()`):**
  - Appends one validated `MotionFrame` per accepted `sourceTMs` during the active attempt plus the terminal `complete` frame, directly consumable by Person B's `evaluateAttempt(recorded, reference)` (`src/lib/evaluation/evaluate.ts`).

## A5 ghost motion renderer and reference workspace fitting

`GhostPlaybackController` (`src/lib/exercise/ghost-playback.ts`),
`ghost-reference.ts` (`src/lib/exercise/ghost-reference.ts`), and
`GhostLayer` (`src/components/scene/ghost-layer.tsx`) consume B2/B4 `ReferenceMotion`
JSON and A4's `ExerciseSnapshot` without modifying shared contracts or committed
reference files:

- **Grip-to-tip geometry alignment (`resolveGhostToolPose`):**
  - `reference_builder.py` sets `ToolState.position` equal to `ToolState.tipPosition`, whereas `Instrument` meshes place their origin at the grip and jaw tips at local `TIP_OFFSET = (0, 0.35, 0)`. `resolveGhostToolPose` normalizes `tool.rotation` and computes `gripPosition = tipPosition - applyQuaternion(TIP_OFFSET, rotation)` so the translucent ghost instrument tips always sit on `tipPosition` and match the reference path trail.
- **Sub-frame 30 Hz interpolation & playback speeds:**
  - `sampleReferenceAtTime`, `sampleReferenceAtProgress`, and `sampleReferenceInSegment` locate bracketing 30 Hz frames and interpolate positions linearly (`lerpVec3`) and rotations via shortest-path quaternion `slerpQuat` (`dot < 0` sign flip + unit normalization) at display refresh rate (`useFrame`), eliminating 30 Hz stepping.
  - Supports `0.5x` and `1x` playback speeds (`setSpeed(0.5 | 1)`).
- **Synchronization modes (`progress-coupled` vs `continuous`):**
  - `demonstration` phase (`Learn` mode): plays across `[0, 1]` scaled by `speed`.
  - `progress-coupled` mode (default during active `Learn`/`Practice` attempts): binds the ghost to the user's `segmentId` and `segmentProgress` with a `12%` lead offset (`leadOffset = 0.12`). If the user stalls for `>= 600 ms`, the ghost smoothly micro-loops the local segment window (`activeBehavior: "stall-loop"`) so it demonstrates the immediate next motion without racing ahead.
  - `continuous` mode: loops the full reference trajectory at `0.5x` or `1x` speed.
  - Strict mode-hook gate: whenever `exerciseSnapshot.modeHooks.ghostVisible` is `false` (always `false` in `Assessment` mode, and `false` by default in `Practice` mode until manually toggled or auto-triggered), `GhostLayer` and ghost playback controls are strictly hidden.
- **7-frame display smoothing & JIGSAWS expert workspace fitting:**
  - Defaults to `needle-passing-reference-v1.json` (preloaded synchronously so unit tests and initial frames require no network wait).
  - Supports runtime switching to `/references/needle-passing/needle-passing-jigsaws-expert-v1.json` (`Needle_Passing_E005`, 3,233 frames). `prepareGhostReference` maps JIGSAWS gesture spans (`G1..G11`) onto the 8 `NeedlePassingSegment` phases, fits raw metre tool-tip coordinates into `DEFAULT_WORKSPACE_BOUNDS` (`x ∈ [-0.26, 0.26]`, `y ∈ [0.14, 0.36]`, `z ∈ [-0.05, 0.08]`, above `tissue-wall`), applies 7-frame centered display smoothing, and displays the required Gao et al. (2014) attribution in the UI.

## Geometry and interaction

Coordinates are `scene-canonical-v1`: +X user-right, +Y up, +Z toward camera, in
normalized simulator units. Instrument origins are their grips; local +Y points
forward. Both contact-center offsets are `TIP_OFFSET = (0, 0.35, 0)`; tip position
is grip position plus the rotated offset. Jaws and tip indicators use this same
constant. Valid quaternions are normalized. Invalid/nonfinite/zero/overflowing
geometry rejects the entire sample before either tool is published.

The curved `practice-needle` starts at `(0, 0.35, 0)` with identity rotation. Its
green marker is a centerline point and the local grab anchor. A fresh open-to-closed
transition inside the visible halo can acquire it: **0.16 units** with Easy pickup
(default), **0.10 units** with free 3D depth. Closing outside
then entering while closed cannot; reopen to rearm. First closed observations
after initialization/reset/recovery do not acquire it.

One tool owns the needle. Simultaneous candidates are ordered by distance, then
tool ID (`left-tool` wins exact ties). In Easy pickup, each actual instrument
grip is translated along Z so its rotated contact center stays on working plane
Z=0; XY and orientation still come from A2. Acquisition snaps the needle marker
to that contact center, then follows it. The input control snapshot is untouched.
With assistance off, full A2 depth is retained and attachment preserves the
needle’s world pose via a grip-relative transform. Both modes follow the owner's
authoritative pose. A fresh eligible
open observation releases at the current pose without gravity. Only objects free
at sample start can be acquired: there is no same-sample handoff.

## Freshness, interruption and lifecycle

The controller can run at display FPS but consumes each source once. Source and
current time must be finite; source cannot be future/reordered and age must be
less than 200 ms. Both slots require a usable current hand, matching last-seen
timestamp, tracking status, non-held rotation, valid targets, and `canProgress`.
Duplicate callbacks cannot advance interaction or resume a suspended simulation.

Missing/recovering controls, held orientation, stale input and suspension freeze
**both** instruments and preserve ownership. Suspension and source gaps over
120 ms clear acquisition arming. A fresh eligible open observation after recovery
may release an existing object; loss itself never releases. A2 retains ownership
of its three-frame recovery and pinch debounce.

Uncalibrated input, camera stop/error, new stream/format, recalibration/cancellation,
scene reset and teardown clear simulation ownership without release events. The
wrapper observes calibration loss even if renderer failure removed frame callbacks.

The scene is client-loaded with an isolated loading/error fallback and **Retry 3D
scene** action. Camera controls remain usable after rendering failure. Context
loss freezes ownership; restoration requires fresh eligible input. Explicit
renderer retry resets the scene while retaining camera/calibration. Visibility and
context listeners, frame subscriptions, timers and GPU geometry/materials follow
React/R3F cleanup, including Strict Mode and Activity teardown.
Activity resume reads actual GL context state so restoration while listeners
were detached cannot leave a stale lost flag or allow progress on a lost context.

## Display and diagnostics

The front-facing orthographic camera is `(0, 0.15, 4)`, looking down -Z. Zoom is
fit to a 3.6-by-2.6-unit workspace on resize; pixel ratio is capped at 1.5. This
removes perspective parallax from alignment. Instruments are now flat ridged
tweezers and an angular pistol-grip needle holder, without the old paired finger
loops. Room, pad/grid, tools, cursors, halo and needle are procedural geometry;
there are no external model downloads.

Authoritative samples and display poses are separate. Position lerp and shortest-
path quaternion slerp use `alpha = 1 - exp(-40 * min(deltaSeconds, 0.05))`. First
poses initialize directly; recovery skips its first interpolation step to avoid
elapsed-time jumps. Held-object display follows the interpolated owner and local
attachment. Free-object interpolation preserves release continuity. Display poses
and render timestamps never become interaction/evaluation input. Assisted display
poses reapply the contact-plane constraint after interpolation, so visible tips
and readiness agree even during wrist rotation. Cyan/amber crosshair rings follow
the displayed tips independently of palm rotation; the needle halo turns green
only when a usable open tool is in range. Closed-in-range feedback requests
reopening; free-depth mismatch feedback requests moving closer/farther or enabling
Easy pickup. Decorative rings were replaced with a muted grid to avoid false
pickup targets.

If an assisted display projection is rejected, that instrument keeps its preceding
visible pose/jaws. An instrument without a valid first pose stays hidden and
initializes directly once projection succeeds. This fallback does not fabricate
an authoritative pose or reset the renderer. Pickup feedback tolerates absent tool
poses even if a consumer supplies inconsistent readiness.

Mesh updates run through refs in `useFrame`; UI samples at 4 Hz. Debug mode reports
actual rendered group poses separately from authoritative tool poses, tips/jaws,
ownership, source timestamp, render FPS, median FPS and p95 frame interval. Timing
retains at most two minutes/20,000 numerical intervals, includes foreground stalls,
and clears on reset, tab hiding, context loss and teardown. Median FPS is 1000
divided by median frame interval. These are render timings, not sensor-to-display
latency. A3 saves/uploads no camera images, landmarks or attempt telemetry.

## Verification and outstanding physical acceptance

Run typecheck, lint, unit tests excluding the B0 migration/seed integration file,
all Playwright tests with one worker, and the normal production build. Configured
health tests make read-only database queries and need network access. B0's
migration/seed integration is outside A3's verification scope.

New unit tests cover geometry/attachments, schema compatibility, malformed input,
grab boundaries/competition, release, loss, time ordering, reset, interpolation
and render timing. Position and rotation display interpolation must add <30 ms
phase delay at 20/30 source FPS and 60/120 display FPS, without frozen-output
false positives. Existing A2 responsiveness/jitter tests remain intact.

Scene integration tests use actual Three.js groups with controlled frame callbacks
to verify display freeze/recovery/release, frame-free React updates, Strict Mode,
Activity, visibility, context events and cleanup. Chromium tests exercise synthetic
hands through the worker boundary and the actual WebGL scene, context restoration,
unavailable-WebGL retry, single camera ownership and navigation cleanup. A visual
capture is saved at `test-results/a3-instruments.png`, plus the aligned state at
`test-results/a3-ready.png`. Tests also exercise acquisition with depth drift and
assistance switching/reset without recalibration. Existing real MediaPipe
worker/offline/main-thread tests remain in the regression suite.

Before physical signoff on the target Mac/latest Chrome:

1. Record hardware, browser, lighting and calibration duration. Pick up, move,
   rotate and release with each instrument; inspect tip/jaw alignment and reach.
   Keep Easy pickup enabled first. Check that its halo/prompt accurately predicts
   acquisition, then compare with assistance off and its depth instructions.
2. Remove either hand briefly and for >200 ms while holding. Both tools must freeze,
   ownership must persist, and recovery must be smooth. Check crossings/overlap,
   held rotation, tab switching, scene reset, recalibration and camera restart.
3. Navigate to Library and confirm camera release. Inspect React Profiler for
   frame-driven updates; numeric HUD sampling should remain at 4 Hz.
4. After calibration, reset the scene to clear timing, then run a two-minute active
   session without hiding the tab. Record median render FPS, p95 interval, tracking
   FPS and inference time. Targets: median render >=55 FPS, p95 interval <=33.3 ms,
   tracking approximately 20–30 FPS.
5. Measure hand-to-screen latency separately (project target <120 ms median).
   Record results and measurement method in CONTEXT. Synthetic delay/render timing
   cannot substitute for this measurement or the A1/A2 physical checklist.

Screenshots and synthetic browser tests do not establish physical-camera accuracy
or target-Mac performance. See CONTEXT for actual automated outcomes/build blockers.

## A7 Peg Transfer on the shared engine

`/train/peg-transfer` uses the same `TrainingSession`, `TrainingRuntime`, and
`ExerciseController` as Needle Passing. The second skill is config:

- `SkillDefinition` in `src/data/skills/peg-transfer.ts` with segments
  `reach → grasp → lift → transfer → place → release → complete`.
- Scene checkpoints in `peg-transfer-config.ts`: left post `(-0.225, 0.20, 0)`,
  midline `(0, 0.34, 0)`, right post `(0.25, 0.19, 0)`, and `board-edge`
  centered at `(0, 0.02, 0)`.
- Metric weights emphasize bimanual coordination, path similarity, and grip timing.
  Corridor tolerance is `0.14` (Needle Passing stays `0.12`) and the practice
  auto-ghost wait is `1600 ms`.
- The committed adapter fixture is unchanged. Runtime scoring and the ghost use a
  fixed internally authored Z=0 demonstration through the shared segment engine.
  Merely projecting the sparse adapter file mismatched the scene gates and scored
  a correct transfer poorly. The corrected reference matches those gates without
  changing metric thresholds; perturbed paths still score worse. Segment ids are
  not rewritten onto Needle Passing phases.
- A grasp on the right post, an early release, or a move to the right post that
  skips the midline does not advance. Assessment still forces the ghost, path,
  and live coaching off.
- `?fixture=peg-transfer-good` plays that path without a camera. Needle Passing
  fixtures stay on `/train/needle-passing`. Suturing and knot-tying remain
  coming-soon. Real LASK data is not included.

## Integrated review, audio, and acceptance

`TrainingRuntime.review` owns the deterministic or accepted model review for the
current attempt. It makes at most one request per webcam completion, and no request
for fixtures. The request includes measured metrics/explanations and complete top
marker evidence. Backboard uses X-API-Key, Google Gemini 2.5 Flash, JSON output,
memory off, and web search off. Invalid output, a different focus segment, or an
unavailable provider retains the deterministic review and the original scores.

Training and replay share one AudioManager. User playback clears automatic focus
arming even if the cursor is already at zero; skip/seek/exit/reset cancel obsolete
audio. Fixture narration uses browser speech without requesting live synthesis.
A total audio failure leaves the explanation visible. Assessment's active attempt
still has no ghost/path/coaching; post-attempt review remains available.

The skill layout validates unknown IDs before the loading boundary streams, opting
that small catalog guard out of instant-navigation validation. Webpack's default
build/dev paths compile Tailwind through Next's existing CSS loader chains. The
Playwright development server uses .next-e2e and its own TypeScript config so it
can coexist with a running developer server without stopping it.

See docs/DEMO_RUNBOOK.md for recording, judge steps, and pending physical sign-off.
