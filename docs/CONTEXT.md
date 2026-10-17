# Project Context

Last updated: 2026-10-17 00:20
Updated by: Tiger Data service bootstrap
Current branch: main
Current milestone: M0
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

## 4. Current Task Ownership
Person A - Realtime Vision and 3D Simulation:
- S0 shared bootstrap

Person B - Data, Evaluation, Product, Tiger Data, AI and Voice:
- S0 shared bootstrap
- B0 Tiger Data bootstrap follows immediately after S0

## 5. Completed Tasks
- Partial S0 - repository structure and docs seeded
- Partial S0 - Next.js, Tailwind, shadcn/ui, MediaPipe, R3F, Zustand, Zod, postgres, ElevenLabs, Vitest, Playwright installed
- Setup - Backboard model catalog verified live (`google` / `gemini-2.5-flash`, JSON output supported)
- Setup - ElevenLabs voice configured (`Alice` / `Xb7hH8MSUJpSbSDYk0k2`) and TTS smoke OK with `eleven_flash_v2_5`
- Setup - `npm run verify:ai` script added (`scripts/setup/verify-ai-services.mjs`)
- S0 - shared TypeScript contracts in `src/types/` with Zod schemas, fixtures, and unit tests
- Setup - git-crypt initialized and `.env.local` intentionally tracked/pushed encrypted; team and agent workflow documented in `docs/GIT_CRYPT.md`.
- Setup - Tiger Cloud service provisioned (`ort1b0mw86`, Postgres 18.6 / TimescaleDB 2.30.2), CLI installed and authenticated, connection verified; Tiger env vars populated in encrypted `.env.local`.

## 6. In Progress
- S0 - bootstrap acceptance commands must stay green; remaining product shell dirs can grow with A1/B0

## 7. Known Issues / Risks
- External dataset license and access must be confirmed before public redistribution.
- New clones need git-crypt and the securely shared existing key to unlock tracked `.env.local`; maintain a secure recovery-key backup outside the repository.

## 8. Data / Asset Status
- JIGSAWS: not yet acquired/cleared.
- LASK: not yet acquired.
- SHANDS: optional future source.
- 3D assets: not yet selected.
- Reference motions: none yet.

## 9. External Service Status
- Tiger Cloud service created: yes (project `p2r9lzrn7s`, service `ort1b0mw86` "db-21893", free plan, us-east-1, Postgres 18.6 / TimescaleDB 2.30.2; connection verified via `tiger db ping`). `TIGER_DATABASE_URL`/`TIGER_PROJECT_ID`/`TIGER_SERVICE_ID` set in encrypted `.env.local`. Details in `docs/TIGER_DATA.md`.
- Tiger DB migrations current: no (no migrations applied yet - B0 pending)
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): timescaledb enabled (2.30.2); vectorscale 0.9.0 / pg_textsearch 1.5.1 / vector 0.8.7 available but not yet enabled (enable in B0)
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

Latest verification (2026-10-16): typecheck and lint passed; unit tests passed
(2 files, 8 tests). Production build was blocked by the execution sandbox:
Turbopack's CSS worker could not bind a port (`Operation not permitted`). Run
`npm run build` outside the sandbox to verify the production build.

## 11. Next Recommended Actions
1. Person A begins A1 webcam and hand tracking (contracts are ready).
2. Person B begins B0 Tiger Data migrations (`TIGER_DATABASE_URL` is set): enable `vector`/`vectorscale`/`pg_textsearch`, add `db/migrations/` + runner, core tables and hypertables, `/api/health` DB check, seed one skill + synthetic attempt; then B1/B2.
3. Keep `npm run verify:ai` green after key rotation; do not start B7/B9 until B6/B8 exist.

## 12. Manual Demo Notes
- Target browser: latest Chrome on macOS.
- Use bright frontal lighting.
- Keep both hands fully visible during calibration.
- Backup fixture mode: not implemented yet.
