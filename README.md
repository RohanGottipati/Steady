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

## Run locally

Use a supported Node.js version for the installed Next.js release (Node 20.9 or newer) and npm. Current Chrome on a Mac is the primary webcam-training target. Camera access requires localhost or HTTPS; the 3D view requires WebGL.

This repository intentionally tracks `.env.local` encrypted with git-crypt. Obtain the existing repository key securely from a maintainer and unlock your clone:

```bash
brew install git-crypt
git-crypt unlock /absolute/path/to/repository.git-crypt-key
npm ci
npm run dev
```

Do not overwrite the tracked environment file, print its secrets, or initialize a new git-crypt repository. See [the encryption workflow](docs/GIT_CRYPT.md). `.env.example` documents configuration names.

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

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server with Webpack |
| `npm run prepare:vision` | Prepare the verified hand model and local runtime assets |
| `npm run typecheck` | Check TypeScript |
| `npm run lint` | Run ESLint |
| `npm test` | Run the offline unit suite |
| `npm run test:e2e` | Run Chromium browser acceptance with live services disabled |
| `npm run build` | Build the production application |
| `npm start` | Serve the production build |
| `npm run test:live` | Opt-in scoped database and provider smoke checks |
| `npm run test:db` | Isolated-database integration suite; applies migrations and seeds |
| `npm run verify:ai` | Check provider model/voice configuration and request a speech sample |
| `npm run demo:record` | Record the camera-free backup walkthrough |
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

The UI integration passes the production build, TypeScript, ESLint, 464 offline tests, all 27 development browser scenarios across an initial run and focused reruns, and two production route/replay checks. The scoped live smoke verified Tiger persistence/progress/deletion, Backboard review generation, and ElevenLabs audio. A single complete browser-suite rerun after the last fixes and physical webcam/audio/performance sign-off remain outstanding; see the runbook for exact evidence.

## Architecture and documentation

Next.js App Router · React · TypeScript · Tailwind · MediaPipe · React Three Fiber / Three.js · Zod · IndexedDB · Tiger Data · Backboard · ElevenLabs.

- [Current engineering state](docs/CONTEXT.md)
- [Architecture and implementation roadmap](docs/IMPLEMENTATION_PLAN.md)
- [Hand tracking and calibration](docs/HAND_TRACKING.md)
- [Simulation and replay contracts](docs/SIMULATION.md)
- [Database architecture](docs/TIGER_DATA.md)
- [Demo and physical acceptance checklist](docs/DEMO_RUNBOOK.md)
- [Asset attribution](docs/ASSET_LICENSES.md) and [reference-data licensing](docs/DATA_LICENSES.md)
- [Design decisions](docs/DECISIONS.md)

Automated camera fixtures do not certify physical hand tracking, audio output, or target-device performance. The demo runbook records those checks separately from automated acceptance.
