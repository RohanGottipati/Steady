# A6 — Attempt recording and 3D replay

> Historical implementation plan. Replay now runs inside the integrated product workspace, with procedural room scenery, perspective cameras, constrained orbit, and world-space camera focus derived from canonical recorded coordinates. See SIMULATION.md and CONTEXT.md for current behavior.

Implementation baseline: main `a1f1c2a`, including S1 PR #12, pulled with
`git pull --ff-only origin main` before implementation. Supersedes the earlier
plan's assumption that the public trainer is a stub.

Implemented on `person-a/a6-attempt-replay`, branched from the latest main
`57468be` (B7 PR #11) after a fresh publication pull. Verification and remaining production-build /
physical acceptance limitations are recorded in `docs/CONTEXT.md`; the cursor and
renderer contract is documented in `docs/SIMULATION.md`.

## Integration changes after S1

- Use the existing TrainingRuntime and fixture flow on `/train/needle-passing`
  and the development preview; do not create a competing training/results loop.
- Freeze replay at runtime completion, using the same canonical, unsmoothed
  reference adaptation as S1 scoring (including right-hand/single-hand handling).
- Keep the existing CompletedAttemptBundle, SavedAttempt, IndexedDB cache, and
  shared schemas unchanged. Needle pose/visibility are a Person A-owned,
  memory-only sidecar. Motion-only recordings remain renderable without a needle.
- Preserve S1's recording-limit failure, once-per-attempt evaluation, camera-stop
  retention, local-save behavior, coaching, and deterministic fixture results.

## Delivery

1. Extend the exercise recorder with aligned scene frames and explicit truncation.
   Finalize one detached replay package in TrainingRuntime; retain the latest one
   across resets without retaining landmarks or camera frames in that package.
2. Add a camera-independent replay controller with synchronized segment/frame-order
   alignment, original recorded timing, exact time/progress/marker seeking, speeds
   0.25/0.5/1, optional centered-seven-frame smoothing, and visibility controls.
   Marker timestamps are reference time; jumping to a marker pauses in synchronized
   mode. Preserve jaw/ownership boundaries and tip-to-grip geometry.
   Open review paused three seconds before the first confirmed needle pickup,
   clamped to the start; retain the entire timeline and evaluation recording.
3. Render user/reference tools, paths, deviation connectors, and recorded user
   needle in a single client-loaded scene. Integrate a small review surface into
   the existing Person A training wrapper, preserving recordings on WebGL retry.
   Use existing S1 fixtures for a zero-camera review path.
4. Cover capture, marker/time mapping, geometry, malformed/partial recordings,
   lifecycle/resource cleanup, actual WebGL playback, and S1 regressions. Run
   typecheck/lint/unit tests (exclude DB mutations), Chromium E2E, and build.
5. Update the simulation handoff, README, decision log, and CONTEXT with actual
   outcomes, remaining build/hardware acceptance, and the B8 interface.

## Boundaries and acceptance

Canonical Needle Passing only. JIGSAWS remains a live ghost option; its repeated
segments are outside A6 replay. B8's polished results page, cloud persistence,
audio, new skills, new dependencies, and shared schema changes are excluded.
Original timing uses the recorded active-attempt clock, excluding suspensions.

Done when a completed attempt survives camera shutdown/reset, plays alongside the
exact canonical scoring reference, seeks to supplied reference-time markers, and
the same flow works from an S1 fixture with zero camera requests. Do not commit
or push without explicit instruction.
