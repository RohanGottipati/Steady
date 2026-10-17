# Project Context

Last updated: 2026-10-17 17:45 UTC
Updated by: B5 complete 20-metric evaluator (branch b5, merged latest main incl. A4 PR #7)
Current branch: b5
Current milestone: M0–M3 implemented in dev preview; M1/M2/M3 physical acceptance pending
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
- `/library` lists all four skills (data-driven from `src/data/skill-catalog.ts`) with difficulty/source/license badges, availability, and client-side search; `/train/[skillId]` is a STUB (shared file) with a mode selector and a placeholder where Person A adds the 3D trainer. Every card links to `/train/[id]`; coming-soon skills reach a friendly notice there instead of breaking navigation.
- Reference-motion framework (B2): `src/lib/references/load-reference.ts` loads + Zod-validates `ReferenceMotion` JSON (browser-usable); stdlib Python adapters (`scripts/data/{jigsaws,lask}/adapter.py` + `scripts/data/common/reference_builder.py`) convert source motion into canonical references (coordinate transform → 30 Hz resample → segment-normalize).
- External data conversion (B4): real JIGSAWS expert trials are committed as **data-only** refs at `public/references/<skill>/<skill>-jigsaws-expert-v1.json` for needle-passing/knot-tying/suturing (patient-side channels; highest-GRS `E` demo per task: Needle_Passing_E005, Knot_Tying_E003, Suturing_E002). `adapter.py` gained a `--format kinematics` mode (76-col kinematics + transcription gesture segments; matrix→quat; gripper→jaw; `len==76` guard). **These are NOT product-wired**: they carry JIGSAWS gesture ids (`G1`–`G15`) and raw metre scale, so segment-mapping + fit-to-workspace is deferred to A5. Product/eval references stay synthetic (`needle-passing-reference-v1.json` scene-scale with skill-phase segments; `peg-transfer` synthetic LASK). Raw JIGSAWS lives only in git-ignored `datasets/jigsaws/`; acquisition is the JHU access form, `scripts/data/jigsaws/fetch.py` only extracts the downloaded archives (local-only). See `docs/DATA_LICENSES.md`.
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
  against B3's `evaluateAttempt`. Ghosts (`A5`) and `/train/[skillId]` integration (`S1`) remain next.

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
  `getRecordedMotion(): RecordedMotion` (validated `MotionFrame[]` compatible with B3).

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
  A5 ghost renderer next; A1/A2/M2/M3 physical performance acceptance remains pending.

Person B - Data, Evaluation, Product, Tiger Data, AI and Voice:
- S0 bootstrap, B0 Tiger bootstrap, B1 skill library, B2 reference adapters, B3 evaluation engine (merged to main via #4), B4 external data conversion (merged to main via #6) done; B5 full 20-metric evaluator done on branch b5
- B6 live coaching event engine next (depends on B3/B5); B10 Tiger persistence can proceed in parallel against the frozen `PERFORMANCE_VECTOR_ORDER`/`vector(20)` + `AttemptUploadPayload` contracts

## 5. Completed Tasks
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
  `evaluateAttempt` options at S1 integration. Tests (`tests/unit/b5-metrics.test.ts`
  + updated `evaluation.test.ts`, new fixtures in `tests/fixtures/evaluation.ts`):
  full-set/canonical-order + 0-100 + explanation-per-metric structure, a targeted
  direction test per new metric (with independence checks — depth/workspace/
  bimanual unaffected by a pure XY translation; danger-zone 100 with no zones),
  weighted-overall, determinism, and the `toAttemptResult` schema round-trip.

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
  restriction (`Operation not permitted`), reproduced by the A3 escalated normal-build
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
- Reference motions: product/eval refs are synthetic (needle-passing scene-scale; peg-transfer LASK format). Real JIGSAWS expert-derived refs are committed data-only alongside them (`*-jigsaws-expert-v1.json`) pending A5 product wiring. All under `public/references/`.

## 9. External Service Status
- Tiger Cloud service created: yes (project `p2r9lzrn7s`, service `ort1b0mw86` "db-21893", free plan, us-east-1, Postgres 18.6 / TimescaleDB 2.30.2; connection verified via `tiger db ping`). `TIGER_DATABASE_URL`/`TIGER_PROJECT_ID`/`TIGER_SERVICE_ID` set in encrypted `.env.local`. Details in `docs/TIGER_DATA.md`.
- Tiger DB migrations current: yes (`0001_init` applied via `npm run db:migrate`)
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): all enabled by `0001_init` (timescaledb 2.30.2, vectorscale 0.9.0 + vector 0.8.7, pg_textsearch 1.5.1)
- Tiger MCP configured for coding agents: no (not needed; agents use Tiger CLI + `.env.local`)
- Tiger cloud sync smoke test: not-run
- Tiger optional fork workflow available: unknown
- Backboard model ID verified: yes (`BACKBOARD_MODEL_PROVIDER=google`, `BACKBOARD_MODEL_NAME=gemini-2.5-flash`)
- ElevenLabs voice ID configured: yes (`ELEVENLABS_VOICE_ID=Xb7hH8MSUJpSbSDYk0k2`, voice name Alice — clear educator; TTS model `eleven_flash_v2_5` smoke-tested)
- Vercel env configured: no

## 10. Commands That Must Pass
- npm run typecheck
- npm run lint
- npm test
- npm run build

Latest verification on b5 (2026-10-17, after merging latest main incl. A4 PR #7):
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

## 11. Next Recommended Actions
1. Person A: Implement **A5 — Ghost renderer** (translucent reference tool playback,
   path trail, 30 Hz frame interpolation, 0.5x/1x speed, and progress-coupled mode
   consuming A4's `modeHooks` and `overallProgress`/`segmentProgress`, plus real
   JIGSAWS reference workspace fitting), and run target-Mac physical-camera QA from
   `docs/HAND_TRACKING.md` and `docs/SIMULATION.md`.
2. Person B: B2 + B3 + B4 + B5 done → **B6** live coaching event engine (depends on
   B3/B5). B10 Tiger persistence can run in parallel now (frozen 20-vector +
   `AttemptUploadPayload` contracts; only B10 touches the DB). Joint **S1** integration
   on `/train/[skillId]` can now wire A4's exercise telemetry + `tissue-wall` danger
   zone into `evaluateAttempt` options. Deferred analytics/search work belongs to B10/B12.
3. Keep `npm run verify:ai` green after key rotation; do not start B7/B9 until B6/B8 exist.

## 12. Manual Demo Notes
- Target browser: latest Chrome on macOS.
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
