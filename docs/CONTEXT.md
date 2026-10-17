# Project Context

Last updated: 2026-10-17
Updated by: PR #15 review fixes
Current branch: integration/a7-s-completion (base origin/main ab25dcd)
Current milestone: A7 and S0–S4 implementation and automated acceptance complete
Demo-critical status: YELLOW — physical rehearsal and isolated live-database checks pending

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

Full B9 retrieval, B10 progress/history/telemetry, and B12 analytics remain separate.

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

## 5. Supporting documentation

Architecture and task definitions: docs/IMPLEMENTATION_PLAN.md.
Simulation/replay contracts: docs/SIMULATION.md and docs/A6_PLAN.md.
Demo, fallback paths, and remaining physical checks: docs/DEMO_RUNBOOK.md.
Licensing: docs/DATA_LICENSES.md, docs/ASSET_LICENSES.md.
Secrets workflow: docs/GIT_CRYPT.md. Preserve tracked git-crypt-encrypted .env.local.
Database deployment: docs/TIGER_DATA.md. Service setup: scripts/setup/verify-ai-services.mjs.
