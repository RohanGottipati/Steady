# Steady

Steady is a webcam-controlled surgical motion simulator. Practice precise instrument movements with your laptop camera, follow a reference ghost, receive coaching, and compare your recorded movement with the guide in a 3D replay.

The application is for simulation practice. Its scores describe motion in the simulator; they do not certify clinical competence or predict patient outcomes.

## What you can do

- **Train Needle Passing and Peg Transfer** in a procedural 3D operating room.
- Choose **Learn**, **Practice**, or **Assessment**. Learn demonstrates the movement first; Practice offers optional guidance; Assessment hides guides and live coaching.
- Use guided hand calibration or the one-hand quick start. Pinch to grasp and move/rotate your hand to control an instrument.
- Review an overall score, five categories, all 20 deterministic metrics, and the largest recorded differences.
- Scrub, slow down, and orbit a 3D replay comparing your motion with the canonical guide.
- Track synced attempts through per-skill summaries and recent score charts.
- Preview the authored **Suturing** and **Knot Tying** blueprints. Their trainer scenes are upcoming.

Scoring uses canonical synthetic guides. The optional JIGSAWS Needle Passing demonstration changes the displayed ghost, not the scoring reference. Peg Transfer uses an authored synthetic reference; LASK recordings are not included.

## Try it

Open `/library`, select a skill, and choose a mode. Start the camera explicitly, then follow calibration. Keep your hands naturally above the desk, palms mostly down and slightly inward. The camera preview stays visible while you train.

For a camera-free demonstration, select **Play a sample pass**, or open:

- `/train/needle-passing?fixture=needle-pass-good`
- `/train/needle-passing?fixture=needle-pass-late-rotation`
- `/train/peg-transfer?fixture=peg-transfer-good`

Samples run through the real simulation and evaluation engine. They are labelled synthetic, excluded from saved history, and do not call live review, speech, or upload services. `?fixture=off` selects webcam training even when the environment defaults to demonstrations.

Results appear when the exercise finishes. **Try again** retains calibration; **Replay latest attempt** opens the completed comparison. Stopping the camera preserves a finished result. Restarting the camera requires calibration again.

## Tech stack

Next.js 16 (App Router, Webpack builds) · React 19 · TypeScript · Tailwind CSS 4 · MediaPipe Tasks Vision (hand landmarks, in a Web Worker) · React Three Fiber / Drei / Three.js · Zod · IndexedDB (`idb`) · Postgres on Tiger Data (`postgres`) · Backboard (Gemini) · ElevenLabs · Vitest (jsdom) · Playwright.

## Project structure

```text
src/
  app/            Routes: / (landing), /library, /train/[skillId], /progress, /notices,
                  development-only /dev/*, and API routes under /api/*
  components/     Camera, scene (R3F room, targets, replay), training session, product UI
  lib/            vision (tracking/calibration), exercise runtime, evaluation metrics,
                  simulation/replay, coaching, ai (review), voice, db, storage, reliability
  workers/        Hand-tracking Web Worker
  data/, types/   Skill definitions, scene layout, shared Zod schemas
db/               SQL migrations and seeds for Tiger Data
public/           Coach audio clips, reference motions, anatomy model, MediaPipe notices
scripts/          Vision setup, DB migrate/seed, provider checks, demo recording,
                  coach-clip and asset generation, offline dataset adapters (Python)
tests/            Vitest unit suite (tests/unit) and Playwright browser suite (tests/e2e)
docs/             Engineering context, architecture plan, subsystem notes, licences
```

## Run locally

### Prerequisites

- Node.js 20.9 or newer (required by the installed Next.js release) and npm.
- A browser with WebGL; current Chrome on a Mac is the primary webcam-training target. Camera access requires localhost or HTTPS.
- Optional: `git-crypt` and the repository key to unlock the tracked `.env.local`; Python 3 with `requirements.txt` only for the offline dataset adapters in `scripts/data/`.

### Setup

This repository intentionally tracks `.env.local` encrypted with git-crypt. Obtain the existing repository key securely from a maintainer and unlock your clone:

```bash
brew install git-crypt
git-crypt unlock /absolute/path/to/repository.git-crypt-key
npm ci
npm run dev
```

Do not overwrite the tracked environment file, print its secrets, or initialize a new git-crypt repository. See [the encryption workflow](docs/GIT_CRYPT.md). `.env.example` documents configuration names.

Without the key, `npm ci`, `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` still work; provider-backed features (cloud sync, model review, server speech) are unavailable and fall back as described below.

The development server runs at `http://localhost:3000`. Before development and builds, `prepare:vision` verifies the local hand model and copies matching MediaPipe WASM assets. Its first run downloads the versioned model; later runs reuse the verified cache. Deployment builds must include the generated `public/mediapipe/` assets.

Development and production builds use **Webpack**. `npm run dev:turbo` is the optional Turbopack path.

## Data, privacy, and optional services

Raw camera video and hand landmarks remain in the browser. Completed webcam attempts save tool telemetry and results to IndexedDB, retaining the newest 20 attempts on the device. Restricted storage falls back to the current tab's memory and displays the limitation.

| Service | Role | Behavior when unavailable |
| --- | --- | --- |
| Tiger Data | Anonymous attempt storage, progress, search, similarity, and analytics | Local training/results remain available; progress shows an unavailable notice |
| Backboard / Gemini | Explanation of measured results | Deterministic review notes remain available |
| ElevenLabs | Live coaching and replay narration | Committed clips and browser speech provide fallbacks |

Provider credentials stay server-side. Public feature flags control cloud sync, review, voice, and default sample mode. Server speech also requires `SPEECH_ENABLED=true`. See `.env.example` for the complete configuration reference.

`/progress` shows synced history for this browser's anonymous identifier. Global totals cover all synced attempts; charts show the latest 20 attempts per skill, oldest to newest. Category bars show all-history averages. This is device-scoped anonymous identity, not an account or authentication system.

**Delete my attempt history** deletes that identifier's cloud history and clears local copies. Uploads are paused during deletion. If cleanup cannot finish, the UI reports it and automatic uploads remain paused until deletion is retried successfully.

Replay geometry and the exact adapted comparison package remain in memory for the active session. Saved tool telemetry does not provide a historical replay-navigation screen after reload.

## Environment variables

Names and purpose only; see `.env.example`. Server-only values must never be exposed client-side.

| Variable | Purpose |
| --- | --- |
| `TIGER_DATABASE_URL`, `TIGER_DATABASE_SSL` | Postgres connection for attempt storage, progress, search and analytics (server only) |
| `TIGER_PROJECT_ID`, `TIGER_SERVICE_ID` | Optional Tiger Cloud development metadata |
| `BACKBOARD_API_KEY`, `BACKBOARD_MODEL_PROVIDER`, `BACKBOARD_MODEL_NAME` | Model review of measured results (server only) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL` | Coaching and narration speech (server only) |
| `SPEECH_ENABLED` | Must be `true` to enable the `/api/speech` route |
| `SPEECH_RATE_LIMIT`, `SPEECH_RATE_WINDOW_MS` | Optional speech-route rate limit (defaults 20 requests per 60 000 ms) |
| `NEXT_PUBLIC_ENABLE_AI_REVIEW`, `NEXT_PUBLIC_ENABLE_VOICE`, `NEXT_PUBLIC_ENABLE_CLOUD_SYNC` | Public feature flags |
| `NEXT_PUBLIC_DEMO_FIXTURE_MODE` | Default to camera-free sample passes |
| `NEXT_PUBLIC_DEBUG_DEFAULT` | Enable diagnostics by default |
| `NEXT_PUBLIC_SURGICAL_POSTURE_MAPPING` | Palms-down mapping; `false` selects the legacy fallback |

Test-only switches: `STEADY_TIGER_INTEGRATION` (`test:db`), `STEADY_LIVE_TEST` / `STEADY_LIVE_BASE_URL` (`test:live`), `PLAYWRIGHT_PORT` / `PLAYWRIGHT_PRODUCTION` (browser suite).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server with Webpack |
| `npm run dev:turbo` | Optional Turbopack development server |
| `npm run prepare:vision` | Prepare the verified hand model and local runtime assets |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Run ESLint |
| `npm test` | Run the offline unit suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run Chromium browser acceptance with live services disabled |
| `npm run build` | Build the production application |
| `npm start` | Serve the production build |
| `npm run test:live` | Opt-in scoped database and provider smoke checks |
| `npm run test:db` | Isolated-database integration suite; applies migrations and seeds |
| `npm run verify:ai` | Check provider model/voice configuration and request a speech sample |
| `npm run demo:record` | Record the camera-free backup walkthrough |
| `npm run audio:coach` | Regenerate the committed coach clips with ElevenLabs |
| `npm run db:migrate` / `npm run db:seed` | Explicit database provisioning operations |

Run typecheck after a build completes, rather than concurrently: builds regenerate the Next.js type directory. Browser tests use a separate `.next-e2e` build directory and can use `PLAYWRIGHT_PORT` to avoid an existing server.

For scoped live acceptance, start the app with its configured server credentials, then run:

```bash
STEADY_LIVE_TEST=1 STEADY_LIVE_BASE_URL=http://localhost:3000 npm run test:live
```

This creates a fresh anonymous test user, uploads synthetic score records, checks duplicate retry/progress/ownership, requests one actual model review and speech clip, and deletes only that user's history. It never runs migrations or shared seeds. It writes its report and audio under ignored `artifacts/acceptance/`. Run `test:db` only against a separate test database.

## Troubleshooting

- **Camera denied:** grant browser permission, retry the camera, or use a sample pass.
- **Hands stop controlling instruments:** bring the active hands into view; use the calibration panel to check readiness or recalibrate. Complete overlap and edge-on poses can defeat tracking.
- **Depth or pickup is difficult:** keep Easy pickup enabled; one-hand quick start is available for the simplified workflow.
- **3D rendering is slow:** enable Reduced graphics. Live training keeps the camera fixed; replay allows constrained orbiting.
- **Cloud or provider outage:** finish the attempt locally. Read the save/sync status before retrying. Progress does not replace unavailable cloud data with invented history.
- **Debugging:** `?debug=1` exposes diagnostics; `/dev/hand-tracking?debug=1` is development-only.

## Verification status

The current tree passes the production build, TypeScript, ESLint and the offline unit suite (488 tests; 14 opt-in database tests skipped without a test database). The UI integration also passed all 27 development browser scenarios across an initial run and focused reruns, and two production route/replay checks. The scoped live smoke verified Tiger persistence/progress/deletion, Backboard review generation, and ElevenLabs audio. A single complete browser-suite rerun after the last fixes and physical webcam/audio/performance sign-off remain outstanding; see the runbook for exact evidence.

## Documentation

- [Current engineering state](docs/CONTEXT.md)
- [Architecture and implementation roadmap](docs/IMPLEMENTATION_PLAN.md)
- [Hand tracking and calibration](docs/HAND_TRACKING.md)
- [Simulation and replay contracts](docs/SIMULATION.md)
- [Database architecture](docs/TIGER_DATA.md)
- [Demo and physical acceptance checklist](docs/DEMO_RUNBOOK.md)
- [Asset attribution](docs/ASSET_LICENSES.md) and [reference-data licensing](docs/DATA_LICENSES.md)
- [Design decisions](docs/DECISIONS.md)
- [git-crypt environment workflow](docs/GIT_CRYPT.md)

Automated camera fixtures do not certify physical hand tracking, audio output, or target-device performance. The demo runbook records those checks separately from automated acceptance.
