# Steady — Surgical Motion Trainer

Hardware-free AI surgical motion trainer that uses a laptop webcam to teach precise procedural movements through expert ghost demonstrations, real-time voice coaching, motion-level evaluation, and 3D expert-versus-user replay.

## Stack

Next.js App Router · TypeScript · Tailwind · shadcn/ui · MediaPipe · React Three Fiber · Zustand · Zod · Tiger Data (`postgres`) · ElevenLabs · IndexedDB (`idb`)

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

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
