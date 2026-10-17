# Project Context

Last updated: 2026-10-17 22:10 UTC
Updated by: Person B — Task B8 (replay controls + results UI; branched from main 6a70cf4 / A6 PR #13; targeting main)
Current branch: person-b/b8-results-ui
Current milestone: S1 training/results, B7 voice layer, A6 canonical replay, and B8 results/review UI implemented; physical M1/M2/M3 and production-build acceptance pending
Demo-critical status: YELLOW

## 0. Agent Operating Rules (READ FIRST)

These rules apply to every AI agent working in this repo (Claude, Codex, or any other),
regardless of which tool or model is in use. This file is the agent-agnostic source of
truth for the current project state — it records what exists and where it is.

1. **Update this file (`docs/CONTEXT.md`) before every push.** Keep it reflecting the
   true current stage of the project: what works, what is in progress, completed tasks,
   the current milestone/status, and the next recommended actions. Refresh the
   `Last updated` timestamp and `Updated by` field. Rewrite stale lines rather than
   appending endlessly.
2. **Never put any reference to an AI in commit messages.** No "Claude", "Codex",
   "AI", "Copilot", "generated with", "Co-Authored-By" AI trailers, or similar. Use the
   project's task-ID commit style instead (see `IMPLEMENTATION_PLAN.md` §25.2), e.g.
   `S0: scaffold Next.js app and shared types`.
3. Read `docs/IMPLEMENTATION_PLAN.md` (architectural source of truth) before coding, and
   work one task ID at a time.
4. **`.env.local` is intentionally tracked and pushed with git-crypt encryption.**
   In an unlocked clone, stage, commit, and push normally; verify `git-crypt status -e`
   reports it encrypted without warnings. Keep it tracked and preserve its encryption
   attributes. New clones must unlock with the existing key; do not run `git-crypt init`,
   overwrite it with `.env.example`, or expose secret contents or exported keys.
   See `docs/GIT_CRYPT.md` for the full workflow.
5. **Do not commit or push until explicitly instructed.** Make and stage changes
   freely, but wait for the human to say to commit or push. Never commit or push on
   your own initiative, even when work looks complete.

## 1. Current Working State
- Next.js App Router bootstrap complete with hackathon dependencies installed.
- A1 implementation available at `/dev/hand-tracking?debug=1` in development:
  explicit camera controls, mirrored skeleton preview, stable raw hand slots,
  ref-backed updates, GPU/CPU worker and main-thread fallback, debug diagnostics.
- Local model/WASM assets are prepared before dev/build; cached assets support offline use.
- Person A reviewed the tracking preview and reported it looks good (2026-10-17).
  This records preview approval; the formal soak/performance checklist is still pending.
- Tiger Data schema live: migration `0001_init` applied (core relational tables + 4 hypertables, `attempt_scores.performance_vector vector(20)`); `npm run db:migrate`/`db:seed` runners work and are idempotent; one synthetic `needle-passing` attempt seeded and queryable.
- `/api/health` reports `{ ok, service, db }` where `db` is `up`/`down`/`unconfigured` and never throws on DB outage (server-only client in `src/lib/db/`).
- `/library` lists all four skills with search, source/license badges, and availability. `/train/needle-passing` now connects camera/calibration or demo fixtures to the 3D exercise, ghost, B6 text coaching, deterministic inline results, and local saving. Other known skills retain their coming-soon notice; unknown IDs 404.
- Reference-motion framework (B2): `src/lib/references/load-reference.ts` loads + Zod-validates `ReferenceMotion` JSON (browser-usable); stdlib Python adapters (`scripts/data/{jigsaws,lask}/adapter.py` + `scripts/data/common/reference_builder.py`) convert source motion into canonical references (coordinate transform → 30 Hz resample → segment-normalize).
- External data conversion (B4/A5): derived expert JIGSAWS references remain committed under `public/references/<skill>/`, with raw data only in ignored `datasets/jigsaws/`. A5/S1 maps gestures and fits Needle_Passing_E005 into the workspace for an optional attributed ghost; Knot Tying/Suturing remain data-only. Evaluation uses the synthetic canonical scene guide, independently of ghost settings. See `docs/DATA_LICENSES.md`.
- A2 implementation available in the same development preview: automatic
  neutral/open → pinch → workspace calibration, canonical target visualization,
  One Euro position filtering, bounded palm rotation/depth, debounced pinch,
  grip-preserving tracking loss and gated recovery. Shared contracts are unchanged.
- Workspace now guides one hand/direction at a time with visible arrow checkmarks.
  Confirmed directions survive tracking interruptions; its 45-second timeout offers
  workspace-only retry that preserves open/pinch measurements and completed arrows.
- Control filtering now uses a 3 Hz base cutoff / beta 0.75 for position and
  quaternion response. Synthetic phase-delay and stationary-jitter tests guard
  responsiveness; the generic One Euro defaults, pinch and recovery gates are unchanged.
- Evaluation engine (B3→B5): `src/lib/evaluation/` deterministically scores a recorded attempt vs a `ReferenceMotion` — per-segment alignment (no DTW). B5 completed the full **20-metric** set: the 8 B3 metrics plus depthConsistency, motionStability, overshootControl, correctionEfficiency, rotationControlAccuracy, pinchStability, gripTiming, handWorkspaceControl, bimanualCoordination, idleTimeControl, toolCollisionAvoidance, dangerZoneAvoidance (`metrics-extra.ts`). `evaluateAttempt(user, ref, options?)` now returns all 20 metrics (in `PERFORMANCE_VECTOR_ORDER`), the keyed `PerformanceVector`, all five category scores, a **weighted** overall (honors `options.metricWeights`, i.e. `SkillDefinition.metricWeights`), top-3 worst-moment markers, and a deterministic factual `explanations[]` (one per metric; the AI layer elaborates, never recomputes). `toAttemptResult(evaluation, meta)` assembles a schema-valid `AttemptResult` (session metadata + coaching events supplied by the caller/B6). The two A4-fed safety metrics degrade honestly without a contract change: tool-tool collisions come from tip proximity now; `dangerZoneAvoidance` is 100 until A4 supplies zone geometry via `options.scene.dangerZones`. B4's run-collapsed-LCS `proceduralSequencing` fix is retained. B10 reads the frozen `PERFORMANCE_VECTOR_ORDER` + `vector(20)` for persistence.
- A3 implementation available in the development preview: procedural operating room,
  forceps/needle holder, real geometry-derived tips, deterministic single-owner
  needle grab/release, and separate display interpolation. Both tools freeze when
  either control is ineligible. Scene reset, context-loss recovery and renderer
  retry are available. Debug mode reports rendered poses and bounded frame timings.
- A3 usability follow-up: the user reported difficulty acquiring the needle and
  rejected the original instrument appearance. Easy pickup now defaults on,
  constraining actual jaw tips to Z=0 and snapping within a visible 0.16-unit halo.
  Front orthographic framing, colored tip crosshairs and ready/reopen/depth prompts
  explain acquisition. A visible switch restores strict 0.10-unit free 3D depth
  and resets ownership without recalibration. Flat tweezers and an angular
  pistol-grip needle holder replace the old finger-loop silhouettes. A muted
  grid replaces decorative rings that looked like additional pickup targets.
- A3 PR #5 review fix: nullable assisted display projection now retains the affected
  instrument’s last pose/jaws and hides an instrument until its first usable pose.
  Initial recovery seeds directly; pickup feedback guards absent tool slots without
  non-null assertions. New unit regressions cover rejection and recovery. Root
  AGENTS.md explicitly distinguishes generated framework guidance from project policy.
- A4 implementation available in the development preview (`src/lib/exercise/`,
  `src/components/scene/exercise-targets.tsx`, `src/components/scene/training-scene.tsx`,
  `src/components/training/3d-training-preview.tsx`): deterministic 8-segment
  `needle-passing` state machine (`approach -> grip -> align -> entry -> rotation ->
  exit -> release -> complete`), 3-checkpoint curved corridor (`ring-1`, `ring-2`,
  `ring-3`), release ring, `tissue-wall` danger zone, early-release and out-of-order
  guardrails, `Learn` / `Practice` / `Assessment` mode behavior hooks (Assessment
  hides ghost/path/coaching hooks), and canonical `MotionFrame` recording verified
  against B3/B5's `evaluateAttempt`.
- A5 implementation available in the development preview (`src/lib/exercise/ghost-reference.ts`,
  `src/lib/exercise/ghost-playback.ts`, `src/components/scene/ghost-layer.tsx`,
  `src/components/scene/training-scene.tsx`, `src/components/training/3d-training-preview.tsx`):
  single-instrument translucent ghost and needle playback, glowing 3D guide tube and
  tool-tip path trail visiting all 5 scene checkpoints (`Needle -> Ring 1 -> Ring 2 -> Ring 3 -> Release Ring`),
  sub-frame `lerp`/`slerp` interpolation over 30 Hz `ReferenceMotion` data without
  stepping, `0.5x` and `1x` speed controls, `demonstration` / `progress-coupled`
  (12% lead + step-sweep stall loop) / `continuous` sync modes, 7-frame centered
  display smoothing, **1-Hand Quick Start / 1-Hand Mode** (`singleHand`), and runtime
  workspace fitting + gesture-to-segment mapping for B4's JIGSAWS `Needle_Passing_E005`
  expert trial (`needle-passing-jigsaws-expert-v1.json`) with Gao et al. (2014)
  attribution. S1 exposes training/results on `/train/[skillId]`; A6 now adds canonical replay.
- A6 replay is available through **Replay latest attempt** after a completed webcam
  pass or S1 fixture, including after camera stop/reset. A4 records aligned needle
  pose/owner and visibility sidecars; S1 freezes these with the exact adapted
  canonical scoring reference. A camera-independent renderer shows solid user and
  translucent reference tools, paths, tip-deviation connectors, and recorded user
  needle. Controls expose synchronized/original timing, 0.25x/0.5x/1x, seeking,
  reference-time issue jumps, visibility, and optional event-bounded smoothing.
  Review opens paused three seconds before the first confirmed needle pickup,
  clamped to the beginning; absent pickups start at zero. Full recording/scoring
  and timeline/issue access are retained, including before that opening cursor.
  Replay is display-only; evaluation/shared schemas/local cache are unchanged.
  Exact reference/needle metadata is retained only for the latest completed attempt
  in memory. History/reload navigation and JIGSAWS replay remain subsequent work.
- Results + review UI (B8): the inline `AttemptResultsPanel` (score summary, five
  category scores, strongest/weakest, worst-moment markers, expandable 20 metrics)
  now also renders a **Coach Review** section and makes the top-3 worst moments
  actionable. `src/lib/ai/deterministic-review.ts` `buildDeterministicReview(bundle)`
  composes a schema-valid `AiReview` (summary/strengths/improvements/largestDifference/
  replayNarration) purely from the deterministic evaluation — no model call — so it
  renders now and B9's Backboard/Gemini review can replace it or degrade to it
  (disabled/offline/malformed) without the results losing their explanation. Clicking a
  worst moment opens **Replay latest attempt** seeked to that issue (same cursor as the
  in-replay marker button); `ThreeDReplayPreview` gained an additive optional
  `initialMarker` prop that seeks via the A6 `ReplayController.seekMarker` and falls
  back to task start. Human metric labels moved to shared
  `src/lib/evaluation/metric-labels.ts` (used by the panel and the review). Shared
  `src/types/` contracts are unchanged. History/reload navigation and live AI remain B10/B9.
- Live coaching engine (B6): `src/lib/coaching/coaching-engine.ts` turns a compact
  per-tick `CoachingSignals` snapshot (path/corridor deviation, danger zone, tool/
  assisting-hand speed, grip slip, rotation lateness, overshoot) into deterministic
  `CoachingEvent`s with 0–1 severity, obeying the shared `COACHING_MESSAGE_POLICY`:
  a commit-delay queue lets a self-corrected issue cancel its queued message; per-type
  8 s repeat suppression stops a sustained issue from spamming; a global 4 s cooldown +
  4-message cap bound spoken audio. Recording keeps every event ≥ the 0.65 minimum;
  `voiceCoachingLevel` (`full`/`high-severity`/`none`) sets a separate speak gate, so
  Practice records medium-severity events for review but speaks only high-severity ones
  and Assessment stays fully silent. `COACHING_MESSAGES` holds the §14.3 clip text (keys
  the B7 ElevenLabs assets). The engine never scores — authoritative scoring stays in
  B3/B5. S1 now wires these signals into text coaching and the completed result events.
- ElevenLabs voice layer (B7): `src/lib/voice/` + `src/app/api/speech/route.ts`.
  The 7 common coaching clips (keyed by `CoachingEventType`) are pre-generated as
  committed static MP3s under `public/audio/coach/<type>.mp3` (run `npm run audio:coach`;
  idempotent, `--force` to regenerate, `--dry-run` to preview). `coach-clips.ts` is the
  dependency-free canonical clip manifest (text mirrors B6 `COACHING_MESSAGES`; a unit
  test guards no drift). `AudioManager` (`audio-manager.ts`) drives coaching voice through
  `coach(type)` with a live-first fallback chain: (1) live ElevenLabs via `POST /api/speech`,
  (2) the committed pre-generated clip, (3) browser `speechSynthesis` (see `docs/DECISIONS.md`
  2026-10-17). `speak(text)` handles dynamic/review phrases (live→browser); `playClip(type)`
  is a clip-only primitive. One voice line at a time (normal dropped while busy, high-priority
  interrupts, `cancel()` stops + invalidates in-flight); exposes `isSpeaking`. `/api/speech`
  validates text via the shared
  `speechRequestSchema` and calls ElevenLabs through the `server-only` `tts-server.ts`, so
  the API key only ever reaches ElevenLabs via the `xi-api-key` header — never the browser
  bundle or any response body. Public-deploy hardening (PR #11 review): the route is a 503
  no-op unless `SPEECH_ENABLED=true` and is per-IP rate limited (`SPEECH_RATE_LIMIT`/min,
  default 20, in-memory fixed window in `rate-limit.ts`); a 503/429 is safe because the
  client degrades to clips + browser speech. S1/S2 wire `AudioManager` into the live coaching
  loop and review narration.

## 2. Architecture Invariants
- Raw webcam frames stay in the browser by default.
- Tiger Data receives only compact numerical/structured attempt telemetry, never raw webcam video.
- The active attempt and deterministic evaluator must work even if Tiger Data is unreachable.
- Generative AI never calculates geometric correctness or performance scores.
- Canonical coordinate system: +X user right, +Y up, +Z toward user/camera.
- Browser target: latest Chrome on macOS.

## 3. Shared Contracts
- Location: `src/types/` (barrel: `src/types/index.ts`)
- Data schema version: `1` (`DATA_SCHEMA_VERSION`)
- Coordinate system: `scene-canonical-v1` (+X user right, +Y up, +Z toward camera)
- Core types: `Vec3`, `Quat`, `HandFrame`, `ToolState`, `ToolFrame`, `MotionFrame`, `ReferenceMotion`, `SkillDefinition`, `PerformanceVector`, `AttemptResult`, `CoachingEvent`, `ReplayMarker`, `AttemptUploadPayload`, `SavedAttempt`, `AiReview`
- `PERFORMANCE_VECTOR_ORDER` is the stable 20-metric order for Tiger `vector(20)` (names from plan §6.9/§13.3; see `docs/DECISIONS.md`)
- Zod schemas co-located with types; parse before trusting external/AI JSON
- A1's internal `RawTrackedHand`/`TrackingSnapshot` interfaces live in `src/lib/vision/types.ts`.
  Observations use unmirrored SDK coordinates with nullable left/right slots and
  monotonic millisecond timestamps. Shared `HandFrame` schema is unchanged.
- A2-owned `CalibrationProfile`, `ToolControlTarget`, and `ControlSnapshot` live in
  `src/lib/vision/control-types.ts`. `useHandControls(tracking)` composes with one
  tracker and exposes a ref snapshot plus calibration actions and a 4 Hz UI sample.
  HandFrame palm center/landmarks retain SDK coordinates; palm rotation is the
  calibrated, clamped and filtered canonical target rotation. Pinch ratio is the
  measured world-space thumb/index distance divided by MCP width; confidence is
  assigned-label probability, not landmark accuracy.
- A3 simulation consumes A2 canonical targets and publishes existing `ToolState`
  values, the accepted source timestamp, task-object pose/owner and per-call
  grab/release events. Snapshot assistance mode and shared pickup-feedback geometry
  distinguish guided pickup from free depth. Person-A-owned interfaces live in `src/lib/simulation/`;
  shared schemas remain unchanged. Interaction uses authoritative geometry and
  eligible fresh sources; display transforms never become interaction samples.
  See `docs/SIMULATION.md` for geometry, pause/reset and A4/A5 handoff contracts.
- A4 exercise engine (`src/lib/exercise/exercise-controller.ts`,
  `src/lib/exercise/needle-passing-config.ts`) validates against `needlePassingSkill`
  and consumes `ControlSnapshot` + `SimulationSnapshot` + `SimulationEvent[]` once per
  fresh `sourceTMs`. Exposes `ExerciseSnapshot` (`phase`, `segmentId`, `segmentProgress`,
  `overallProgress`, `activeTargetId`, `completedTargetIds`, `corridorDeviation`,
  `orientationErrorDeg`, `rotationDeltaDeg`, `inDangerZone`, `dangerZoneCount`,
  `needleDropped`, `modeHooks`, `readyForEvaluation`, `readyForReplay`) and
  `getRecordedMotion(): RecordedMotion` (validated `MotionFrame[]` compatible with B3/B5).
- A5 ghost motion subsystem (`src/lib/exercise/ghost-reference.ts`,
  `src/lib/exercise/ghost-playback.ts`, `src/components/scene/ghost-layer.tsx`)
  consumes `ReferenceMotion` and `ExerciseSnapshot` at display refresh rate in
  `useFrame`. Resolves grip poses via `tipPosition - applyQuaternion(TIP_OFFSET, rotation)`
  so translucent jaw tips match `tipPosition` on the trail; exposes `GhostSnapshot`
  (`visible`, `showTrail`, `activeSide`, `actionLabel`, `referenceId`, `referenceSourceId`,
  `attribution`, `speed`, `syncMode`, `activeBehavior`, `tMs`, `normalizedProgress`,
  `segmentId`, `segmentProgress`, `stalled`, `leftTool`, `rightTool`, `leftPose`,
  `rightPose`, `needlePose`, `needleHeldBy`).
- B6 live coaching engine (`src/lib/coaching/coaching-engine.ts`) consumes a compact
  `CoachingSignals` per tick (`tMs`, `active`, `segmentId`, `voiceCoachingLevel`,
  `corridorDeviation`/`inCorridor`, `inDangerZone`, `toolSpeed`, `assistingHandSpeed`,
  `gripSlipping`, `rotationBehindDeg`, `overshoot`) and returns `CoachingTick`
  (`recorded: CoachingEvent[]`, `spoken: {event,text}|null`, `canceledPending`).
  Recording gate is the 0.65 minimum severity; `voiceCoachingLevel` (mapped straight
  from A4 `modeHooks`) sets the separate **speak** gate (Practice speaks only
  high-severity but still records medium events; Assessment records/speaks nothing). S1 owns
  the adapter that derives per-tick speeds/grip-slip from `ControlSnapshot` +
  `SimulationSnapshot` + the `ExerciseSnapshot`; the shared `CoachingEvent` schema and
  `COACHING_MESSAGE_POLICY` in `src/types/coaching.ts` are unchanged.
- B7 voice layer (`src/lib/voice/`): `coach-clips.ts` (`COACH_CLIPS`, `COACH_CLIP_BY_TYPE`,
  `coachClipPath(type)`) is client/server/script-safe (type-only import). `speech-contract.ts`
  (`speechRequestSchema`, `MAX_SPEECH_TEXT_LENGTH`) is the shared `/api/speech` request
  contract. `tts-server.ts` is `server-only` (`synthesizeSpeech`, `SpeechConfigError` → 503,
  `SpeechUpstreamError` → 502). `AudioManager` takes injectable `createAudio`/`fetchFn`/
  `fallbackSpeak` for testability. Shared `src/types/` contracts are unchanged.
- A6 interfaces live in `src/lib/simulation/replay-types.ts` and
  `replay-controller.ts`: `ReplayRecording`, `ReplayInput`, `CompletedReplay`, and
  `ReplayController`. `TrainingRuntime.lastReplay` survives reset and is replaced
  only by another completed attempt. `ReplayScene` accepts the controller without
  webcam/simulation input. Marker times are reference times; `seekMarker` maps them
  to user segment progress and pauses, including one-frame segments. See
  `docs/SIMULATION.md` for B8 integration, timing domains, and missing-data behavior.

## 4. Current Task Ownership
Person A - Realtime Vision and 3D Simulation:
- A1 webcam, two-hand detection, identity helper, and development preview
- A2 implemented: calibration and ref-backed control targets in vision/filters,
  camera preview, related tests, and handoff documentation. Shared contracts and
  Person B subsystems remain unchanged. The existing development route is the
  integration surface.
- A3 implemented: numerical simulation, procedural scene/instruments/needle,
  existing-camera integration, interaction/display tests and simulation handoff.
- A4 implemented: Needle Passing 8-segment state machine, 3D target rings/corridor/danger
  zone, Learn/Practice/Assessment mode behavior hooks, and `MotionFrame` recording.
- A5 implemented: translucent ghost renderer, tool-tip path trail/tube, sub-frame 30 Hz
  `lerp`/`slerp` interpolation, `0.5x`/`1x` speeds, `demonstration`/`progress-coupled`/`continuous`
  sync modes, 1-Hand Quick Start / 1-Hand Mode, 7-frame display smoothing, and runtime
  JIGSAWS expert workspace fitting. Joint `S1` product integration and `A6`
  canonical replay are implemented; A1/A2/M2/M3 physical performance acceptance remains pending.

Person B - Data, Evaluation, Product, Tiger Data, AI and Voice:
- S0 bootstrap, B0 Tiger bootstrap, B1 skill library, B2 reference adapters, B3 evaluation engine (merged to main via #4), B4 external data conversion (merged to main via #6), B5 full 20-metric evaluator (merged to main via #8) done
- B6 live coaching event engine implemented (live telemetry only, so it did not block on B5; S1 live text/event wiring implemented). B10 Tiger persistence can proceed in parallel against the frozen `PERFORMANCE_VECTOR_ORDER`/`vector(20)` + `AttemptUploadPayload` contracts
- B7 ElevenLabs voice layer implemented: pre-generation script + 7 committed common clips, `/api/speech`, `AudioManager` (overlap-safe) with live-ElevenLabs-first → clip → `speechSynthesis` fallback chain (`coach(type)`).
- B8 replay controls + results UI implemented: Coach Review section with a deterministic schema-valid `AiReview` fallback (`src/lib/ai/deterministic-review.ts`), results worst-moments now jump into the A6 replay seeked to each issue (`ThreeDReplayPreview initialMarker`). Next: wire `AudioManager` voice into the live loop (S1/S2), B9 Backboard/Gemini review (replaces/degrades to the B8 deterministic fallback), S2 narrated replay (needs A6+B7+B9), B10 persistence/history navigation.

## 5. Completed Tasks
- A6 implementation — revised plan after pulling merged S1 (`a1f1c2a`), then
  extended its existing runtime/recorder with aligned scene state and one detached
  canonical replay package. Added camera-independent numerical playback, exact
  marker seeking, dual rendering, optional display smoothing, paths/connectors,
  lifecycle recovery, and a minimal review surface on the existing public/dev
  trainer. S1 right/single-hand scoring adaptation is reused. Camera stop/reset
  retains the latest replay. Demo playback is explicitly labeled synthetic.
  Shared schemas, scoring, cache, dependencies, and Person B subsystems are unchanged.
  Handoff and revised plan are in SIMULATION and A6_PLAN. Publication uses
  `person-a/a6-attempt-replay`, created after refreshing main at `57468be`.
- S1 implementation — one scene-driven `TrainingRuntime` connects camera or fixed
  30 Hz fixtures to simulation/exercise/ghost/coaching and freezes one validated
  result per attempt. Product modes, reset/retry, one-hand control, interruption,
  recording-limit/error handling, and camera-stop result retention are integrated.
  Scoring uses the unsmoothed canonical reference and exact tissue-wall boxes;
  shared result/vector schemas remain stable. Quick start captures the actual open
  hand wrist baseline rather than clamping a neutral SDK palm at 90°; it resets the
  attempt and filters on every click. B6 text/events are wired. Webcam
  results save asynchronously to the newest-20 IndexedDB cache with bounded memory
  fallback; raw landmark observations are omitted from saved replay telemetry.
  Demo results stay session-only. Ownership/interface changes were recorded before
  S1 touched the shared scene and Person B evaluator interfaces. Audio, cloud
  synchronization and AI review remain separate tasks; A6 now adds replay. The user reviewed
  S1, reported that it looks good, and authorized branch publication and a PR into
  main (2026-10-17). This is qualitative preview approval, not measured hardware
  acceptance.

- Partial S0 - repository structure and docs seeded
- Partial S0 - Next.js, Tailwind, shadcn/ui, MediaPipe, R3F, Zustand, Zod, postgres, ElevenLabs, Vitest, Playwright installed
- Setup - Backboard model catalog verified live (`google` / `gemini-2.5-flash`, JSON output supported)
- Setup - ElevenLabs voice configured (`Alice` / `Xb7hH8MSUJpSbSDYk0k2`) and TTS smoke OK with `eleven_flash_v2_5`
- Setup - `npm run verify:ai` script added (`scripts/setup/verify-ai-services.mjs`)
- S0 - shared TypeScript contracts in `src/types/` with Zod schemas, fixtures, and unit tests
- Setup - git-crypt initialized and `.env.local` intentionally tracked/pushed encrypted; team and agent workflow documented in `docs/GIT_CRYPT.md`.
- A1 implementation - local asset preparation, camera lifecycle, hand identities,
  worker/fallback inference, development preview, regression tests and documentation.
  Preview reviewed/approved by Person A on 2026-10-17. Formal physical-camera
  acceptance remains pending; this does not complete M1.
- Setup - Tiger Cloud service provisioned (`ort1b0mw86`, Postgres 18.6 / TimescaleDB 2.30.2), CLI installed and authenticated, connection verified; Tiger env vars populated in encrypted `.env.local`.
- B0 - Tiger base migrations + schema (relational tables, hypertables, `vector(20)`), migration/seed runners (`scripts/tiger/*.mjs`, `npm run db:migrate`/`db:seed`), `/api/health` DB check, and synthetic seed; integration test `tests/unit/b0-tiger-bootstrap.test.ts` (auto-skips without `TIGER_DATABASE_URL`).
- A1/B0 integration - resolved the A1 PR's context conflict against `origin/main`
  (`7e94139`), preserving both implementations, operating rules, package scripts,
  and B0's encrypted environment update. Shared contracts are unchanged.
- B1 - Skill library: `SkillCatalogEntry` type + catalog loader (`src/lib/skills/`), four-skill catalog data, `needle-passing` `SkillDefinition`, `/library` page + cards/badges/search, `/train/[skillId]` stub with mode selector. Tests in `tests/unit/skill-catalog.test.ts`.
- B2 - reference-motion adapter framework: TS loader/validator (`src/lib/references/`),
  stdlib Python JIGSAWS/LASK adapters + shared builder (`scripts/data/`), synthetic
  sample CSVs, committed canonical fixtures under `public/references/`. Tests:
  `reference-loader.test.ts`, `reference-adapter.test.ts` (adapter run auto-skips without Python).
- A2 implementation - deterministic automatic calibration, canonical XY/depth and
  neutral-relative rotation targets, One Euro filtering, calibrated pinch
  hysteresis, 200 ms loss status and three-frame recovery without synthetic grip
  release. Development preview includes calibration/retry/cancel, target canvas,
  diagnostics and planar depth fallback. Unit/browser regression coverage and
  README, handoff, decisions and canonical plan updated. Physical acceptance is
  pending; M1 is not declared complete. A3 now consumes these controls.
- A2 workspace usability fix - replaced an all-or-nothing sweep window with
  independent sustained direction captures and actionable per-hand prompts.
  Stationary-stage quality gates are unchanged; invalid/missing observations earn
  no credit. Tests cover preserved progress, sequential hands, single-frame spikes,
  suspension and workspace-only timeout/retry. Documentation updated.
- B3 - core evaluation engine (`src/lib/evaluation/`): per-segment alignment, scoring
  helpers, 8 metrics with evidence timestamps, partial category/overall scores, worst-moment
  markers. Tests: `evaluation-score.test.ts`, `evaluation.test.ts` (perfect vs perturbed
  fixtures derived from the committed reference; deterministic).
- A3 implementation - two kinematic instruments and procedural clinical scene;
  edge-triggered single-owner acquisition, grip-preserving global pause, fresh
  release, scene/session reset and renderer recovery. Numerical, scene lifecycle
  and actual WebGL browser coverage pass; target-Mac acceptance remains pending.
- B4 - external data conversion: real JIGSAWS expert references committed data-only
  (`*-jigsaws-expert-v1.json`) for needle-passing/knot-tying/suturing (patient-side
  tools, gesture segments); `adapter.py` `--format kinematics` mode + `len==76`
  guard; `fetch.py` extracts JHU-form archives (Kaggle mirror has no kinematics);
  `proceduralSequencing` LCS fix for repeated gestures. Product/eval refs kept
  synthetic (review follow-up). `DATA_LICENSES.md` rewritten (JIGSAWS terms, Gao
  et al. citation, data-only status). Tests: synthetic needle-passing invariants +
  axis swap, three data-only real refs validated, a 76-col kinematics parse fixture
  (offsets/grip/matrix→quat/len guard), and an LCS perfect-clone-of-repeating-ref
  regression.
- A4 implementation - deterministic Needle Passing 8-segment exercise state machine
  (`src/lib/exercise/`), 3D target rings (`ring-1..3`), corridor arc, release ring,
  and `tissue-wall` danger zone (`src/components/scene/exercise-targets.tsx`),
  `Learn` / `Practice` / `Assessment` mode hooks (Assessment hides ghost/coaching hooks),
  early-drop and invalid-action guardrails, and `MotionFrame` recording verified
  against B3's `evaluateAttempt`. Unit, scene-lifecycle, and Chromium E2E tests pass.
- B5 - complete 20-metric evaluator: added the 12 remaining metrics
  (`src/lib/evaluation/metrics-extra.ts`), a shared `MetricContext` (`context.ts`),
  skill-specific weighting + full category/overall scoring + per-metric factual
  explanations, and `toAttemptResult()` assembling a schema-valid `AttemptResult`
  (`evaluate.ts`). Danger-zone/collision inputs are optional scene inputs; A4's
  `tissue-wall` danger zone + target geometry can now be wired in via
  `evaluateAttempt` options via the exact S1 tissue-wall box. Tests (`tests/unit/b5-metrics.test.ts`
  + updated `evaluation.test.ts`, new fixtures in `tests/fixtures/evaluation.ts`):
  full-set/canonical-order + 0-100 + explanation-per-metric structure, a targeted
  direction test per new metric (with independence checks — depth/workspace/
  bimanual unaffected by a pure XY translation; danger-zone 100 with no zones),
  weighted-overall, determinism, and the `toAttemptResult` schema round-trip.
- A5 implementation - translucent single-instrument ghost and needle renderer
  (`src/components/scene/ghost-layer.tsx`), scene-aligned 5-checkpoint trajectory
  and glowing 3D path tube, sub-frame 30 Hz `lerp`/`slerp` interpolation
  (`src/lib/exercise/ghost-playback.ts`), `0.5x` and `1x` speed controls,
  `demonstration` / `progress-coupled` (12% lead + stall step-sweep) / `continuous`
  synchronization, 1-Hand Quick Start / 1-Hand Mode (`singleHand`), 7-frame centered
  display smoothing, and runtime JIGSAWS `Needle_Passing_E005` workspace fitting +
  gesture mapping (`src/lib/exercise/ghost-reference.ts`) with Gao et al. (2014)
  attribution. Unit, scene-lifecycle, and Chromium E2E tests pass.
- B6 - live coaching event engine (`src/lib/coaching/coaching-engine.ts`): deterministic
  threshold rules → `CoachingEvent`s (path_deviation, danger_zone_near, moving_too_fast,
  unstable_grip, left_hand_unstable, rotation_late, overshoot) with 0–1 severity;
  commit-delay queue with self-correction cancel, per-type 8 s repeat suppression,
  global 4 s cooldown, 4-message spoken cap, a 0.65 recording gate plus a separate
  `voiceCoachingLevel` speak gate (Practice records medium events but speaks only
  high-severity; Assessment silent), event recording, and §14.3 message selection
  (`COACHING_MESSAGES`). 17 unit tests in `tests/unit/coaching-engine.test.ts` cover the
  three acceptance criteria (one event per large deviation, no spam while sustained,
  cancel-on-correction) plus cooldown/cap, record-vs-speak gating (incl. the Practice
  overshoot regression), `CoachingEvent` schema validity, and reset. S1 now wires live text/events.
- B7 - ElevenLabs voice integration (`src/lib/voice/` + `src/app/api/speech/route.ts` +
  `scripts/audio/generate-coach-clips.mjs`, `npm run audio:coach`): dependency-free clip
  manifest (`coach-clips.ts`), shared request contract (`speech-contract.ts`), `server-only`
  ElevenLabs helper (`tts-server.ts`), overlap-safe `AudioManager` whose `coach(type)` runs a
  live-ElevenLabs-first → pre-generated-clip → `speechSynthesis` fallback chain (see
  `docs/DECISIONS.md` 2026-10-17), 7 committed common clips under `public/audio/coach/`
  (ID3/valid mp3, 28–49 KB; `.gitignore` `*.mp3` exception added), and `/api/speech`
  public-deploy hardening (`SPEECH_ENABLED` kill-switch → 503; per-IP `rate-limit.ts` → 429).
  38 unit tests across `coach-clips`, `speech-contract`, `audio-manager`, `tts-server`,
  `rate-limit`, `speech-route` cover the four acceptance criteria plus the live→clip→browser
  chain, blob-revoke-on-cancel/interrupt, fallback overlap, kill-switch 503 and per-IP 429.
  Live-loop + narration wiring is S1/S2.
- B8 - replay controls + results UI (`src/lib/ai/deterministic-review.ts`,
  `src/lib/evaluation/metric-labels.ts`, `src/components/training/attempt-results-panel.tsx`,
  `3d-training-preview.tsx`, `3d-replay-preview.tsx`): `buildDeterministicReview(bundle)`
  builds a schema-valid `AiReview` entirely from the deterministic evaluation (no model
  call) — the B8 AI-review fallback that renders now and that B9 replaces or degrades to.
  The results panel adds a **Coach Review** section and turns the top-3 worst moments into
  buttons that open the A6 replay seeked to that issue via a new additive
  `ThreeDReplayPreview initialMarker` prop (`ReplayController.seekMarker`, falls back to
  task start). Shared metric labels were extracted to `metric-labels.ts`; shared
  `src/types/` contracts are unchanged. 5 new unit tests
  (`tests/unit/deterministic-review.test.ts`: schema-valid for perturbed + perfect
  attempts, weakest-metric evidence in improvements, worst-moment segment as largest
  difference, determinism) and 1 new Chromium e2e (`tests/e2e/replay-a6.spec.ts` B8:
  results worst-moment opens the replay at the same cursor as the in-replay marker).

## 6. In Progress
- A3 usability acceptance - synthetic depth-drift pickup, assistance switching and
  revised render screenshots pass. The user reviewed the revised preview and
  said “looks good to me” before authorizing publication. This is qualitative acceptance, not a measured soak.
- A3 physical acceptance - run the two-minute target-Mac checklist in
  `docs/SIMULATION.md`; measure median render FPS, p95 interval, tracking speed,
  end-to-end latency and profiler behavior. No real-camera A3 signoff is claimed.
- A2 manual verification - Person A confirmed calibration completes and pinching
  opens/closes the controls (2026-10-17). After receiving the recovery, rotation,
  depth, crossings and two-minute checklist, Person A reported everything seems
  mostly good, then clarified that movement feels slightly laggy throughout.
  Control-specific smoothing was tuned in response; Person A retested and accepted
  the result for now (2026-10-17). A3 implementation is now available.
  This is qualitative feedback, not a measured soak signoff.
- A2 acceptance - measured calibration duration, FPS/latency, React profiler and
  detailed physical test outcomes remain unrecorded. Use the checklist in
  `docs/HAND_TRACKING.md` when collecting formal performance evidence.
- S0 - bootstrap acceptance commands must stay green; remaining product shell dirs can grow with A1/B0
- A1 acceptance - target Mac physical-camera two-minute soak, anatomical labels,
  measured FPS/latency, React profiler, lighting/overlap and disconnect QA remain manual.
  Shared setup coordination was recorded before changing package scripts, asset
  ignore rules, the development route and Playwright's localhost origin. Person B
  subsystems and shared `src/types/` contracts were not changed by A1.
- B0 - deferred to B10/B12: continuous aggregates, vector/BM25 indexes, retention/columnstore, Tiger MCP (intentionally skipped; agents use CLI + `.env.local`)

## 7. Known Issues / Risks
- Person A reported slight movement lag. The initial filter added about 119–121 ms
  of synthetic position phase lag at 20/30 FPS. Revised position/rotation settings
  pass a <70 ms filter-delay bound plus jitter checks. This excludes camera and
  inference time. Person A accepted the revised responsiveness for now; measured
  end-to-end latency and HUD FPS/inference figures remain unrecorded.
- Person A reported confusing workspace instructions and repeated timeouts in the
  initial A2 preview. The revised arrow guidance and recoverable capture pass
  automated checks, and Person A confirmed calibration and pinch open/close work
  on retry, followed by broadly positive feedback on the remaining checklist.
  Detailed physical outcomes and measured performance remain unrecorded.
- Production build remains blocked by the existing Turbopack CSS worker local-port
  restriction (`Operation not permitted`), reproduced by the A6 escalated normal-build
  retry on 2026-10-17. Asset preparation/checksummed cache reuse passed first; the
  failure remains in the existing globals.css CSS-worker process before a successful
  production build can be established.
  Verify the normal build on an unrestricted host before release; no production success claimed.
- Full hand overlap can be ambiguous. A1 emits missing observations rather than
  manufacturing identity; restart or remove/re-show hands if initialization was incorrect.
- Synthetic browser inference verifies integration, not physical tracking accuracy or target-Mac performance.
- External dataset license and access must be confirmed before public redistribution.
- New clones need git-crypt and the securely shared existing key to unlock tracked `.env.local`; maintain a secure recovery-key backup outside the repository.

## 8. Data / Asset Status
- JIGSAWS: acquired via JHU access form (academic/non-commercial, IRB-approved). Raw in git-ignored `datasets/jigsaws/`; derived expert references committed **data-only** (`*-jigsaws-expert-v1.json`, not product-wired) with Gao et al. attribution. See `docs/DATA_LICENSES.md`.
- LASK: not acquired (CC BY 4.0; adapter ready, used only for synthetic peg-transfer fixture). See `docs/DATA_LICENSES.md`.
- SHANDS: optional future source.
- 3D assets: repository-authored A3/A4 room, instruments, target pad/grid, tip
  crosshairs, pickup halo, practice needle, target rings (`ring-1..3`), corridor arc,
  release ring and `tissue-wall` danger zone procedural geometry. No external model downloads, textures or new dependencies.
  Source/asset decision recorded in `docs/ASSET_LICENSES.md`.
- Hand Landmarker float16 v1 and MediaPipe 1.1.1 WASM: acquired, checksum verified;
  source/license/attribution recorded in `docs/ASSET_LICENSES.md`. Generated binaries are ignored.
- Reference motions: S1 evaluates the runtime canonical synthetic Needle Passing scene guide (the raw committed JSON remains unchanged). The optional JIGSAWS expert ghost is display-only; other expert-derived skills remain data-only. Synthetic peg-transfer remains available as adapter/evaluator data.
- Coaching audio (B7): 7 committed ElevenLabs-generated common clips under `public/audio/coach/<type>.mp3` (voice Alice / `eleven_flash_v2_5`). Regenerate with `npm run audio:coach -- --force`. `.gitignore` exempts these from the global `*.mp3` rule.

## 9. External Service Status
- Tiger Cloud service created: yes (project `p2r9lzrn7s`, service `ort1b0mw86` "db-21893", free plan, us-east-1, Postgres 18.6 / TimescaleDB 2.30.2; connection verified via `tiger db ping`). `TIGER_DATABASE_URL`/`TIGER_PROJECT_ID`/`TIGER_SERVICE_ID` set in encrypted `.env.local`. Details in `docs/TIGER_DATA.md`.
- Tiger DB migrations current: yes (`0001_init` applied via `npm run db:migrate`)
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): all enabled by `0001_init` (timescaledb 2.30.2, vectorscale 0.9.0 + vector 0.8.7, pg_textsearch 1.5.1)
- Tiger MCP configured for coding agents: no (not needed; agents use Tiger CLI + `.env.local`)
- Tiger cloud sync smoke test: not-run
- Tiger optional fork workflow available: unknown
- Backboard model ID verified: yes (`BACKBOARD_MODEL_PROVIDER=google`, `BACKBOARD_MODEL_NAME=gemini-2.5-flash`)
- ElevenLabs voice ID configured: yes (`ELEVENLABS_VOICE_ID=Xb7hH8MSUJpSbSDYk0k2`, voice name Alice — clear educator; TTS model `eleven_flash_v2_5`). B7 generated the 7 common coaching clips live and committed them; dynamic `/api/speech` route wired (server-only key).
- Dynamic TTS kill-switch: `/api/speech` only synthesizes when `SPEECH_ENABLED=true` (server-only env; set in local `.env.local`, must also be set in the public/Vercel deploy to enable live voice). Optional `SPEECH_RATE_LIMIT` (default 20) / `SPEECH_RATE_WINDOW_MS` (default 60000) bound per-IP calls. With the switch off, coaching uses committed clips + browser speech.
- Vercel env configured: no

## 10. Commands That Must Pass
- npm run typecheck
- npm run lint
- npm test
- npm run build

Latest A6 pickup lead-in verification (2026-10-17, uncommitted on main `57468be` after B7 PR #11):
- `npm run typecheck` and `npm run lint`: passed without warnings.
- `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`: 36 files / 315 tests
  passed, including 28 replay/controller/lifecycle tests. New coverage checks either
  pickup owner, scene-state precedence, tool-only held-object fallback, empty pinches,
  first pickup across re-grabs, nonzero recording origins, early/missing pickups,
  and preservation of the full recording. B7 tests pass alongside A6.
- Targeted Chromium verification (`train-s1.spec.ts` / `replay-a6.spec.ts`, grep
  `navigates from|S1 fixture replays`, one worker): 2 tests passed (39.1 seconds).
  A long preparation period opens at the pickup lead-in, paused, with the needle
  still free; Home scrubs back to the full recording start. Existing camera-free
  playback, marker seeking, actual tip alignment, and WebGL retry also pass.
- Production build not repeated for this opening-position change; the known
  CSS-worker port-binding restriction below remains unresolved.

Prior A6 verification (2026-10-17, uncommitted on main `a1f1c2a` after pulling S1 PR #12):
- `npm run typecheck` and `npm run lint`: passed without warnings.
- `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`: 30 files / 272 tests
  passed, including 23 new A6 tests covering clocks/segment alignment, reference-time
  markers (including one-frame segments), exact geometry/attachment, optional
  event/visibility-bounded smoothing, cap/error handling, capture on either hand,
  hidden paths, actual Three groups, Strict Mode and context/visibility cleanup.
  Migration/seed tests remain excluded to avoid cloud writes. The adapter rejection
  traceback is the existing passing negative test.
- `npm run test:e2e -- --workers=1`: all 18 Chromium tests passed before the final
  offline hardening. The final affected suite (`train-s1.spec.ts` and
  `replay-a6.spec.ts`, one worker) then passed all 6 tests (1.5 minutes), including
  webcam-stop playback without another camera request, first replay after network
  loss with IndexedDB unavailable, zero-camera fixture review, marker seeking,
  actual rendered tip alignment, WebGL retry/cursor retention, and navigation.
  An intermediate offline failure exposed separate preload/dynamic chunk entries;
  the corrected loader shares the exact module promise and permits download retry.
- The A6 WebGL screenshot (`test-results/a6-replay.png`) was visually inspected.
- `npm run build`: cached vision assets prepared successfully. Normal and elevated
  builds both reproduced the existing `globals.css` Turbopack CSS-worker port-binding
  `Operation not permitted` failure before compilation could complete. No production
  build success or physical-camera acceptance is claimed.

Latest S1 verification (2026-10-17, implementation carried to `integration/s1-training-results`, main base `097d3d4`):
- `npm run lint` and `npm run typecheck`: passed without warnings.
- `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`: 28 files / 249 tests
  passed with read-only health connectivity outside the sandbox. Migration/seed tests
  remain excluded to avoid cloud writes. Expected adapter rejection traceback is a
  passing negative test.
- `npm run test:e2e -- --workers=1`: all 17 Chromium tests passed after the final
  quick-start correction (3.0 minutes). Coverage includes real local MediaPipe
  worker/main-thread inference and offline processing, natural fixtures, guided
  calibration-to-results, IndexedDB persistence/reload, permission fallback,
  mode/source changes, camera release on navigation, WebGL recovery, and a complete
  quick-start attempt with networking and IndexedDB unavailable. No uncaught page
  errors were observed in S1 acceptance cases.
- `npm run build`: prepared cached vision assets, then reproduced the existing
  Turbopack `globals.css` CSS-worker port `Operation not permitted` failure even with
  an elevated retry. No production-build or physical-camera signoff is claimed.

Latest verification for B7 (2026-10-17, on `person-b/b7-elevenlabs-voice` rebased onto main `a1f1c2a` / S1 PR #12):
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npx vitest run --exclude "**/b0-tiger-bootstrap.test.ts"`: 38 B7 tests across
  `coach-clips`, `speech-contract`, `audio-manager` (live→clip→browser `coach()` chain +
  blob-revoke-on-cancel/interrupt + browser-fallback overlap), `tts-server`, `rate-limit`,
  and `speech-route` (kill-switch 503 + per-IP 429) pass. Full suite to be re-confirmed
  post-rebase (see note below). B0 Tiger test excluded to avoid cloud writes.
- `npm run audio:coach`: generated 7 valid (ID3) mp3 clips live via ElevenLabs; idempotent
  re-run skips all 7. Production build not re-run (host still hits the known Turbopack
  CSS-worker restriction; B7 adds one pure-TS route + lib + static assets, no new deps).

Prior verification for B6 (2026-10-17, on `person-b/b6-live-coaching-engine` rebased on main `100c97b` / A5 PR #9):
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npx vitest run --exclude "**/b0-tiger-bootstrap.test.ts"`: 24 files / 216 tests
  passing, including 17 new B6 tests in `tests/unit/coaching-engine.test.ts` (one event
  per large deviation, no spam while sustained, cancel-on-correction, cooldown/cap,
  record-vs-speak `voiceCoachingLevel` gating incl. the Practice overshoot regression,
  `CoachingEvent` schema validity, reset). The B0
  Tiger integration test was excluded to avoid cloud writes (passes idempotently alone).
  Production build not re-run (engine is pure TS, no new deps/routes; host still hits the
  known Turbopack CSS-worker restriction).

Latest verification on `person-a/a5-ghost-renderer` (2026-10-17, on top of main `296e8b5` / B5 PR #8):
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`: 23 files / 199 tests
  passing, including 9 new A5 unit tests in `tests/unit/ghost-playback.test.ts`
  (120 Hz sub-frame interpolation over 30 Hz frames, opposite-hemisphere quaternion
  `slerp`, grip-to-tip invariant, JSON trail + 5-checkpoint scene alignment, `0.5x` vs
  `1x` speed scaling, progress-coupled 12% lead and stall step-sweep, `Assessment` mode
  hiding, JIGSAWS `Needle_Passing_E005` workspace fitting + `G8`/`G2` gesture mapping,
  7-frame centered display smoothing, and 1-Hand Mode completion) plus extended
  `GhostLayer` scene lifecycle tests in `tests/unit/training-scene.test.tsx` and all
  B5 20-metric tests. B0 migration/seed tests were excluded to avoid cloud writes.
- `npm run test:e2e -- --workers=1`: all 12 Chromium tests passed across 3 files,
  including A5 ghost `0.5x`/`1x` speed switching, `Progress-coupled`/`Continuous`
  sync toggling, JIGSAWS expert reference loading with Gao et al. attribution,
  `Assessment` mode ghost control hiding, and full 8-segment Needle Passing completion
  in `tests/e2e/tool-simulation.spec.ts`.

Prior verification on b5 (2026-10-17, after merging latest main incl. A4 PR #7):
`npm run typecheck` and `npm run lint` clean; `npm test` = 23 files / 193 tests
passing, including the new B5 20-metric direction/weighting/`toAttemptResult` tests
(plus a PR #8 review fix: `overshootControl` now scores reversals as excess over
the reference, guarded by a JIGSAWS perfect-clone regression) and A4's
exercise-controller/scene suites. The Python adapter `len==76` guard test
prints an expected subprocess traceback to stderr (not a failure). The B0 Tiger
integration test ran green against the cloud service. Production build not re-run on
this branch (still blocked by the known Turbopack CSS-worker restriction).

Prior verification on `person-a/a4-exercise-state-machine` (2026-10-17, on top of main `31db27f` / B4 PR #6):
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings.
- `npm test -- --exclude tests/unit/b0-tiger-bootstrap.test.ts`: 21 files / 171 tests
  passing, including 11 new A4 unit tests in `tests/unit/exercise-controller.test.ts`
  (assisted/free-depth 8-segment completion, B3 `evaluateAttempt` compatibility,
  un-held/out-of-order/unaligned/unrotated/early-release/danger-zone guardrails,
  `learn`/`practice`/`assessment` mode hooks, and freshness/loss freezes), extended
  scene lifecycle coverage in `tests/unit/training-scene.test.tsx`, and all B4
  reference/LCS tests. B0 migration/seed tests were excluded to avoid cloud writes.
- `npm run test:e2e -- --workers=1`: all 12 Chromium tests passed across 3 files,
  including full calibration-to-completion Needle Passing progression, early-release
  recovery guardrails, and `Learn`/`Practice`/`Assessment` mode hook checks in
  `tests/e2e/tool-simulation.spec.ts`.

Prior verification on b4 (2026-10-17, review follow-up after rebase on main):
`npm run typecheck` and `npm run lint` clean; `npm test` = 21 files / 163 tests
passing, including the synthetic product references, the three data-only JIGSAWS
expert refs, the 76-col kinematics parse fixture + `len==76` guard, the repeat-safe
`proceduralSequencing` LCS fix (guarded by a perfect-clone-of-a-repeating-ref test),
and the Python adapter runs (auto-skip without Python on PATH). The B0 Tiger
integration test ran green against the cloud service (idempotent). Production build
not re-run on this branch.

A3 PR #5 verification (2026-10-17): typecheck and lint passed; 155 unit tests across
20 files (B0 cloud-write test excluded) plus 11 Chromium e2e tests (A1/A2 regressions
+ A3 pickup/movement/freeze/recovery/release/reset) passed; A3 WebGL screenshots
reviewed. The production build still fails in globals.css on the Turbopack
CSS-worker local-port restriction; verify on an unrestricted host before release —
no production build success claimed.

Latest B8 verification (2026-10-17, on `person-b/b8-results-ui` branched from main
`6a70cf4` / A6 PR #13):
- `npm run typecheck`: passed. `npm run lint`: passed without warnings.
- `npx vitest run --exclude "**/b0-tiger-bootstrap.test.ts"`: 37 files / 320 tests
  passed, including 5 new `tests/unit/deterministic-review.test.ts`. The Python
  adapter `len==76`-guard traceback on stderr is the expected passing negative test.
  B0 cloud-write test excluded as usual.
- `npx playwright test --workers=1`: 19 Chromium e2e tests passed across 4 files,
  including the new B8 case in `tests/e2e/replay-a6.spec.ts` (results worst-moment
  opens the replay at the same cursor as the in-replay marker; Coach Review renders).
  Playwright's Chromium binary was installed on this host to run e2e.
- `npm run build`: not re-run; B8 adds only TS/TSX (one lib, shared label map, UI
  edits — no new deps/config) and the host still hits the known Turbopack CSS-worker
  restriction. No production-build success claimed.

## 11. Next Recommended Actions
1. Person A: review the canonical A6 replay on the target Mac, including real-hand
   pickup/release, either working hand, visibility, seeking and rendering performance.
   A7 additional scene configs can follow separately; JIGSAWS replay remains deferred.
2. Person B: B8 results/review UI is implemented (Coach Review + deterministic
   `AiReview` fallback, results worst-moments jump into the A6 replay at the issue).
   Next: B9 Backboard/Gemini review — call the model with only supplied metrics +
   Tiger-retrieved coaching context, Zod-validate against `aiReviewSchema`, and
   degrade to `buildDeterministicReview` on disable/offline/malformed output (the
   render path and `AiReview` shape are already in place). Also wire `AudioManager`
   voice into S1's existing B6 seam and S2 review narration. B10 can add
   persistence/history/reload navigation. S1's inline results, Coach Review fallback,
   and text coaching must remain usable without any of these services.
3. Person B: B10 cloud synchronization uses the existing pending `SavedAttempt` /
   `AttemptUploadPayload` and frozen 20-vector contracts. Keep demo attempts out of
   uploaded history and preserve asynchronous local evaluation/cache behavior.
4. Set `SPEECH_ENABLED=true` (and optional `SPEECH_RATE_LIMIT`) in the Vercel deploy to
   enable live voice; keep `npm run verify:ai` green after key rotation and regenerate
   coaching clips with `npm run audio:coach -- --force` if the voice changes.
5. Run the normal production build on an unrestricted host and collect the target-Mac
   physical checks in `docs/HAND_TRACKING.md` / `docs/SIMULATION.md`. The build-port
   restriction and measured hardware acceptance remain open.

## 12. Manual Demo Notes
- Target browser: latest Chrome on macOS.
- Product: `/library` → Needle Passing, or `/train/needle-passing?fixture=needle-pass-good`
  / `?fixture=needle-pass-late-rotation` for camera-free animated demonstrations.
  Results appear inline; Try again starts a fresh attempt. `?fixture=off` forces webcam
  mode even when the public demo environment flag is enabled.
- B8: the inline results include a **Coach Review** (deterministic summary until B9's
  live AI is enabled) and clickable **top issues** — click one to open the replay seeked
  to that moment. The full 20 metrics stay collapsed under "All 20 Kinematic Metrics".
- A6: complete a pass, stop the camera if running, and select **Replay latest attempt**.
  Issue buttons jump in reference-time alignment; original timing preserves recorded
  active-attempt timestamps. Hidden tabs/context loss pause; retry keeps the cursor.
  Back to training resets the exercise, retaining the previous replay until replaced.
  Only the latest replay/reference/needle package is retained in memory; reload/history
  navigation and persisted scene metadata remain B8/persistence work.
- Development preview: `http://localhost:3000/dev/hand-tracking?debug=1`; explicit Start/Stop controls.
- No model CDN dependency during tracking. `npm run prepare:vision` needs network only when the pinned model cache is absent/invalid.
- Worker uses the classic WASM loader to match Turbopack's worker output; fallback reason is visible in debug mode.
- Stop and route/effect cleanup release the camera. Background tabs suspend inference while retaining the stream.
- Use bright frontal lighting.
- Keep both hands fully visible during calibration.
- Select Calibrate controls after Start camera. Hold open hands, pinch both, then
  reopen and follow the arrow checklist above the webcam. Move one hand at a time
  left/right/up/down from neutral and hold briefly until each arrow checks off.
  Completed arrows are saved through interruptions. Workspace allows 45 seconds;
  Retry workspace keeps earlier calibration and confirmed arrows. Three seconds
  is the minimum valid observation time; guided movement/transitions take longer.
- Calibration is memory-only and resets with camera stream/format changes. Tabs
  and backend fallback preserve profiles but require three-frame recovery.
- Debug mode shows calibrated pinch thresholds and a planar depth fallback.
- A3: leave Easy pickup enabled, open thumb/index finger, and move a cyan/amber
  tip ring inside the needle’s only large circle. Wait for green / “tip aligned”,
  then pinch. Open to release. If the tip enters while closed, follow the reopen
  prompt and pinch again. Both tools freeze on tracking loss. Easy pickup off
  restores free depth and depth-specific guidance; switching modes resets the
  scene, not calibration. Reset scene restores the needle. No exercise scoring.
- Backup fixture mode: not implemented yet.
