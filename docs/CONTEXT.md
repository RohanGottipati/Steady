# Project Context

Last updated: 2026-10-17 04:35 UTC
Updated by: Person A — A1 preview review and branch handoff
Current branch: person-a/a1-hand-tracking
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

## 1. Current Working State
- Next.js App Router bootstrap complete with hackathon dependencies installed.
- A1 implementation available at `/dev/hand-tracking?debug=1` in development:
  explicit camera controls, mirrored skeleton preview, stable raw hand slots,
  ref-backed updates, GPU/CPU worker and main-thread fallback, debug diagnostics.
- Local model/WASM assets are prepared before dev/build; cached assets support offline use.
- Person A reviewed the tracking preview and reported it looks good (2026-10-17).
  This records preview approval; the formal soak/performance checklist is still pending.
- Calibration, pinch/rotation control, 3D tools, library/training flow, and evaluation are not implemented.

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
- A1 implementation - local asset preparation, camera lifecycle, hand identities,
  worker/fallback inference, development preview, regression tests and documentation.
  Preview reviewed/approved by Person A on 2026-10-17. Formal physical-camera
  acceptance remains pending; this does not complete M1.

## 6. In Progress
- S0 - bootstrap acceptance commands must stay green; remaining product shell dirs can grow with A1/B0
- A1 acceptance - target Mac physical-camera two-minute soak, anatomical labels,
  measured FPS/latency, React profiler, lighting/overlap and disconnect QA remain manual.
  Shared setup coordination was recorded before changing package scripts, asset
  ignore rules, the development route and Playwright's localhost origin. Person B
  subsystems and shared `src/types/` contracts were not changed.

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
- JIGSAWS: not yet acquired/cleared.
- LASK: not yet acquired.
- SHANDS: optional future source.
- 3D assets: not yet selected.
- Hand Landmarker float16 v1 and MediaPipe 1.1.1 WASM: acquired, checksum verified;
  source/license/attribution recorded in `docs/ASSET_LICENSES.md`. Generated binaries are ignored.
- Reference motions: none yet.

## 9. External Service Status
- Tiger Cloud service created: no
- Tiger DB migrations current: no
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): no
- Tiger MCP configured for coding agents: no
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

Latest verification (2026-10-17): typecheck and lint passed; unit tests passed
(8 files, 45 tests). Four Chromium browser tests passed, including actual local
MediaPipe worker inference with a synthetic camera, continued inference offline,
and actual main-thread fallback. Cached asset preparation passed. Regression
coverage includes Strict Mode and Activity page-cache cleanup/resume, permission
cancellation, late initialization/inference, capture timeouts, identity loss and
crossings, and animation-frame fallback. Normal production build is still blocked
by Turbopack's CSS worker port-binding restriction, including an escalated retry.

## 11. Next Recommended Actions
1. Person A runs A1's physical-camera QA from `docs/HAND_TRACKING.md`, then begins A2 calibration/pinch/rotation/smoothing using the raw snapshot interface.
2. Person B completes B0 Tiger Data bootstrap once `TIGER_DATABASE_URL` is set, then B1/B2.
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
