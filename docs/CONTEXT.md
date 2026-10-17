# Project Context

Last updated: 2026-10-16 23:40
Updated by: context merge (agent operating rules + dependency bootstrap)
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
- Add current TypeScript contract notes here.
- Data schema version: 1.

## 4. Current Task Ownership
Person A - Realtime Vision and 3D Simulation:
- S0 shared bootstrap

Person B - Data, Evaluation, Product, Tiger Data, AI and Voice:
- S0 shared bootstrap
- B0 Tiger Data bootstrap follows immediately after S0

## 5. Completed Tasks
- Partial S0 - repository structure and docs seeded
- Partial S0 - Next.js, Tailwind, shadcn/ui, MediaPipe, R3F, Zustand, Zod, postgres, ElevenLabs, Vitest, Playwright installed

## 6. In Progress
- S0 - shared TypeScript contracts and remaining bootstrap acceptance still open

## 7. Known Issues / Risks
- External dataset license and access must be confirmed before public redistribution.

## 8. Data / Asset Status
- JIGSAWS: not yet acquired/cleared.
- LASK: not yet acquired.
- SHANDS: optional future source.
- 3D assets: not yet selected.
- Reference motions: none yet.

## 9. External Service Status
- Tiger Cloud service created: no
- Tiger DB migrations current: no
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): no
- Tiger MCP configured for coding agents: no
- Tiger cloud sync smoke test: not-run
- Tiger optional fork workflow available: unknown
- Backboard model ID verified: no
- ElevenLabs voice ID configured: no
- Vercel env configured: no

## 10. Commands That Must Pass
- npm run typecheck
- npm run lint
- npm test
- npm run build

## 11. Next Recommended Actions
1. Finish S0 repository bootstrap.
2. Person A begins A1 webcam and hand tracking.
3. Person B completes B0 Tiger Data bootstrap, then begins B1/B2.

## 12. Manual Demo Notes
- Target browser: latest Chrome on macOS.
- Use bright frontal lighting.
- Keep both hands fully visible during calibration.
- Backup fixture mode: not implemented yet.
