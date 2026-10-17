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
404 in production. See [`docs/HAND_TRACKING.md`](docs/HAND_TRACKING.md) for the raw
tracking interface, fallbacks, privacy details, and manual acceptance checklist.

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
