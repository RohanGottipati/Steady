# A3 simulation handoff

The development-only `/dev/hand-tracking?debug=1` route combines A1/A2 tracking and
calibration with two kinematic 3D instruments. Start the camera, calibrate, approach
the needle’s pickup circle with an **open** colored tip ring, wait for the circle
to turn green and the “tip aligned” prompt, then pinch. Open to release. **Reset scene** restores the needle without restarting camera/calibration.
The route remains 404 in production.

The background grid is a visual guide; the needle has the only large pickup
circle. Exercise sequencing, completion, scoring,
ghosts and recording belong to later tasks. This is an educational motion-control
prototype; task-object physics and anatomical fidelity are not claimed.

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
shared schemas and data version remain unchanged. A4 should consume authoritative
snapshots/events, readiness and assistance mode; assisted poses must not be
treated as unassisted precision measurements. A5 can reuse instrument geometry
with its own poses.

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
