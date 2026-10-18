# Decisions Log

### 2026-10-18 — Integrate the supplied UI over the existing runtime

- Keep Next.js/React/Tailwind/R3F and existing runtime contracts. Adapt supplied branding/scenery instead of importing the Vite router, bundled design system, simulated calibration, mouse controller, mock scores or fake history.
- Batch static room geometry, apply one presentation transform, and keep canonical coordinates untouched. Use perspective camera fitting and transformed replay focus; manual orbit yields control to the user.
- Add real bounded score trends and exact all-history summaries to the existing progress endpoint without a migration. Protect deletion from concurrent local upload retries and report incomplete cleanup.
- Separate offline browser acceptance, fresh-user live smoke checks on the configured service, and physical hand/audio/performance sign-off. Do not run migration/seed integration tests against the configured shared service.


Record architectural and product decisions here as they are made.

### 2026-10-17 - A7/S integration review ownership and build acceptance
- Context: Four unpublished worktrees contained overlapping task implementations,
  including stash conflicts, a review response that was discarded, and separate
  coaching/replay audio managers. The sparse Peg Transfer adapter reference also
  disagreed with the scene's segment gates.
- Decision: Assemble on integration/a7-s-completion while preserving source worktrees
  and stashes. Let the runtime own one validated review per webcam attempt, using
  the same focus selection as replay, with immediate deterministic fallback. Share
  one audio manager. Fixtures never use live review/speech/upload endpoints. Author
  the Peg Transfer scene guide through the shared engine, preserving the raw adapter
  fixture and all scoring thresholds. Models explain supplied evidence only.
- Decision: Use Webpack for default dev/build after Turbopack's CSS worker failed
  its port operation even with escalation. Reuse the installed Tailwind loader in
  Next's CSS chains; no dependencies added. Keep dev:turbo as an alternative.
- Consequences: Full B9 retrieval, B10 history/progress and B12 analytics remain
  separate. Real-camera performance/soak, live rehearsal, and isolated PostgreSQL
  acceptance remain pending. See the demo runbook for exact steps.

### 2026-10-17 - A6 initial review uses a three-second pickup lead-in
- Context: Long preparation periods made the start of replay unhelpful. The user
  selected an initial position three seconds before the first successful pickup.
- Decision: On review initialization, call `ReplayController.seekToTaskStart()`.
  Use recorded needle ownership, falling back to held-object IDs for tool-only
  recordings, and clamp to the recording start. Remain paused; missing pickups
  start at zero. Re-grabs do not replace the first pickup anchor.
- Consequences: Full recording/scoring, manual seeking, issue markers, and renderer
  retry behavior are preserved. This changes the opening cursor, not recorded data.
  S2 plays forward from this anchor and pauses on the worst stored marker.

### 2026-10-17 - A6 replay builds on merged S1 runtime
- Context: S1 PR #12 was merged while A6 was being planned. The public trainer
  now owns one runtime, validated local results, canonical reference adaptation,
  camera-free fixtures, and an IndexedDB tool-motion cache.
- Decision: Extend A4 recording with aligned memory-only needle/visibility data;
  freeze it once in S1's runtime with the same adapted reference used for scoring.
  Add a camera-independent display controller/scene and a minimal review surface
  inside Person A's 3d training wrapper. Synchronized replay uses segment frame
  progress; marker timestamps remain reference time. Default playback preserves
  recorded samples, with optional event-bounded centered smoothing.
- Consequences: Shared schemas, evaluation, and cache behavior stay stable. Replay
  survives camera stop/reset in this tab; needle/reference metadata is not added to
  persisted history. B8 can consume the renderer/cursor API. JIGSAWS replay,
  history navigation, voice, and cloud synchronization remain subsequent work.

### 2026-10-17 - S1 owns a single numerical runtime and local results
- Context: The unfinished product integration had competing fixture/render drivers,
  shared mutable camera inputs, changing completion timestamps, and display-reference
  scoring. B6 was merged with an explicit S1 live-wiring handoff.
- Decision: Drive camera/fixture progression through one ref-backed runtime. Freeze
  completion once, score against the unsmoothed canonical synthetic guide, supply exact
  tissue-wall boxes, and wire B6 text/events. Persist webcam results asynchronously in
  bounded IndexedDB with a memory fallback; keep demos out of normal history.
- Consequences: Shared result/vector contracts stay stable. Ghost selection is display
  only. IndexedDB APIs are asynchronous and normal saves remain pending for B10;
  no cloud/audio/AI/replay implementation is implied. Physical acceptance and the
  restricted-host production-build blocker remain separately tracked.

### 2026-10-17 - B7 coaching audio is live-ElevenLabs-first with pre-generated clip fallback
- Context: Plan §14/§15 originally specced common coaching cues to play from local
  pre-generated clips first (for near-zero latency during a live attempt), with
  `/api/speech` only for rare/dynamic phrases. The user instead wants the live
  ElevenLabs voice to be the primary coaching voice, using the committed clips as a
  resilience fallback.
- Decision: `AudioManager.coach(type)` is the primary coaching entry and runs a
  three-tier fallback chain: (1) live ElevenLabs via `POST /api/speech` with the
  event's canonical text, (2) the committed pre-generated clip `public/audio/coach/<type>.mp3`,
  (3) browser `speechSynthesis`. `speak(text)` (dynamic/review phrases) uses live→browser;
  `playClip(type)` remains a clip-only primitive. One voice line at a time is preserved
  (drop-normal / interrupt-high / cancel invalidates in-flight).
- Consequences: Each common cue now waits on an ElevenLabs round-trip during the attempt
  (higher latency than the plan's clip-first design), accepted in exchange for a consistently
  natural dynamic voice; the committed clips guarantee the demo still talks when the API is
  slow/unreachable/offline. S1 wired live text coaching/events; wiring `coach(type)` into the
  live loop is an S1/S2 follow-up. Revisit if live latency hurts the live-coaching feel on the target Mac.

### 2026-10-17 - B7 /api/speech public-deploy hardening (PR #11 review)
- Context: The app will be deployed publicly for the hackathon. `POST /api/speech` is
  unauthenticated and backed by a live `ELEVENLABS_API_KEY`, so an open URL lets anyone
  burn quota. Common clips under `public/audio/coach/` are static and not a concern.
- Decision: Gate the route on a server-only `SPEECH_ENABLED=true` kill-switch (503 otherwise)
  and a simple in-memory per-IP fixed-window rate limiter (`SPEECH_RATE_LIMIT`/`SPEECH_RATE_WINDOW_MS`,
  default 20/60s) returning 429. Both 503 and 429 are safe: the client `AudioManager` degrades
  to the committed clips and then browser speech. Also fixed two overlap/leak correctness issues
  the review flagged: revoke the live blob URL when `cancel()`/high-priority interrupt stops
  playback, and keep the audio slot held (and cancel browser speech on `cancel()`) during the
  `speechSynthesis` fallback. Full auth/BotID is deferred post-hackathon.
- Consequences: In-memory limiting is best-effort per serverless instance — acceptable for a
  demo, not production abuse protection. `SPEECH_ENABLED=true` must be set in `.env.local` and
  in the Vercel deploy to enable live voice; without it the live-first chain starts at the
  clip tier.

### 2026-10-17 - A5 ghost renderer, sub-frame interpolation, and JIGSAWS workspace fitting
- Context: Task A5 requires translucent expert tool playback, a reference tool-tip path trail, smooth interpolation over 30 Hz `ReferenceMotion` data without visible stepping, `0.5x`/`1x` playback speeds, demonstration and progress-coupled synchronization, and workspace fitting + gesture mapping for B4's data-only JIGSAWS expert trial (`needle-passing-jigsaws-expert-v1.json`) without mutating Person B's committed reference fixtures or shared contracts.
- Decision: Implement `ghost-reference.ts` and `ghost-playback.ts` in `src/lib/exercise/` and `GhostLayer` in `src/components/scene/ghost-layer.tsx`. Derive ghost instrument grip positions as `tipPosition - applyQuaternion(TIP_OFFSET, rotation)` so jaw tips always match `tipPosition` on the path trail. Preload `needle-passing-reference-v1.json` synchronously as the default canonical reference and support runtime loading of `needle-passing-jigsaws-expert-v1.json` (`Needle_Passing_E005`, 3,233 frames) via `prepareGhostReference` (mapping `G1..G11` to the 8 Needle Passing segments, fitting raw metre coordinates into canonical workspace bounds above `tissue-wall`, applying 7-frame centered display smoothing, and displaying the Gao et al. 2014 attribution). Step `GhostPlaybackController` at display rate in `useFrame` with `0.5x`/`1x` speeds, a 12%-lead progress-coupled mode with 600 ms stall micro-looping, and strict hiding in `Assessment` mode.
- Consequences: All existing B2/B3/B4 reference and evaluation suites remain untouched and green alongside new A5 unit, scene-lifecycle, and Playwright E2E tests. S1 (`/train/[skillId]` end-to-end integration) and A6 (`3D replay renderer`) can reuse `GhostPlaybackController`, `GhostLayer`, and `prepareGhostReference` directly.

### 2026-10-17 - A4 3-checkpoint needle-passing state machine and mode behavior hooks
- Context: Task A4 requires a deterministic exercise state machine for `needlePassingSkill` (`approach -> grip -> align -> entry -> rotation -> exit -> release -> complete`) with target rings (`ring-1`, `ring-2`, `ring-3`), a danger zone (`tissue-wall`), progress reporting, and `Learn` / `Practice` / `Assessment` mode behavior hooks without breaking existing A3 simulation contracts or editing Person B's shared `/train/[skillId]` route before S1.
- Decision: Implement `ExerciseController` and `needle-passing-config.ts` in `src/lib/exercise/` and `ExerciseTargets` in `src/components/scene/exercise-targets.tsx`, composed alongside `ToolSimulationController` on `/dev/hand-tracking`. Map one pass across a 3-checkpoint quadratic corridor (`ring-1` at `(-0.16, 0.24, 0)`, `ring-2` at `(0, 0.18, 0)`, `ring-3` at `(0.16, 0.24, 0)`) to the release ring at `(0.20, 0.36, 0)` above the `tissue-wall` danger box (`y ∈ [-0.05, 0.07]`), keeping the needle start pose at `(0, 0.35, 0)`. Enforce strict sequential gates, orientation alignment at `ring-1` (`<= 45°`), wrist rotation delta at `ring-2` (`>= 12°`), non-destructive early-drop recovery, and danger-zone blocking. Expose deterministic `ModeBehaviorHooks` that strictly hide ghost/path/coaching hooks in `Assessment` mode, and record `MotionFrame` samples compatible with B3's `evaluateAttempt`.
- Consequences: All existing A1/A2/A3 unit and Playwright E2E suites remain green alongside new A4 unit, scene, and browser E2E tests. A5 (`Ghost renderer`), B5 (`Complete 20-metric evaluator`), and S1 (`First end-to-end integration`) can consume `ExerciseController.snapshot` and `getRecordedMotion()` directly.

### 2026-10-17 - Track Next.js guidance with explicit provenance
- Context: PR #5 review asked whether the generated root AGENTS.md was intentional.
  The A3 plan retained this file, and publication of that implementation was approved.
- Decision: Keep AGENTS.md tracked, with a hand-authored provenance note outside
  the framework-managed markers. The generated block describes the installed
  framework; project ownership/workflow remain in CONTEXT and IMPLEMENTATION_PLAN.
- Consequences: Next dev can refresh its block without removing the note. Generated
  framework guidance is distinguishable from project policy during future reviews.

### 2026-10-17 - A3 pickup guidance and depth assistance
- Context: The user could not reliably pick up the needle, found the interaction
  unclear and rejected the original instrument appearance. Projected alignment
  hid depth mismatch, and decorative rings competed with the pickup marker.
- Decision: Default to Easy pickup: constrain actual rotated tip contacts to Z=0,
  show the exact 0.16-unit acquisition halo and colored tip crosshairs, and snap
  the needle marker into the jaws on an eligible close edge. A visible switch
  restores free 3D depth/0.10-unit acquisition, resetting scene ownership. Use a
  front orthographic view, live ready/reopen/depth prompts, flat tweezers and a
  pistol-grip instrument. Replace noninteractive rings with a muted grid.
- Consequences: A2 inputs, grip debounce, freshness and recovery gates remain
  intact. Assistance is explicit in the local simulation snapshot and must be
  accounted for by future exercise/evaluation work. Synthetic regression and
  screenshot review verify behavior; real-hand usability still needs user retest.

### 2026-10-17 - A3 owns deterministic interaction and a separate display stream
- Context: A2 supplies calibrated targets without geometry or object ownership.
  The next bounded task is A3 in the existing development preview.
- Decision: Use a Person-A-owned numerical controller and existing ToolState
  contracts, shared local tip geometry, edge-triggered acquisition, single-owner
  attachment and fresh-input release. Gate both tools on A2 readiness and source
  freshness; preserve grip through loss and context suspension. Reset invalid
  camera/calibration sessions without release events. Use procedural scene assets
  and one existing camera; keep A4/A5 and product-route integration separate.
- Consequences: Display-only lerp/slerp uses a 40/s response, guarded by <30 ms
  added synthetic phase-delay tests. Held-object rendering follows that display
  transform. Readiness, ownership and rendered/authoritative poses have 4 Hz
  diagnostics; bounded numerical timings support manual FPS/frame-interval QA.
  Physical latency/soak acceptance still requires measured target-Mac results.

## Format

### YYYY-MM-DD - Decision title
- Context:
- Decision:
- Consequences:

### 2026-10-17 - A2 control smoothing favors responsiveness within jitter bounds
- Context: Person A reported slight lag throughout movement. A deterministic
  0.5 Hz motion test showed roughly 119–121 ms of position-filter phase delay at
  20/30 FPS with the original 1 Hz / beta 0.5 control settings, before camera and
  inference costs.
- Decision: Give position/quaternion controls a separate 3 Hz base cutoff and
  beta 0.75, retaining derivative smoothing, shortest-path slerp, rotation limits,
  grip debounce and recovery gates. Keep generic One Euro defaults unchanged.
- Consequences: Tests require less than 70 ms filter phase lag for position and
  rotation at 20/30 FPS and less than 45% RMS amplitude for injected stationary
  jitter at 30 FPS. These are synthetic filter checks, not measured end-to-end
  latency; real-camera response and HUD FPS/inference figures remain outstanding.

### 2026-10-17 - A2 workspace uses confirmed directions and recoverable progress
- Context: Person A reported unclear sweep instructions and repeated workspace
  timeouts. The first implementation erased the entire workspace window whenever
  either hand briefly lost tracking, while its timeout continued running.
- Decision: Show an arrow checklist and prompt one hand/direction at a time.
  Capture each direction independently with a sustained 120 ms excursion and at
  least three valid observations; derive travel from the median of that hold.
  Preserve confirmed directions across invalid observations/suspension and require
  at least 1,500 ms of valid observation per hand before completion. Workspace
  allows 45 foreground seconds; workspace-only retry retains captured directions
  and neutral/pinch measurements. Full reset remains available.
- Consequences: Missing/closed/ambiguous hands earn no credit, single-frame spikes
  cannot complete directions, and stationary-stage quality gates stay unchanged.
  Automated tests cover sequential capture, loss and retry. Person A's physical
  retry remains necessary before claiming the reported experience is resolved.

### 2026-10-17 - A2 local calibration and explicit control freshness
- Context: A3 needs deterministic hand-to-tool targets while A1's observations
  intentionally remain raw and the shared schemas belong to Person B.
- Decision: Keep A2 profile/control types in Person A's vision subsystem. Compose
  one tracker with a ref-backed controller and three-stage automatic calibration.
  HandFrame palm center/landmarks remain SDK data; palm rotation is calibrated,
  clamped, filtered canonical control rotation. Tool targets contain no fabricated
  tips or object ownership. Reflect points and reconstruct a right-handed palm
  basis, then use `current * inverse(neutral)` for scene-relative rotation.
- Consequences: Shared schemas and data version stay unchanged. A3 computes tips,
  owns held objects, interpolates display poses, and honors control freshness.
  Missing input immediately inhibits progression and holds targets/grip; 200 ms
  marks sustained loss, and recovery requires three valid frames plus fresh pinch
  debounce. Camera sessions/formats own memory-only profiles; tab/backend
  suspension retains them. Synthetic tests cannot establish target-Mac accuracy
  or latency; physical acceptance remains explicitly pending.

### 2026-10-17 - A1 raw snapshots, local assets, and worker compatibility
- Context: Person A needs webcam tracking before A2, but shared `HandFrame` requires
  calibrated pinch/rotation. The installed SDK is MediaPipe Tasks Vision 1.1.1.
- Decision: A1 uses local raw tracking types/ref snapshots with explicit missing
  observations; shared contracts remain unchanged. Prepare a pinned/checksummed
  model and matching installed WASM before dev/build. Host them at the same origin.
  Use a bundled classic worker and the classic WASM loader: actual browser testing
  found Turbopack rewrites module workers to classic workers, where the ES-module
  loader throws on `import.meta`. Retain throttled main-thread GPU/CPU fallback.
- Consequences: A2 owns calibrated conversion to `HandFrame` and scene coordinates.
  Fresh builds need asset preparation; cached assets support offline use. A hidden
  development-only tracking route is the A1 integration surface. Playwright uses
  localhost to match Next's advertised dev origin and permit client hydration.
  SDK metrics telemetry is distinct from Steady's prohibition on raw-video uploads.

### 2026-10-16 - Canonical PerformanceVector metric names
- Context: IMPLEMENTATION_PLAN §6.9 / §13.3 and §6.11 listed different camelCase aliases for the same 20 metrics (e.g. `instrumentOrientationAccuracy` vs `instrumentAngleAccuracy`).
- Decision: Use §6.9 / §13.3 names as the TypeScript + `PERFORMANCE_VECTOR_ORDER` source of truth. Treat §6.11 aliases as obsolete wording.
- Consequences: Tiger `vector(20)` conversion, similarity queries, and fixtures must use these keys. Renaming later is a schema migration.
