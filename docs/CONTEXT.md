# Project Context

Last updated: 2026-10-26
Updated by: Repository cleanup (unused files/dependencies removed) and README refresh
Current milestone: V1 surgical targets with reliable fullscreen and focus-view fallback
Working state: latest remote main integrated with fullscreen fallback; delivery branch main; no deployment performed
Physical acceptance: pending on target Mac/Chrome

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

## 1. Current product

Steady is a browser-based, webcam-controlled surgical motion simulator. The current journey is landing → library → calibration/training → deterministic results → comparison replay → synced progress.

- Needle Passing and Peg Transfer train through the same runtime in Learn, Practice, and Assessment modes.
- Suturing and Knot Tying provide authored blueprints, not playable trainer scenes.
- Canonical synthetic guides drive deterministic scoring. The optional JIGSAWS Needle Passing ghost is demonstration-only. LASK recordings are not included.
- The UI archive supplies branding, page layouts, and procedural room scenery. Its mock calibration, mouse training, scoring, fake history, bundled design system, and Vite routing are not imported.
- Raw video and landmarks stay local. Webcam attempts retain the newest 20 local results/tool recordings; cloud sync is optional. Fixture sessions do not call live review, speech, or upload services.

## 2. UI architecture and invariants

Public pages share one dark theme, semantic surfaces, product header/footer and canonical skill-card presentation. The decorative waveform and anonymous identity labels are removed. Long credits are available only on `/notices`, linked from the public footer. Available training routes use a viewport-filling workspace with a closer surgeon camera, live pickup/tracking guidance, persistent video, a browser fullscreen toggle with an in-page focus-view fallback and a dismissible settings/guide panel (Escape closes it and restores focus). Attempt controls, calibration and safety status remain directly available; secondary session details expand on demand. Results/replay share the dark theme. Runtime, hand calibration, scoring and persistence contracts remain unchanged.

The existing TrainingRuntime, tracking/calibration controllers, recording, evaluator, accepted review ownership, and per-session AudioManager remain authoritative. UI stages derive from those systems; there is no prototype simulation or timer-driven calibration. Per-frame motion stays in refs; HUD sampling remains bounded. Training uses fixed control/guidance rows around a flexible scene row. Longer instructions and expanded details scroll within those rows; live coaching, errors and connection notices float outside layout flow, preserving canvas dimensions and camera framing during attempts.

The room is a static presentation layer rendered through the installed React Three Fiber stack. Geometry is batched by shared material. Training-local coordinates are placed on the table once; evaluation, stored tools, collision tests, and replay records remain canonical. Replay cameras transform local focus points into world space. Orbiting hands control back to the user and cancels automatic narration/focus behavior.

Shared attempt schemas, DATA_SCHEMA_VERSION, coordinate convention, and performance-vector order remain unchanged. No database migration or new runtime dependency is required. Existing Webpack/Tailwind integration remains in place.

When native fullscreen is rejected, unavailable or explicitly disabled, the same
button opens focus view within the available browser window. Focus view hides the
trainer header and expands the existing trainer without remounting the video or
canvas. The button becomes “Exit focus view”; Escape first closes open settings,
then exits focus view. Cleanup restores the normal layout on exit/unmount. Native
fullscreen stays preferred where permitted; the fallback does not remove browser
chrome or bypass an embedding application's permissions.

Segment Timing now compares normalized active-time shares across steps (total
variation, tolerance 0.5), rather than absolute durations against the roughly
three-second synthetic guide. A uniformly slower pass retains its timing score;
uneven time allocation lowers it. Each observed interval belongs to the stage
active until the next frame, so single-frame stages and repeated visits are
measured correctly. Results explain step timing balance in plain language. Existing
saved results are not rescored; older timing scores and timing-dependent aggregates
are not directly comparable with new attempts. Vector order and storage schemas
remain unchanged.

### Training target visuals (V1)

Exercise visuals are a presentational layer inside the existing `TrainingField`; they never feed evaluation, collision, ghost, replay or storage. Training-local frame is unchanged (+X surgeon right, +Y away, +Z up, working plane Z = 0, placed by `TRAINING_FIELD` position `[0, 1.32, -0.05]`, rotation `[-π/2, 0, 0]`, scale `1.2`). Targets sit below Z = 0 on `FIELD_FLOOR_Z = -0.092` so checkpoints, needle, peg and ghost remain above them.

- `src/data/training-targets.ts` — `trainingTargetKind(skillId)` mapping plus target dimensions: needle-passing/suturing → `synthetic-tissue-pad`; knot-tying → `tissue-knot-trainer`; peg-transfer → `peg-transfer-board`; cholecystectomy (future procedure module) → `surgical-anatomy`; anything else → `fallback`. Tissue pad: centre `(0, 0.17)`, 0.8 × 0.5, fat 0.03 + dermis 0.015 + raised skin 0.02, incision at x = 0 from y 0.06–0.30 under Ring 2. Pegboard: tray centre `(0, 0.2)` 1.0 × 0.66 × 0.05, rubber insert, decorative pegs only away from the source/target posts.
- `src/components/scene/targets/` — `training-target.tsx` (switch), `synthetic-tissue-pad.tsx` (layered skin pad, incision, entry/exit marks under Ring 1/Ring 3, fallback pad), `tissue-knot-trainer.tsx` (clamped vessel + suture over the pad), `peg-transfer-board.tsx` (FLS-style board, never anatomy), `surgical-anatomy.tsx` (Drei `useGLTF` + preload, lazy-loaded so simple exercises never fetch the GLB), `organ-map.ts` (name normalisation, `buildOrganMap`, material-cloning, emissive highlight), `tissue-surface.ts`/`tissue-materials.ts` (procedural skin geometry and cached canvas textures; `performanceMode` uses standard rather than physical material).
- Danger-zone meshes keep their ids/colour feedback but are restyled: `tissue-wall` is a tissue fold (`#c98676`), `board-edge` is the pegboard front rail (`#4b5563`); both turn red in the zone. Collision boxes in exercise configs are unchanged.
- Integrated in `training-scene.tsx`, `replay-scene.tsx`, `room-preview-canvas.tsx`. Development viewer: `/dev/training-targets?skill=<id>` (404 outside development) with organ-highlight toggles.
- Anatomy asset: `public/models/patient/hepatobiliary-anatomy.glb` (~330 KiB, ~23.6k triangles, meshes `liver`, `gallbladder`, `cystic_duct`, `common_hepatic_duct`, `hepatic_artery`, `portal_vein`), built reproducibly by `node scripts/assets/build-hepatobiliary-glb.mjs` from BodyParts3D (CC BY 4.0; see ASSET_LICENSES). Source mm → metres, BodyParts3D Z-up → glTF Y-up (`x, z, -y`), centred on the liver/gallbladder; rendered at position `[0, 0.17, -0.06]`, scale `2.6` in training-local space. `.gitignore` exempts `public/models/patient/*.glb` only.
- Unit tests: `tests/unit/training-targets.test.ts`, `tests/unit/organ-map.test.ts`. The integrated full offline suite passes, including `replay-narration-preview.test.tsx`; the earlier V1 handoff failure did not recur.

## 3. Progress and deletion

GET /api/progress preserves per-skill aggregates and adds global summary statistics and up to 20 chronological real score points per skill. Global averages are calculated before rounding; charts and improvement labels describe only the recent window. Category bars represent all-history averages. Reads use attempt_scores, not raw telemetry. Existing UUID validation, user scoping, rate limiting, and 503 fallback remain.

History deletion drains in-flight uploads, pauses retries, deletes only the current anonymous user's cloud history, then clears local copies. A persistent cleanup marker blocks uploads after incomplete cleanup; retry deletion finishes the operation. Stale retry snapshots cannot recreate deleted attempts in the current session. Device-scoped anonymous identity is not authentication; cross-tab concurrent training/deletion is not a new synchronization guarantee.

## 4. Acceptance and operations

Repository cleanup on 2026-10-26: removed the unused `ListeningPill` component, the
default Next.js template SVGs in `public/`, redundant `.gitkeep` files in populated
directories, unused exports (`REPLAY_ORBIT`, `B3_METRICS`, `B5_EXTRA_METRICS`,
`isSkillAvailable`) and the unused `zustand`, `leva` and `@elevenlabs/elevenlabs-js`
dependencies (speech uses the ElevenLabs REST API directly). No runtime behaviour
changed. ESLint, TypeScript, production build and the offline suite (488 passed,
14 opt-in database tests skipped) passed. README now documents structure,
prerequisites, environment variables and all npm scripts.

Main integration verification on 2026-10-18: fast-forwarded to `cb5fc72`
(V1 training-target visuals) and retained the fullscreen fallback. Only the context
header conflicted; the target-visual and fullscreen documentation were both kept.
Production build, TypeScript, ESLint and whitespace checks passed. The full offline
suite passed 489 tests with 13 opt-in database tests skipped. All seven focused
production browser checks passed: Peg Transfer/results/replay, native fullscreen,
stable desktop/mobile frames, and the three fullscreen fallback conditions. The
fallback tests allow 15 seconds for the integrated scene to load; application timing
is unchanged. No migration or deployment was performed.

Fullscreen fallback follow-up on 2026-10-18: production build, TypeScript, ESLint
and whitespace checks passed. All six focused production browser checks passed:
native fullscreen, stable frames at desktop/mobile widths, and focus fallback for
rejected, missing and disabled native APIs. Fallback checks verify the same video
node survives, settings/Escape precedence works, and exiting restores the header.
Fullscreen fallback is integrated with the latest V1 target visuals for delivery on main. No deployment was performed.

S4 UI polish verification on 2026-10-18:

- Production build, TypeScript, ESLint and whitespace checks passed.
- Full offline unit suite passed after both repairs: 470 tests, 13 opt-in database tests skipped. Six timing regressions cover uniform slower pacing, uneven pacing, sparse sampling, revisits, missing stages and readable explanations.
  After the camera framing change, the four room-presentation checks passed again.
- Final production browser run passed all eight product/Peg Transfer scenarios:
  responsive public pages, progress/error/deletion states, camera-free sample
  results/replay, contextual settings with keyboard focus, fullscreen and notices,
  plus stable frame dimensions through desktop/mobile sample completion, expanded
  details, settings and connection notices. Both stability tests failed before
  the repair (two desktop sizes and four mobile sizes), then passed afterward.
- Development runs also passed camera calibration → completion → review/sync/replay,
  denied-camera/sample switching, WebGL recovery, offline/storage-unavailable
  completion, and offline/failed-reference recovery. The Peg Transfer development
  run completed its product assertions but caught a Next.js prerender Performance
  measure negative-timestamp error; its final production rerun passed without it.
- Final screenshots are in ignored `artifacts/acceptance/`, including desktop
  training and mobile training/results. No new live-service or physical webcam
  acceptance is claimed. No migration or deployment was performed.

Baseline before UI changes: typecheck and ESLint passed; 455 offline tests passed, 13 opt-in database tests skipped.

UI verification on 2026-10-18:

- Full offline suite: 464 passed, 13 opt-in database tests skipped. After the final renderer/timeout fixes, the targeted review/runtime/scene suites passed all 22 checks.
- TypeScript, ESLint, production build and whitespace checks passed.
- All 27 development browser scenarios passed across the full run and targeted reruns. The full run exposed an outdated camera-layout assertion, software-rendering calibration load, and results overlapping session controls. These were corrected and the affected scenarios rerun successfully. There was no additional complete 27-test run after the final fixes.
- Final focused browser run: public responsive pages, camera-free results/replay, denied-camera → samples → mode switching → webcam, and fixture WebGL restoration all passed (4/4). Earlier targeted reruns passed the physical-observation fixtures, depth assistance, actual training completion, storage failure and loss/recovery scenarios.
- Production Peg Transfer/gated routes and narrated replay passed (2/2).
- The scoped live smoke passed all four checks: actual upload/duplicate retry/progress/ownership, Backboard review generation, ElevenLabs audio bytes, and deletion/empty-history verification for the fresh test user. Earlier live runs also cleaned up their test users. No migration/shared seed ran.
- Live evidence: ignored artifacts/acceptance/live-smoke.json and live-speech.mp3. Responsive screenshots are in the same directory. Production preview: http://localhost:3013.

Rendering now pauses to demand mode during calibration; software WebGL automatically selects the reduced graphics budget. The results panel leaves session controls reachable. Model review retains deterministic notes immediately while allowing 20 seconds for the provider and 25 seconds for the client request; the former eight-second provider budget rejected the live response. Physical tracking, audio-device rehearsal, and the ten-attempt performance checklist must be recorded independently; synthetic observations are not physical sign-off.

The new opt-in test:live command uses a fresh anonymous user on the configured service. It checks upload/idempotency/progress/ownership, actual review and speech output, then deletes only that user's data in cleanup. It does not migrate or seed. test:db remains reserved for an isolated database because it applies migrations and seeds.

Run typecheck after build, not concurrently with regeneration of .next/types. E2E uses .next-e2e and a separate port. Regenerate demonstration artifacts after UI changes. Preserve git-crypt attributes and the encrypted tracked environment file.

## 5. Surgical Posture Calibration

Goal: map a relaxed palms-down/slightly inward working posture into the existing
canonical instrument space. Initial user testing prompted lateral rotation and
recovery fixes; final physical acceptance after those fixes remains pending.

Inspection completed before implementation: `src/lib/vision/{landmarker,backends,
tracking-controller,hand-identity,types,hand-geometry,calibration,
workspace-calibration,control-types,hand-controls,pinch,use-hand-controls,
control-ui,preview-coordinates}.ts`, the tracking worker/hook, One Euro filter,
camera calibration/preview UI, training session, instrument/training scene,
tool simulation, exercise controller/runtime/configs, attempt evaluator,
ghost/reference playback, replay controller/types, cloud sync, shared hand/tool/
motion/geometry schemas, and related unit/browser tests. Read CONTEXT,
IMPLEMENTATION_PLAN, HAND_TRACKING and installed Next environment guidance.

Owned changes: existing vision calibration/mapping and calibration UI/diagnostics,
their fixtures/tests, and documentation. Existing ToolControlTarget, shared schemas,
simulation/exercise/evaluation, ghost data, persistence and replay contracts remain
unchanged. Baseline relevant unit suites: six files, 88 tests passed.

Previous behavior used a camera-space delta (`current * inverse(neutral)`), asked
for palms facing the camera during workspace capture, and required a spread-open
neutral ratio of 0.55. Quick start captured rotation/scale once and retained preset
image centers. The new default captures the user's relaxed lower working posture
as neutral while preserving canonical instrument rest positions/orientations.

- Basis uses world landmarks 0/5/9/17. SDK points remain untouched; control points
  use the existing `(-x,-y,-z)` conversion once. Forward is wrist→middle MCP (+Y),
  across is pinky→index MCP orthogonalized against forward (+X), and normal is
  across×forward (+Z). Left across/normal are both negated to normalize anatomical
  handedness while retaining a proper rotation. Preview mirroring stays display-only.
- Neutral capture independently requires at least 30 distinct valid frames over
  750 ms (normally 1–1.5 seconds). Confidence is assigned handedness probability
  ≥0.75, not landmark accuracy. Existing position/scale/angle stability bounds and
  scheduling gaps under the existing 200 ms tracking grace are tolerated; explicit
  missing/invalid observations reset incomplete captures immediately. Pinch retains
  its 120 ms evidence gap limit. Completed neutral hands survive interruptions of the
  other hand. Centers/scales use medians; orientation uses hemisphere-aligned
  incremental slerp. Thumb/index need only be slightly separated (ratio >0.15).
- Guided stages remain neutral → pinch (750 ms) → per-hand four-arrow workspace
  capture (1,500 valid ms, 120 ms sustained arrows). Existing 15/45-second timeouts,
  cancellation, completed arrows and workspace-only retry remain. Closed ratio must
  be ≤0.5 and ≥0.15 below the neutral/open value. Keep palms down/inward throughout.
- Quaternion order: `R = inverse(Qneutral) * Qcurrent`; tool-relative rotation is
  `C * R * inverse(C)` and target is `QtoolNeutral * constrain(toolRelative)`.
  C and both QtoolNeutral values are explicitly identity because the current models
  already use +Y shafts/+X jaw opening. No renderer or ghost offset is added.
  YXZ Euler is used only for limits/directional mapping/debug: X pitch ±50°, Y shaft roll ±80°, Z yaw
  uses direction -1 after clamping to correct the inverted lateral wrist sweep
  reported during physical QA; pitch, roll and position directions are unchanged.
  Yaw limits are ±60°, then the existing configurable total cap (default 90°). All filtering and
  display interpolation remain quaternion-based.
- Position uses displacement around each captured SDK image center, aspect-correct
  mirrored X/upward Y, existing calibrated directional ranges, ±0.75 XY travel and
  rests (-0.5,0,0)/(0.5,0,0). One-hand rest remains (0,0,0). Quick start now uses
  the same sampler for neutral position/scale/orientation and cannot publish a
  usable target before capture; each newly appearing hand is captured independently.
  Neutral sampling runs independently of the subsequent three-frame tool recovery.
  Its preset ranges/pinch thresholds remain (enter 0.3312, release 0.396).
- Pinch stays 3D world thumb-tip/index-tip distance divided by MCP palm width.
  Guided thresholds remain `closed + 0.28*(open-closed)` / `closed + 0.40*(open-closed)`
  with 100 ms debounce. Missing input never creates a release. Tracking still holds
  transforms/grip for 200 ms and pauses progression immediately on missing input.
  After user-reported stuttering during surgery, live motion accepts variable
  inference cadence within that freshness window and resumes a brief gap on the
  next valid frame. Initial/prolonged-loss/suspended recovery still requires three
  valid frames; pinch evidence still resets on gaps over 120 ms. Existing
  rotation-confidence and jump gates remain. No predicted samples earn progress.
- Depth stays apparent-width-relative, `clamp(2*(scale/neutralScale-1),-1,1)*0.15`.
  Planar/Easy pickup behavior is unchanged. Z alone now uses One Euro 1.5 Hz,
  beta 0.25, derivative cutoff 1 Hz; XY and orientation retain 3 Hz/beta 0.75 with
  1 Hz derivative/angular-speed filtering. Display response remains 40/s.
- Mapping flag: `NEXT_PUBLIC_SURGICAL_POSTURE_MAPPING` is enabled unless `false`.
  Restart/rebuild and recalibrate to use the temporary legacy fallback. Additional
  palm-normal/relative-angle/target diagnostics require development plus `?debug=1`,
  sample refs at 4 Hz, and are absent from production. They open in a collapsible
  overlay to avoid displacing the webcam. Quick start scrolls the preview into
  view while capturing, preventing offscreen video callback throttling. Existing
  debug UI is preserved. CameraPreviewFrame keeps the same live video/canvas in a
  small floating preview when its inline anchor scrolls offscreen, avoiding browser
  video-callback throttling during exercises without restarting tracking.
- ToolControlTarget and shared HandFrame/MotionFrame/ToolFrame schemas, coordinate
  version, performance-vector ordering, ghost data, recording/evaluation/replay and
  Tiger upload contracts are unchanged. `HandFrame.palmRotation` still matches the
  mapped canonical control rotation. Raw landmarks remain transient; stored replay
  continues containing authoritative canonical tools, not raw hand-relative poses.

Changed implementation: hand-geometry.ts, calibration.ts, hand-controls.ts,
control-types.ts, control-ui.ts, use-hand-controls.ts, camera/hand-control-panel.tsx,
camera/camera-preview-frame.tsx and both training/development preview consumers;
related unit/browser fixtures/tests (including train-s1.spec.ts's durable Ring 1
checkpoint assertion) and CONTEXT/HAND_TRACKING/IMPLEMENTATION_PLAN/
DEMO_RUNBOOK documentation. No new dependency or external service was added.

Verification on integrated main: full offline suite 455 passed, 13 opt-in database
tests skipped; typecheck, lint and production build passed. Full browser run passed
22 of 23 scenarios; the remaining depth-assistance scenario timed out during
calibration setup at the helper's old five-second pinch wait. The helper now allows
the app's existing 15-second stage budget, and that scenario passed its targeted
rerun (27.8 seconds). No product timing or evaluation semantics changed for this fix.
The new lower-palms-down browser scenario passed independent movement, shaft roll,
pinch/release and loss/recovery. Training-page completion with mocked model review,
sync retry, IndexedDB and replay passed; quick-start completion/replay without
network or IndexedDB passed after the preview-visibility and independent neutral
capture fixes. Targeted browser reruns also passed main-thread tracking fallback and
WebGL recovery. All 23 browser scenarios have passed across the integrated full run
and the targeted rerun; there has not been a second complete run after the helper
timeout adjustment. These are synthetic hand observations, not real hands.
The user tried real hands and reported inverted lateral rotation and repeated loss
interruptions; both received targeted mapping/recovery fixes. Full physical
neutral/movement/wrist axes/pinch/release, overlap/loss and a live Needle Passing
attempt with persistence/review/replay still require acceptance after these fixes.
No real camera or live Tiger/provider success is claimed by synthetic tests.

Known limits: webcam field of view must include the desk working area. Complete
overlap/edge-on hands can defeat tracking; tilt slightly toward the camera while
retaining the natural posture. Apparent-width depth is also affected by palm tilt;
use the existing planar/Easy pickup fallback if needed. Extreme out-of-range wrist
pitch can cross an Euler branch; the constrained working range is the supported
interaction. Retain the legacy switch until physical acceptance is recorded.

## 6. Documentation map

README.md describes the current product and setup. IMPLEMENTATION_PLAN.md retains the subsystem architecture and historical task definitions with a current UI delivery addendum. SIMULATION/HAND_TRACKING document runtime boundaries; TIGER_DATA documents database behavior; DEMO_RUNBOOK separates automated and physical acceptance. A6_PLAN is historical. Asset and dataset provenance remain in their respective licensing documents.
