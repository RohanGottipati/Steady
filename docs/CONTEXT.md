# Project Context

Last updated: 2026-10-17 05:40 UTC
Updated by: B2 rebased on main (A1 + B0 + B1)
Current branch: b2
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
- A1 implementation available at `/dev/hand-tracking?debug=1` in development:
  explicit camera controls, mirrored skeleton preview, stable raw hand slots,
  ref-backed updates, GPU/CPU worker and main-thread fallback, debug diagnostics.
- Local model/WASM assets are prepared before dev/build; cached assets support offline use.
- Person A reviewed the tracking preview and reported it looks good (2026-10-17).
  This records preview approval; the formal soak/performance checklist is still pending.
- Tiger Data schema live: migration `0001_init` applied (core relational tables + 4 hypertables, `attempt_scores.performance_vector vector(20)`); `npm run db:migrate`/`db:seed` runners work and are idempotent; one synthetic `needle-passing` attempt seeded and queryable.
- `/api/health` reports `{ ok, service, db }` where `db` is `up`/`down`/`unconfigured` and never throws on DB outage (server-only client in `src/lib/db/`).
- `/library` lists all four skills (data-driven from `src/data/skill-catalog.ts`) with difficulty/source/license badges, availability, and client-side search; `/train/[skillId]` is a STUB (shared file) with a mode selector and a placeholder where Person A adds the 3D trainer. Every card links to `/train/[id]`; coming-soon skills reach a friendly notice there instead of breaking navigation.
- Reference-motion framework (B2): `src/lib/references/load-reference.ts` loads + Zod-validates `ReferenceMotion` JSON (browser-usable); stdlib Python adapters (`scripts/data/{jigsaws,lask}/adapter.py` + `scripts/data/common/reference_builder.py`) convert synthetic CSVs into canonical references (coordinate transform → 30 Hz resample → segment-normalize). Committed fixtures: `public/references/{needle-passing,peg-transfer}/*.json`.
- Calibration, pinch/rotation control, 3D tools, and evaluation are not implemented.

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
  monotonic millisecond timestamps. Shared `HandFrame` stays unchanged until A2
  derives real control values. See `docs/HAND_TRACKING.md` for the complete handoff.

## 4. Current Task Ownership
Person A - Realtime Vision and 3D Simulation:
- A1 webcam, two-hand detection, identity helper, and development preview

Person B - Data, Evaluation, Product, Tiger Data, AI and Voice:
- S0 bootstrap, B0 Tiger bootstrap, B1 skill library (merged) done; B2 reference-motion adapters done on this branch
- B3 deterministic evaluation engine next

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

## 6. In Progress
- S0 - bootstrap acceptance commands must stay green; remaining product shell dirs can grow with A1/B0
- A1 acceptance - target Mac physical-camera two-minute soak, anatomical labels,
  measured FPS/latency, React profiler, lighting/overlap and disconnect QA remain manual.
  Shared setup coordination was recorded before changing package scripts, asset
  ignore rules, the development route and Playwright's localhost origin. Person B
  subsystems and shared `src/types/` contracts were not changed by A1.
- B0 - deferred to B10/B12: continuous aggregates, vector/BM25 indexes, retention/columnstore, Tiger MCP (intentionally skipped; agents use CLI + `.env.local`)

## 7. Known Issues / Risks
- Production build remains blocked by the existing Turbopack CSS worker local-port
  restriction (`Operation not permitted`), including an escalated retry on 2026-10-17.
  Verify the normal build on an unrestricted host before release; no production success claimed.
- Full hand overlap can be ambiguous. A1 emits missing observations rather than
  manufacturing identity; restart or remove/re-show hands if initialization was incorrect.
- Synthetic browser inference verifies integration, not physical tracking accuracy or target-Mac performance.
- External dataset license and access must be confirmed before public redistribution.
- New clones need git-crypt and the securely shared existing key to unlock tracked `.env.local`; maintain a secure recovery-key backup outside the repository.

## 8. Data / Asset Status
- JIGSAWS: not yet acquired/cleared (academic-use only; adapter ready). See `docs/DATA_LICENSES.md`.
- LASK: not yet acquired (CC BY 4.0; adapter ready). See `docs/DATA_LICENSES.md`.
- SHANDS: optional future source.
- 3D assets: not yet selected.
- Hand Landmarker float16 v1 and MediaPipe 1.1.1 WASM: acquired, checksum verified;
  source/license/attribution recorded in `docs/ASSET_LICENSES.md`. Generated binaries are ignored.
- Reference motions: synthetic canonical fixtures for needle-passing and peg-transfer under `public/references/` (generated by the B2 adapters from synthetic CSVs — not real expert data).

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

Latest verification on b2 rebased on main (2026-10-17): typecheck and lint clean;
full suite passes (A1 vision, B0 database integration/health, B1 skill catalog,
B2 reference loader + adapter round-trip). DB-backed tests auto-skip without
`TIGER_DATABASE_URL`; the Python adapter test auto-skips without Python on PATH.
Production build passed in this environment; A1 previously reported the build
blocked by a Turbopack CSS-worker port restriction on a restricted host — confirm
on an unrestricted host before release.

## 11. Next Recommended Actions
1. Person A runs A1's physical-camera QA from `docs/HAND_TRACKING.md`, then begins A2 calibration/pinch/rotation/smoothing using the raw snapshot interface.
2. Person B: B2 done → B3 deterministic evaluation engine next (path/orientation metrics against the reference), then B5 full 20-metric evaluator.
3. Keep `npm run verify:ai` green after key rotation; do not start B7/B9 until B6/B8 exist.

## 12. Manual Demo Notes
- Target browser: latest Chrome on macOS.
- Development preview: `http://localhost:3000/dev/hand-tracking?debug=1`; explicit Start/Stop controls.
- No model CDN dependency during tracking. `npm run prepare:vision` needs network only when the pinned model cache is absent/invalid.
- Worker uses the classic WASM loader to match Turbopack's worker output; fallback reason is visible in debug mode.
- Stop and route/effect cleanup release the camera. Background tabs suspend inference while retaining the stream.
- Use bright frontal lighting.
- Keep both hands fully visible during calibration.
- Backup fixture mode: not implemented yet.
