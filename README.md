# Steady — Surgical Motion Trainer

Hardware-free AI surgical motion trainer that uses a laptop webcam to teach precise procedural movements through expert ghost demonstrations, real-time voice coaching, motion-level evaluation, and 3D expert-versus-user replay.

## Current training and replay workflow (S1/A6)

Open `/library`, choose **Needle Passing**, then select Learn, Practice, or Assessment.
Start the camera explicitly and calibrate, or use **1-Hand Quick Start** after starting
it, holding one open hand still briefly to establish its neutral wrist pose. Learn
shows a ghost demonstration before the active attempt. Pass the needle
through Rings 1 → 2 → 3, then open inside the release ring. Results appear on the
same page: overall score, five categories, strongest/weakest metrics, deviation
markers, and expandable detail for all 20 deterministic metrics. **Try again** resets
the attempt while retaining camera calibration; stopping the camera retains a finished
result. Restarting the camera requires calibration again.

For a camera-free demonstration, select **Run Demo Fixture** or open:

- `/train/needle-passing?fixture=needle-pass-good`
- `/train/needle-passing?fixture=needle-pass-late-rotation`

Both animate through the actual simulation and exercise engine. Learn includes its
three-second demonstration. The perturbed pass scores worse than the clean pass.
Demo results are labelled and excluded from saved history. `?fixture=off` overrides
`NEXT_PUBLIC_DEMO_FIXTURE_MODE=true` when switching back to the camera.

After completing either kind of attempt, select **Replay latest attempt**. Solid
cyan/amber tools show your recorded movement; translucent lavender tools show the
same canonical reference used for scoring, adapted for your working hand. Replay
works after stopping the camera. It opens paused three seconds before the first
successful needle pickup, or at the beginning if there is less lead-in or no pickup.
The full recording remains available for scrubbing and scoring.
Play/pause, scrub, change speed (0.25x/0.5x/1x),
switch between synchronized comparison and original recorded timing, or jump to
an issue. Optional smoothing changes only the display. Original timing excludes
tracking suspensions, just like the recording clock. **Back to training** starts
a fresh exercise; the latest completed replay remains available until replaced
by a newer completed attempt or the page is reloaded. Needle pose/visibility and
the exact adapted reference are memory-only; saved history still contains tool
motion. See [the replay handoff](docs/SIMULATION.md#a6-recording-and-replay-handoff).

Webcam attempts save asynchronously to IndexedDB on this device (newest 20). Results
remain available in memory if storage is restricted or full; the save message tells
you which applies. Reload retrieval is available through the local cache interface;
a history/results navigation screen belongs to the later results task. No attempt
upload runs in S1. Raw video stays in the browser; saved replay data contains tool
telemetry without raw hand landmarks. Optional `?debug=1` exposes numerical
diagnostics and the result object.

Live coaching is deterministic text with recorded events. Assessment hides the ghost,
path guide, and coaching. Scoring always uses the unsmoothed canonical synthetic scene
guide; choosing the optional JIGSAWS ghost changes the demonstration only. AI review,
audio, a dedicated results/history screen, and cloud synchronization remain scheduled work.

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
mode controls (Assessment hides ghost and coaching hooks). A5 adds the translucent
**Ghost renderer** with reference tool-tip path trails, smooth sub-frame `lerp`/`slerp`
interpolation, **0.5x / 1x** playback speeds, **Progress-coupled / Continuous** sync
modes, and runtime switching between the canonical synthetic reference and the
workspace-fitted JIGSAWS `Needle_Passing_E005` expert trial. **Reset scene** restores the needle, exercise progress, and ghost playback without
recalibrating. Debug mode includes calibrated pinch thresholds, a planar
depth fallback, and live exercise/ghost telemetry. Calibration stays in memory and must be repeated after restarting
the camera. See [`docs/HAND_TRACKING.md`](docs/HAND_TRACKING.md) for the raw and
calibrated interfaces, fallbacks, privacy details, and manual acceptance checklist.
See [`docs/SIMULATION.md`](docs/SIMULATION.md) for A3/A4/A5 geometry, interaction,
exercise state machine, ghost playback, rendering interfaces and outstanding physical acceptance checks.

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
