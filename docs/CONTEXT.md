# Project Context

Last updated: 2026-10-18
Updated by: A2 surgical posture calibration and main integration follow-up
Current branch: main (integrated on origin/main 1dd0b92)
Current milestone: A7, S0–S4 and B9–B12 merged; A2 natural-posture mapping, lateral rotation and recovery fixes integrated
Demo-critical status: YELLOW — physical posture recheck pending; upstream live-database search/analytics verification preserved

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

## 1. Integration ownership and interfaces

The user authorized completion of A7 and S0–S4 plus the dependencies required by
those tasks, on one new integration branch. This authorizes coordinated edits to
Person A's runtime/simulation/scene/vision surfaces, Person B's review/voice/storage/
database/product surfaces, and their shared training/results UI. Record changes
here; do not change shared schema version or performance-vector ordering.

The integration preserves the four sibling task worktrees and all four stashes.
Recovery snapshots of task files, original bases, diffs, and statuses are stored at
`/private/tmp/steady-integration-_jg0y_h9`. They contain the task edits, not secrets.
Do not blindly restore the older autostash: it contains superseded A6 work.

Intended interfaces: existing AttemptUploadPayload for local-first cloud copies;
validated AiReview from compact deterministic measurements; one accepted review
per attempt shared by results and replay; one audio manager per session. Shared
src/types contracts and DATA_SCHEMA_VERSION remain unchanged. Test-only route
helpers belong in ordinary library modules.

## 2. Current working state

- The integration branch combines the merged S0/S1 baseline (S1 PR #12), A6
  canonical replay, B7 voice, B8 results (PR #14), and the recovered A7/S2/S3/S4 work.
- Needle Passing and Peg Transfer share TrainingRuntime, ExerciseController,
  recording, deterministic scoring, ghost playback, and replay. Peg Transfer's
  canonical guide is generated from authored synthetic control frames through the
  same simulation. Suturing and knot tying remain explicitly upcoming.
- Results and replay share one accepted review per attempt. The completed B9
  dependency validates compact measured evidence and provider output, uses
  X-API-Key, and preserves deterministic review when unavailable. Scores remain
  deterministic. Reset discards stale responses; opening replay freezes its review.
  Selecting a different replay issue updates its explanation and highlight without
  restarting narration. An unconfigured/disabled review provider is a quiet 204;
  configured provider failures retain the fallback notice.
- One session audio manager cancels narration on takeover/reset/exit. Fixture
  sessions never call live review, upload, or speech services.
- Training remains local-first with cache/sync retries, idempotent transactional
  ingestion, offline/storage/service notices, and visible render recovery.
  S4 adds loading states, scene/material polish, hidden debug controls, and credits.
  Public review and upload routes use the speech limiter's per-IP mechanism
  (20/minute and 30/minute respectively, per warm instance). Streaming body limits
  are 64 KiB and 1 MiB; review text and upload sample/event arrays are bounded
  before provider/database access. Shared recording schemas are unchanged.
- Default development and production builds use Webpack with the installed
  Tailwind loader in Next's existing CSS pipeline. The isolated E2E development
  directory avoids interfering with an existing local development server.
- Shared src/types contracts, DATA_SCHEMA_VERSION, performance-vector ordering,
  and tracked git-crypt-encrypted .env.local are unchanged.

## 3. Task ledger and branches

| Task | Source branch | Delivered status on integration/a7-s-completion |
| --- | --- | --- |
| S0 | Historical bootstrap and contracts | Build and offline regression acceptance passed |
| S1 | integration/s1-training-results | Merged PR #12; combined browser regression passed |
| A7 | person-a/a7-additional-skill-scenes | Both skills integrated; exercise/scoring/replay acceptance passed |
| B9 dependency | S3 partial review service | Validated review service and shared results/replay ownership complete |
| S2 | integration/s2-ai-narrated-replay | Focus, narration, cancellation, fallback and manual takeover passed |
| S3 | integration/s3-reliability-performance | Automated resilience/sync acceptance passed; physical performance and real SQL pending |
| S4 | integration/s4-final-polish | UI/build/browser acceptance complete; physical rehearsal pending |

The original four task worktrees and their WIP branches remain untouched, including
S2/S3/S4's original conflict state. All four stashes remain preserved. The combined
result is delivered on this integration branch, based on origin/main ab25dcd
(verified current before publication), in PR #15. Review fixes address all four
comments: marker explanations, quiet optional review, provider request limits,
and upload limits. Merge and deployment remain outside this workflow.
Source worktree file hashes were checked against the recovery snapshots.

B9 Tiger coaching retrieval (`src/lib/ai/coaching-retrieval.ts`) now grounds
`/api/review` via `review-handler` → `requestBackboardReview` (empty/unavailable
corpus degrades to metrics-only).

B10 (PR #17, reworked) builds on main's existing upload stack instead of
duplicating it. The earlier PR #17 was based on pre-#15 main and shipped a
parallel sync queue, a second anonymous-id key, and start-vs-completion timestamp
drift; that is dropped. The rework adds, on top of `cloud-sync.ts`/
`persist-attempt.ts`: a `/progress` page and `GET /api/progress` reading per-skill
aggregates from `attempt_scores` (`src/lib/db/progress-queries.ts`), and a
`DELETE /api/attempts` delete-history path. New public GET/DELETE routes go
through `history-handlers.ts`, which reuses the shared per-IP limiter (progress
30/min, delete 10/min) and validates the anonymous user id as a UUID. The progress
page uses the single `anonymousUserId()` (`steady.anonymousUserId`) and
`retryUnsyncedAttempts()` (which honours `NEXT_PUBLIC_ENABLE_CLOUD_SYNC`), checks
the DELETE response, and clears local IndexedDB copies on success so a retry
cannot resurrect deleted history. Migration `0002_progress.sql` adds the daily
progress CAGG and Hypercore columnstore policies (idempotent). (The earlier note
that `0002` was unapplied and that `percentile_agg` had to be deferred was
superseded by B12: `0002` was in fact applied, and `timescaledb_toolkit` 1.26.0
is enabled on the live service.)

B11 delivers the achievable part of "Additional
reference motions and skill configs" without fabricating a trainer scene. Suturing
and Knot Tying stay `coming-soon`, but each now has an authored, schema-validated
*skill blueprint* (`src/data/skills/{suturing,knot-tying}.ts`, `skillBlueprintSchema`
in `src/types/skill.ts`): scene-aligned phase segments, metric weights keyed to the
canonical performance-vector metrics, coaching rules, and the committed JIGSAWS
reference with attribution. `getSkillBlueprint()` (`src/lib/skills/catalog.ts`)
feeds a "what you'll practice / how it's scored" preview on the coming-soon
`/train/[skillId]` page, so cards no longer dead-end. The preview lists the
phase segments, renders the metric weights heaviest-first with above-baseline
(>1) metrics visually emphasised, and surfaces the authored coaching rules as a
"Coaching focus" list so no blueprint field is inert. The site credits JIGSAWS
line now covers these two skills, not just the Needle Passing ghost. The
blueprints never fit/score/launch the raw reference (G1–G15, raw metre scale);
each flips to a full `SkillDefinition` once an A-series trainer scene lands.
B11's functional-training portion remains gated on that scene. See
`docs/DATA_LICENSES.md` and `IMPLEMENTATION_PLAN.md` §B11 Status.

B12 delivers Tiger search, vector similarity, and hyperfunction analytics against
the live service (migration `0003_search.sql`, applied and idempotent). It adds a
StreamingDiskANN cosine index (`attempt_scores_vector_idx`) and a pg_textsearch
BM25 index (`skill_documents_bm25_idx` over `content`, english), raw-telemetry
retention policies (90 days on `motion_samples`/`metric_samples`), and one daily
`steady_refresh_search_stats` maintenance job. New query modules: `similarity.ts`
(`findSimilarAttempts`, nearest prior same-skill attempts by cosine distance),
`search.ts` (`searchCoachingDocuments`, BM25 `content <@> to_bm25query(...)`
where matches score `< 0`), and `analytics.ts` (`getAttemptDeviationStats` p50/p95
via `percentile_agg`/`approx_percentile` + `time_weight`; `getDownsampledDeviation`
via `lttb`). `coaching-retrieval.ts` (B9 hook) now grounds the review through BM25
by expanding weak-metric ids (camelCase → words) into the query, keeping the same
signature and graceful `[]` fallback — deterministic scores are unchanged. New
public GET routes `/api/similar-attempts`, `/api/search`, `/api/analytics` reuse
the shared per-IP limiter (30/min), validate ids, and return 503 when Tiger is
unavailable. `/api/similar-attempts` and `/api/analytics` require an
`anonymousUserId` (same ownership gate as `/api/progress`): similarity scopes
both the query attempt and its neighbours to that user, and analytics checks the
attempt's owner against `attempts`, so one user's attempt id can never surface
another user's attempts or telemetry. `db/seeds/0002_coaching_knowledge.sql` seeds the coaching corpus and
`0003_analytics_demo.sql` seeds synthetic attempts/telemetry under an isolable
anonymous user so similarity/BM25/analytics have data. See `docs/TIGER_DATA.md`
§§5–7, 9 and `IMPLEMENTATION_PLAN.md` §B12 Status.

B12 acceptance: typecheck, ESLint, and the production build pass (the three new
routes register as dynamic). Offline unit suite 434 passed / 11 skipped with one
pre-existing unrelated failure (`replay-narration-preview.test.tsx`, `Blob.stream`
in jsdom — confirmed failing on clean main). Live `npm run test:db` adds
`b12-tiger-search.test.ts`: nearest prior attempt within skill, known-answer BM25
retrieval, BM25-grounded review context, p95/time-weighted analytics, LTTB
peak-preserving downsampling, and the per-user ownership scoping (another user's
id yields no similar attempts and no telemetry) — all 7 pass against the live
Tiger service.

Acceptance (offline, no live DB): typecheck, ESLint, and the production build
pass; `/train/suturing` and `/train/knot-tying` prerender as static coming-soon
previews. The unit suite is 407 passed / 6 opt-in DB tests skipped, plus one
pre-existing unrelated failure in `replay-narration-preview.test.tsx`
(`Blob.stream` in the jsdom/Node environment, confirmed failing on clean main).
Migration 0002 is not yet applied to the live Tiger service (no DB access on this
host).

## 4. Acceptance evidence and remaining sign-off

- Offline unit suite after review fixes: 48 files passed, one skipped; 380 tests
  passed and six explicitly opt-in live-database tests skipped. Regression cases
  cover marker reselection, quiet unconfigured review, provider failures, per-IP
  isolation/429 retry headers, streamed byte limits, text and all array bounds.
- Typecheck, ESLint, production build, and git diff whitespace checks passed.
  Emitted CSS contains compiled Tailwind utilities.
- Complete development Chromium/WebGL suite: 22 tests passed, covering local
  MediaPipe worker/main-thread fallback, calibration/loss, both skills, replay,
  rendering recovery, offline storage, review ownership, and duplicate-sync retry.
- Final production checks passed for Peg Transfer/gated and unknown routes, and
  all three replay tests (seeking, focus, narration fallback, renderer recovery,
  and manual takeover). Fixture browser checks reject live API calls.
- Provider and ingestion failures/success are dependency-injected or mocked.
  No paid provider request or cloud database write was used for acceptance.
  No isolated PostgreSQL service is available on this host; tests do not certify
  actual concurrent SQL or deployment database permissions. npm run test:db is an
  explicit mutation-capable opt-in and requires an isolated test database.

The user selected automated acceptance first. The physical checklist in
[DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) remains pending: target Mac/Chrome, good/average
lighting, hand crossing, ten physical attempts, measured rendering/tracking/latency,
live audio rehearsal, and backup playback on the presentation machine. Synthetic
fixtures do not certify physical tracking or performance.

The backup command npm run demo:record produces a silent fixture walkthrough and
screenshots under artifacts/demo/, with on-screen review explanations. Generated
artifacts are ignored by Git; regenerate after UI changes. The completed backup
is artifacts/demo/steady-backup.mp4 (also .webm); results, replay, and Peg Transfer
screenshots were visually inspected. Recording completed without page errors or
live service requests.

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

## 6. Supporting documentation

Architecture and task definitions: docs/IMPLEMENTATION_PLAN.md.
Simulation/replay contracts: docs/SIMULATION.md and docs/A6_PLAN.md.
Demo, fallback paths, and remaining physical checks: docs/DEMO_RUNBOOK.md.
Licensing: docs/DATA_LICENSES.md, docs/ASSET_LICENSES.md.
Secrets workflow: docs/GIT_CRYPT.md. Preserve tracked git-crypt-encrypted .env.local.
Database deployment: docs/TIGER_DATA.md. Service setup: scripts/setup/verify-ai-services.mjs.
