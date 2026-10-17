# Steady — Surgical Motion Trainer

Hardware-free AI surgical motion trainer that uses a laptop webcam to teach precise procedural movements through expert ghost demonstrations, real-time voice coaching, motion-level evaluation, and 3D expert-versus-user replay.

## Stack

Next.js App Router · TypeScript · Tailwind · shadcn/ui · MediaPipe · React Three Fiber · Zustand · Zod · Tiger Data (`postgres`) · ElevenLabs · IndexedDB (`idb`)

## Setup

**`.env.local` is intentionally tracked and pushed with git-crypt encryption.**
Obtain the repository key securely from a maintainer, then unlock this clone:

```bash
brew install git-crypt
git-crypt unlock /absolute/path/to/repository.git-crypt-key
```

```bash
npm install
npm run dev
```

`dev` and `build` first run `prepare:vision`. The first run downloads Google's
versioned hand model (about 8 MB) and copies matching WASM assets from the installed
MediaPipe package. Subsequent runs reuse the checksum-verified model offline.
Generated model/runtime files are not committed. Deployment builds must run the
preparation step and include the resulting `public/mediapipe/` assets.

Person A's webcam preview is available during development at
[`http://localhost:3000/dev/hand-tracking?debug=1`](http://localhost:3000/dev/hand-tracking?debug=1).
Click **Start camera** to grant access; **Stop camera** releases it. The preview is
404 in production. Click **Calibrate controls**, hold both open hands still, pinch
both thumb/index pairs, then follow the workspace arrow checklist. Move one open
hand at a time left/right/up/down and hold briefly until each arrow is checked.
Completed arrows survive tracking interruptions; **Retry workspace** keeps the
earlier open/pinch measurements. Calibration needs at least three seconds of valid samples;
pose transitions and retries take additional time. The lower canvas previews
calibrated position, palm orientation, grip and tracking recovery. The 3D workspace
adds flat tweezers, a needle holder and a practice needle. Keep **Easy pickup**
enabled, open your thumb/index finger, and move a colored tip ring inside the
needle’s circle. When it turns green and says **tip aligned**, pinch to pick up;
open to release. Easy pickup locks tip depth and snaps the needle into the jaws;
turn it off for free 3D depth (this resets the scene, not calibration). Both instruments freeze if
either control becomes unavailable. A4 adds the 8-segment **Needle Passing**
exercise (`Approach -> Grip -> Align -> Entry -> Rotation -> Exit -> Release -> Complete`)
with three target rings (`ring-1`, `ring-2`, `ring-3`), a curved corridor guide,
an upper-right release ring, a lower `tissue-wall` danger zone, and **Learn / Practice / Assessment**
mode controls (Assessment hides ghost and coaching hooks). **Reset scene** restores the needle and exercise progress without
recalibrating. Debug mode includes calibrated pinch thresholds, a planar
depth fallback, and live exercise telemetry. Calibration stays in memory and must be repeated after restarting
the camera. See [`docs/HAND_TRACKING.md`](docs/HAND_TRACKING.md) for the raw and
calibrated interfaces, fallbacks, privacy details, and manual acceptance checklist.
See [`docs/SIMULATION.md`](docs/SIMULATION.md) for A3/A4 geometry, interaction,
exercise state machine, rendering interfaces and outstanding physical acceptance checks.

After unlocking, commit and push `.env.local` changes normally; git-crypt encrypts
them when staged. Keep the tracked file and its encryption rules in place. Do not
overwrite it with `.env.example` or run `git-crypt init` in an existing clone.
See [`docs/GIT_CRYPT.md`](docs/GIT_CRYPT.md) for the team and agent workflow.

Optional offline dataset tooling:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js + Turbopack |
| `npm run prepare:vision` | Prepare checksum-verified local model and matching WASM assets |
| `npm run typecheck` | TypeScript strict check |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run test:e2e` | Playwright e2e |
| `npm run build` | Production build |

## Docs

- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — canonical architecture
- [`docs/CONTEXT.md`](docs/CONTEXT.md) — living working state
- [`docs/TIGER_DATA.md`](docs/TIGER_DATA.md) — database context

Read those before coding. Work one task ID at a time.
