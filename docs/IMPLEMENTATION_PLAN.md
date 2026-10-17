# Surgical Motion Trainer
## AI-Optimized Implementation Plan

**Project type:** Hack the Valley healthcare training prototype  
**Team size:** 2 people  
**Primary development platform:** macOS, latest Chrome  
**Document purpose:** Canonical implementation reference for human developers and AI coding assistants  
**Last updated:** 2026-10-17

---

# 0. READ THIS FIRST - RULES FOR EVERY AI ASSISTANT

This document is the architectural source of truth for the project. Any AI assistant writing code for this repository must follow these rules before modifying anything.

1. **Read this implementation plan and `docs/CONTEXT.md` before coding.**
2. **Create `docs/CONTEXT.md` immediately if it does not exist.** Use the template in Section 4 of this document.
3. Work on **one task ID at a time** from the execution plan. Do not opportunistically refactor unrelated files.
4. Respect file ownership boundaries. If a task requires modifying another person's owned subsystem, stop and document the requested interface change in `docs/CONTEXT.md` before editing.
5. Shared contracts in `src/types/` are stable interfaces. Do not silently change them. Any contract change must be reflected in:
   - all direct consumers,
   - unit tests,
   - this document if the architecture changes,
   - `docs/CONTEXT.md`.
6. Keep geometry, scoring, and exercise completion deterministic. **Generative AI must not determine whether a surgical movement is correct.** AI explains measurements produced by the deterministic engine.
7. Keep webcam video local to the browser by default. Do not upload raw camera frames to Backboard, Gemini, or ElevenLabs.
8. Do not claim clinical competence, certification, diagnosis, or patient-safety validation. This is an educational simulation prototype.
9. After every completed task:
   - run relevant tests,
   - run `npm run typecheck`,
   - run `npm run lint`,
   - update `docs/CONTEXT.md`,
   - commit using the task ID, for example `A3: add calibrated hand-to-tool mapping`.
10. If a feature is failing near a milestone, use the defined fallback instead of rewriting the system from scratch.
11. Preserve demo reliability over theoretical sophistication.
12. Do not add new dependencies unless the task cannot reasonably be completed with the existing stack.

**Required start-of-task response from an AI assistant:**

```text
Task: <TASK_ID>
Goal: <one sentence>
Files I will own/edit: <list>
Dependencies I am assuming: <list>
Acceptance criteria I will verify: <list>
```

**Required end-of-task response from an AI assistant:**

```text
Completed: <TASK_ID>
Files changed: <list>
Tests run: <commands + result>
Context updated: yes/no
Known issues: <list or none>
Next dependency unblocked: <task ID(s)>
```

---

# 1. PRODUCT DEFINITION

## 1.1 One-line pitch

A hardware-free AI surgical motion trainer that uses a laptop webcam to teach precise procedural movements through expert ghost demonstrations, real-time voice coaching, motion-level evaluation, and 3D expert-versus-user replay.

## 1.2 User promise

The user should need only:

- a laptop,
- a webcam,
- their hands.

No VR headset, motion controller, external sensor, or physical surgical instrument is required for the core experience.

## 1.3 Core user flow

1. User opens the **Surgical Skills Library**.
2. User chooses a skill such as:
   - Needle Passing
   - Suturing
   - Knot Tying
   - Peg Transfer
3. User chooses a mode:
   - **Learn:** ghost visible continuously, full voice coaching.
   - **Practice:** ghost available on demand, limited coaching.
   - **Assessment:** no ghost or live coaching, full evaluation afterward.
4. User grants webcam access and performs a short calibration.
5. MediaPipe detects both hands and maps their motion to two virtual surgical instruments.
6. In Learn mode, a translucent expert reference performs the movement in the 3D scene.
7. User performs the movement while deterministic rules generate coaching events.
8. ElevenLabs speaks selected coaching messages.
9. The app records the attempt and calculates a performance vector.
10. The app replays the expert and user attempts together in 3D.
11. Backboard + Gemini 2.5 Flash converts the metrics into a concise personalized explanation.
12. ElevenLabs narrates the final review.
13. The attempt is persisted to Tiger Data for longitudinal progress, analytics, similarity search, and replay retrieval; IndexedDB keeps a local/offline copy as a fallback.

## 1.4 Expanded product scope

The application should feel like a small platform, not one hard-coded scene.

### Initial Surgical Skills Library

| Skill | Initial reference source | Status target |
|---|---|---|
| Needle Passing | JIGSAWS if licensing gate is cleared; otherwise internal reference recorder | P0/P1 |
| Suturing | JIGSAWS if licensing gate is cleared | P1 |
| Knot Tying | JIGSAWS if licensing gate is cleared | P1 |
| Peg Transfer | LASK (CC BY 4.0) | P1 |

### Procedure pathways

Do not pretend to simulate a complete surgery unless the data supports it. Instead, create pathways that group validated skills.

Examples:

- **Suturing Fundamentals**
  - Needle Passing
  - Suturing
  - Knot Tying
- **Laparoscopic Fundamentals**
  - Instrument Navigation
  - Peg Transfer
  - Bimanual Coordination

A future procedure card can show which individual skills are relevant to that procedure without claiming the app reproduces the entire procedure accurately.

## 1.5 Product differentiator

The product is not primarily asking:

> Did the user complete the simulated procedure?

It is asking:

> How did the user's physical motion differ from an expert reference?

The key technical story is:

```text
Webcam hand motion
    -> virtual instrument motion
    -> time-aligned expert comparison
    -> deterministic kinematic metrics
    -> visual 3D replay
    -> AI explanation
```

---

# 2. SCOPE, PRIORITY, AND NON-GOALS

## 2.1 Priority tiers

### P0 - Demo-critical

The project is demo-ready when all P0 items work for one skill.

- Laptop webcam hand tracking
- Stable left/right hand identity
- Pinch-to-grab/release
- Constrained 3D instrument movement
- Smooth position and wrist orientation
- One complete Needle Passing or Peg Transfer exercise
- One expert reference motion
- Ghost playback
- Deterministic live coaching events
- Motion recording
- Core performance metrics
- Expert-versus-user replay
- Backboard review
- ElevenLabs narration
- Results page
- Fixture/demo fallback

### P1 - Expanded hackathon platform

- Surgical Skills Library
- Learn / Practice / Assessment modes
- Needle Passing, Suturing, Knot Tying, Peg Transfer cards
- Additional validated reference motions where permitted
- Full 20-dimensional metric vector
- Progress history
- Adaptive display of ghost/help level
- Improved expert envelope from multiple reference attempts
- Better replay timeline and worst-moment markers

### P2 - Stretch

- Instructor reference recorder exposed as a polished feature
- Conversational replay coach
- Procedure pathways
- Cloud account/database
- Automated video ingestion
- Custom-trained surgical error classifier

## 2.2 Non-goals

Do not spend critical-path time on:

- realistic tissue deformation,
- blood simulation,
- cutting physics,
- full patient diagnosis,
- conversational patient simulation,
- free-roam operating room navigation,
- clinical certification,
- automatic medical credential assessment,
- training large custom ML models during the hackathon,
- arbitrary internet surgical video to 3D conversion,
- perfect physical force simulation.

---

# 3. TECH STACK

## 3.1 Runtime stack

### Web application

- Next.js App Router
- React
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui
- Zustand
- Zod

### Computer vision

- Browser `getUserMedia()`
- MediaPipe `@mediapipe/tasks-vision`
- Hand Landmarker
- Web Worker target architecture
- `requestVideoFrameCallback()` where available

### 3D

- Three.js
- React Three Fiber
- Drei
- GLB/glTF assets
- `gltfjsx` for React component generation when useful
- `@gltf-transform/cli` for optimization when needed

No Blender is required.

### Motion engine

- Custom TypeScript
- Three.js `Vector3`, `Quaternion`, matrices
- One Euro filter for live motion
- `lerp` for position
- `slerp` for rotation
- Centered moving-average or Savitzky-Golay-style offline smoothing for reference/replay
- Segment-based resampling
- Optional DTW after the baseline comparator works

### AI review

- Backboard REST API
- Provider: Google
- Target model: Gemini 2.5 Flash
- Exact Backboard model name must be verified through `GET /api/models` at setup time
- JSON output mode
- Memory off for default attempt review

### Voice

- ElevenLabs
- Low-latency default: `eleven_flash_v2_5`
- Common coaching clips pre-generated once
- Dynamic TTS for final review and rare specific feedback

### Persistence and analytics

Tiger Data is the canonical server-side persistence and analytics layer.

- Tiger Cloud PostgreSQL
- TimescaleDB hypertables for high-frequency motion and metric telemetry
- Hypercore row/column storage for efficient recent writes and historical analytical reads
- Continuous aggregates for progress dashboards and cohort/skill rollups
- TimescaleDB Toolkit hyperfunctions for percentiles, time-weighted metrics, state timing, and downsampled visualizations
- `pgvector` + `pgvectorscale` StreamingDiskANN for similarity search over the 20-dimensional performance vectors
- `pg_textsearch` BM25 for skill-library and coaching-knowledge search
- Background jobs and policies for aggregate refresh, columnstore conversion, and retention
- Tiger MCP + Tiger CLI for AI-assisted schema design, migrations, query tuning, and safe database workflows
- Tiger Cloud data forks for isolated migration/query experiments when the account plan supports them

Client fallback:

- IndexedDB via `idb` for current-session/offline attempt caching
- `localStorage` only for settings and small preferences

Do **not** use Supabase. Tiger Data is the single cloud database for the project.

### Offline data preprocessing

- Python 3
- NumPy
- pandas

Python is only for converting expert datasets into the app's canonical reference format. The production application remains TypeScript.

## 3.2 Recommended install

```bash
npx create-next-app@latest surgical-motion-trainer --typescript --tailwind --eslint --app
cd surgical-motion-trainer

npm install \
  three \
  @react-three/fiber \
  @react-three/drei \
  @mediapipe/tasks-vision \
  zustand \
  zod \
  idb \
  postgres \
  @elevenlabs/elevenlabs-js

npm install -D \
  vitest \
  @playwright/test \
  @types/three \
  @gltf-transform/cli
```

Optional development-only tuning tool:

```bash
npm install -D leva
```

## 3.3 Environment variables

```bash
# Tiger Data - server only
TIGER_DATABASE_URL=
TIGER_DATABASE_SSL=require

# Optional Tiger Cloud development metadata; never expose credentials client-side
TIGER_PROJECT_ID=
TIGER_SERVICE_ID=

# Backboard - server only
BACKBOARD_API_KEY=
BACKBOARD_MODEL_PROVIDER=google
BACKBOARD_MODEL_NAME=gemini-2.5-flash

# ElevenLabs - server only
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5

# Public non-secret feature flags
NEXT_PUBLIC_DEBUG_DEFAULT=false
NEXT_PUBLIC_ENABLE_AI_REVIEW=true
NEXT_PUBLIC_ENABLE_VOICE=true
NEXT_PUBLIC_ENABLE_CLOUD_SYNC=true
NEXT_PUBLIC_DEMO_FIXTURE_MODE=false
```

Do not expose `TIGER_DATABASE_URL`, `BACKBOARD_API_KEY`, or `ELEVENLABS_API_KEY` through `NEXT_PUBLIC_*` variables.

## 3.4 Tiger Data architecture - required, not decorative

Tiger Data is a core product subsystem, not a sponsor badge. Use Tiger features only where they improve the product or engineering workflow.

### Feature-to-product map

| Tiger Data feature | Genuine project use |
|---|---|
| PostgreSQL | Canonical relational store for skills, attempts, reviews, references, and user/session metadata |
| TimescaleDB hypertables | Store 20-30 Hz attempt motion/metric telemetry and timestamped coaching events |
| Hypercore / columnstore | Compress older telemetry while keeping it queryable for replay/history analytics |
| Continuous aggregates | Precompute progress trends, per-skill summaries, and population benchmarks |
| Hyperfunctions | `time_bucket`, `percentile_agg`, `time_weight`, state tracking, LTTB/ASAP downsampling for motion analytics |
| pgvector | Store each attempt's 20-dimensional performance vector as `vector(20)` |
| pgvectorscale / StreamingDiskANN | Retrieve similar historical attempts and recurring weakness patterns efficiently |
| pg_textsearch BM25 | Search surgical skills, lesson instructions, error explanations, and source notes without a separate search service |
| Retention policies | Expire raw high-frequency telemetry while preserving attempt summaries/aggregates |
| Background jobs | Automate cleanup, derived-summary refresh, and optional post-attempt maintenance |
| Tiered storage | Optional for old raw telemetry if the Tiger plan supports it; never a demo dependency |
| UUIDv7 | Time-sortable IDs for attempts/events on PostgreSQL 18 |
| Tiger MCP / pg-aiguide | Give coding agents current Postgres/Timescale guidance and controlled database access |
| Tiger Cloud data forks | Let AI assistants and the two developers test migrations/query changes on isolated copies when available |
| Backups/PITR/HA | Managed operational safety when the selected Tiger plan provides them; no custom implementation needed |

### Product data flow

```text
Live browser session
    |
    +-> raw webcam frames stay local
    |
    +-> local deterministic evaluator computes motion/tool telemetry
            |
            +-> current attempt cached in IndexedDB
            |
            +-> after attempt, batch upload compact motion + metric samples
                     |
                     v
                  Tiger Data
                     |
        +------------+-------------+------------------+
        |                          |                  |
        v                          v                  v
   Hypertables               attempt vector      lesson/search docs
 motion + metrics             vector(20)             text
        |                          |                  |
        v                          v                  v
continuous aggregates      pgvectorscale          BM25
+ hyperfunctions           similar attempts       retrieval
        |                          |                  |
        +-------------+------------+------------------+
                      |
                      v
              progress/results API
                      |
                      +-> Backboard/Gemini gets only grounded
                          metrics + retrieved coaching context
```

### Non-negotiable database rules

1. Never send raw webcam video to Tiger Data.
2. Upload compact numerical telemetry only after or in bounded batches during an attempt.
3. A database outage must not break the active training attempt; IndexedDB is the offline buffer/fallback.
4. The local deterministic evaluator remains the source of truth for the immediate score.
5. Tiger Data powers persistence, longitudinal analytics, retrieval, benchmarking, and similarity search.
6. Backboard/Gemini may consume data retrieved from Tiger Data but may not write authoritative scores.
7. All database access is server-side through Next.js Route Handlers; the browser never receives database credentials.
8. Use raw SQL migrations for Timescale/Tiger-specific features rather than hiding them behind an ORM abstraction.
9. Any AI coding assistant changing database schema must use a fork or development service when available, run the migration, run smoke queries, and record the result in `docs/CONTEXT.md`.
10. Paid-plan-only features such as tiered storage or connection pooling are optional enhancements. Core demo behavior must work on a Tiger free service.

### Cost/plan design constraint

Tiger Cloud free services include PostgreSQL with TimescaleDB and vector extensions but omit some managed features such as connection pooling, replication, data tiering, exporters, and service metrics. Therefore:

- build P0/P1 around PostgreSQL, hypertables, continuous aggregates, hyperfunctions, vector extensions, BM25 search, and standard SQL;
- treat tiered storage, data forks, and managed pooling as optional if the hackathon account/credits expose them;
- never make the live demo depend on a paid-only cloud feature.

---

# 4. REQUIRED LIVING CONTEXT DOCUMENT

## 4.1 Purpose

AI assistants lose practical state between coding sessions. The repository must therefore maintain a concise, current, machine-readable handoff document at:

```text
docs/CONTEXT.md
```

This file is required from the first commit onward.

It is the canonical description of **what currently works**, **what is in progress**, **which contracts are active**, and **what should be done next**.

It should not become a full diary. Git is the history. `CONTEXT.md` is the current state.

## 4.2 Update rules

Every AI assistant must:

1. Read `docs/CONTEXT.md` before starting a task.
2. Update it after a meaningful task is complete.
3. Remove or rewrite stale statements rather than endlessly appending.
4. Keep the "Current Working State" section accurate.
5. Record interface changes before another subsystem consumes them.
6. Record known demo-breaking issues prominently.
7. Record any dataset/license uncertainty.
8. Record any required manual setup that cannot be automated.
9. Keep the document under roughly 5,000-7,000 words. If it grows larger, compress old details.

## 4.3 Required template

Create this file during Task S0.

```markdown
# Project Context

Last updated: YYYY-MM-DD HH:MM
Updated by: <person/agent>
Current branch: <branch>
Current milestone: <M0-M8>
Demo-critical status: GREEN / YELLOW / RED

## 1. Current Working State
- What currently works end-to-end
- What is partially implemented
- What is currently broken

## 2. Architecture Invariants
- Browser-only camera processing
- Raw webcam video never persists to Tiger Data
- Active training/scoring works without network/database availability
- Generative AI never calculates geometry scores
- Current coordinate convention
- Current canonical TypeScript and Tiger Data schemas
- Current browser target

## 3. Shared Contracts
- Important TypeScript types
- APIs/events between subsystems
- Data schema version
- Any recent contract changes

## 4. Current Task Ownership
Person A - Realtime Vision and 3D Simulation:
- ...

Person B - Data, Evaluation, Tiger Data, Product, AI and Voice:
- ...

## 5. Completed Tasks
- S0 - ...
- A1 - ...
- B1 - ...

## 6. In Progress
- Task ID - status - owner

## 7. Known Issues / Risks
- Severity - issue - fallback

## 8. Data / Asset Status
- JIGSAWS access/licensing status
- LASK status
- 3D asset licensing status
- Reference motions currently available

## 9. External Service Status
- Tiger Cloud service created: yes/no
- Tiger DB migrations current: yes/no
- Tiger extensions verified (`timescaledb`, `vectorscale`, `pg_textsearch`): yes/no
- Tiger MCP configured for coding agents: yes/no
- Tiger cloud sync smoke test: pass/fail/not-run
- Backboard model ID verified: yes/no
- ElevenLabs voice ID configured: yes/no
- Vercel env configured: yes/no

## 10. Commands That Must Pass
- npm run typecheck
- npm run lint
- npm test
- npm run build

## 11. Next Recommended Actions
1. ...
2. ...
3. ...

## 12. Manual Demo Notes
- Browser
- Camera positioning
- Lighting
- Known reliable gesture speed
- Backup fixture URL/command
```

## 4.4 Supporting docs

Also create:

```text
docs/DECISIONS.md
docs/TIGER_DATA.md
```

Use `DECISIONS.md` for short architecture decision records when a choice is important enough that future agents should not repeatedly reopen it.

Use `TIGER_DATA.md` for:
- current Tiger project/service IDs (never passwords),
- enabled extensions,
- migration state,
- hypertable/continuous-aggregate inventory,
- retention/columnstore policies,
- MCP/fork workflow,
- known plan limitations,
- benchmark/query notes.

Create:

```text
docs/DATA_LICENSES.md
docs/ASSET_LICENSES.md
```

No dataset or 3D asset may be added without recording its source and license status.

---

# 5. REPOSITORY STRUCTURE

Target structure:

```text
surgical-motion-trainer/
├── docs/
│   ├── CONTEXT.md
│   ├── DECISIONS.md
│   ├── TIGER_DATA.md
│   ├── DATA_LICENSES.md
│   └── ASSET_LICENSES.md
│
├── db/
│   ├── migrations/
│   │   ├── 0001_extensions.sql
│   │   ├── 0002_core_tables.sql
│   │   ├── 0003_hypertables.sql
│   │   ├── 0004_aggregates.sql
│   │   ├── 0005_search.sql
│   │   └── 0006_policies.sql
│   └── seeds/
│       ├── skills.sql
│       └── coaching_knowledge.sql
│
├── public/
│   ├── models/
│   │   ├── room/
│   │   ├── patient/
│   │   ├── instruments/
│   │   └── training/
│   ├── mediapipe/
│   │   └── hand_landmarker.task
│   ├── audio/
│   │   └── coach/
│   └── references/
│       ├── needle-passing/
│       ├── suturing/
│       ├── knot-tying/
│       └── peg-transfer/
│
├── scripts/
│   ├── tiger/
│   │   ├── migrate.ts
│   │   ├── seed.ts
│   │   ├── verify.ts
│   │   └── benchmark.ts
│   ├── data/
│   │   ├── jigsaws/
│   │   │   ├── convert.py
│   │   │   └── README.md
│   │   ├── lask/
│   │   │   ├── convert.py
│   │   │   └── README.md
│   │   └── validate_reference.py
│   ├── audio/
│   │   └── generate_coach_clips.ts
│   └── assets/
│       └── optimize_models.sh
│
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── library/page.tsx
│   │   ├── train/[skillId]/page.tsx
│   │   ├── results/[attemptId]/page.tsx
│   │   ├── progress/page.tsx
│   │   ├── dev/reference-recorder/page.tsx
│   │   └── api/
│   │       ├── review/route.ts
│   │       ├── speech/route.ts
│   │       ├── attempts/route.ts
│   │       ├── attempts/[attemptId]/route.ts
│   │       ├── progress/route.ts
│   │       ├── search/route.ts
│   │       ├── similar-attempts/route.ts
│   │       └── health/route.ts
│   │
│   ├── components/
│   │   ├── camera/
│   │   ├── scene/
│   │   ├── training/
│   │   ├── replay/
│   │   ├── results/
│   │   └── library/
│   │
│   ├── lib/
│   │   ├── vision/
│   │   ├── filters/
│   │   ├── simulation/
│   │   ├── exercise/
│   │   ├── motion/
│   │   ├── evaluation/
│   │   ├── references/
│   │   ├── coaching/
│   │   ├── ai/
│   │   ├── voice/
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── attempts.ts
│   │   │   ├── progress.ts
│   │   │   ├── search.ts
│   │   │   └── similarity.ts
│   │   └── storage/
│   │
│   ├── data/
│   │   ├── skills/
│   │   └── pathways/
│   │
│   ├── store/
│   │   └── training-store.ts
│   │
│   ├── types/
│   │   ├── geometry.ts
│   │   ├── hand.ts
│   │   ├── motion.ts
│   │   ├── skill.ts
│   │   ├── evaluation.ts
│   │   └── ai.ts
│   │
│   └── workers/
│       └── hand-tracking.worker.ts
│
├── tests/
│   ├── fixtures/
│   ├── unit/
│   └── e2e/
│
└── package.json
```

---

# 6. SHARED DATA CONTRACTS

These types should be created early and treated as API contracts between the two developers.

## 6.1 Geometry

```ts
export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Quat = {
  x: number;
  y: number;
  z: number;
  w: number;
};
```

## 6.2 Hand frame

```ts
export type Handedness = "Left" | "Right";

export type HandFrame = {
  handedness: Handedness;
  confidence: number;
  landmarks: Vec3[];       // normalized image coordinates
  worldLandmarks: Vec3[];  // MediaPipe local hand world coordinates
  palmCenter: Vec3;
  palmRotation: Quat;
  pinchRatio: number;
  isPinching: boolean;
};
```

## 6.3 Tool state

```ts
export type ToolState = {
  id: "left-tool" | "right-tool";
  position: Vec3;
  rotation: Quat;
  tipPosition: Vec3;
  jawClosed: boolean;
  heldObjectId?: string;
};
```

## 6.4 Exercise segments

Do not make segment names global assumptions. Each skill defines its own sequence.

Example Needle Passing:

```ts
export type NeedlePassingSegment =
  | "approach"
  | "grip"
  | "align"
  | "entry"
  | "rotation"
  | "exit"
  | "release"
  | "complete";
```

At runtime, the general engine stores segment IDs as strings validated against the skill definition.

## 6.5 Recorded motion frame

```ts
export type MotionFrame = {
  tMs: number;
  segmentId: string;
  normalizedProgress: number;
  leftTool: ToolState;
  rightTool: ToolState;
  leftHand?: HandFrame;
  rightHand?: HandFrame;
};
```

## 6.6 Reference motion

```ts
export type ReferenceMotion = {
  schemaVersion: 1;
  id: string;
  skillId: string;
  sourceType: "dataset" | "internal-recording";
  sourceName: string;
  coordinateSystem: "scene-canonical-v1";
  fps: number;
  segments: Array<{
    id: string;
    startMs: number;
    endMs: number;
  }>;
  frames: MotionFrame[];
  envelope?: ReferenceEnvelope;
};
```

## 6.7 Reference envelope

```ts
export type ReferenceEnvelope = {
  sampleCount: number;
  percentileLow: number;
  percentileHigh: number;
  leftToolPositionTolerance: Vec3[];
  rightToolPositionTolerance: Vec3[];
  orientationToleranceDeg: number[];
};
```

The first implementation can omit the envelope and use one canonical motion. P1 should combine multiple expert attempts.

## 6.8 Skill definition

```ts
export type TrainingMode = "learn" | "practice" | "assessment";

export type SkillDefinition = {
  id: string;
  title: string;
  description: string;
  category: "suturing" | "laparoscopic" | "fundamentals";
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  referenceMotionId: string;
  sourceLabel: string;
  availableModes: TrainingMode[];
  segments: Array<{
    id: string;
    title: string;
    instructions: string;
  }>;
  metricWeights: Record<string, number>;
  coachingRules: string[];
  sceneConfig: {
    sceneId: string;
    targetIds: string[];
    dangerZoneIds: string[];
  };
};
```

## 6.9 Performance result

```ts
export type PerformanceVector = {
  pathSimilarity: number;
  targetAccuracy: number;
  depthConsistency: number;
  instrumentOrientationAccuracy: number;
  movementSmoothness: number;
  pathEfficiency: number;
  motionStability: number;
  overshootControl: number;
  correctionEfficiency: number;
  rotationControlAccuracy: number;
  pinchStability: number;
  gripTiming: number;
  handWorkspaceControl: number;
  bimanualCoordination: number;
  segmentTiming: number;
  speedProfileControl: number;
  idleTimeControl: number;
  toolCollisionAvoidance: number;
  dangerZoneAvoidance: number;
  proceduralSequencing: number;
};
```

Important naming note: if the expert dataset contains tool kinematics but not the expert surgeon's anatomical wrist pose, do not label a metric "expert wrist accuracy." Use `rotationControlAccuracy` and explain that it measures whether the user's hand rotation produced the desired instrument orientation.

## 6.10 Attempt result

```ts
export type AttemptResult = {
  schemaVersion: 1;
  id: string;
  skillId: string;
  mode: TrainingMode;
  createdAt: string;
  durationMs: number;
  referenceMotionId: string;
  performance: PerformanceVector;
  categoryScores: {
    precision: number;
    control: number;
    technique: number;
    coordination: number;
    efficiencySafety: number;
  };
  overallScore: number;
  importantEvents: CoachingEvent[];
  worstMoments: ReplayMarker[];
};
```

## 6.11 Tiger Data persistence contracts

The browser should upload a compact post-attempt payload, not raw video.

```ts
export type AttemptUploadPayload = {
  attempt: {
    id: string;
    anonymousUserId: string;
    skillId: string;
    mode: TrainingMode;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    result: AttemptResult;
  };
  motionSamples: Array<{
    sampledAt: string;
    seq: number;
    segment: ExerciseSegment;
    leftTool?: ToolFrame;
    rightTool?: ToolFrame;
  }>;
  metricSamples: Array<{
    sampledAt: string;
    seq: number;
    segment: ExerciseSegment;
    pathDeviation?: number;
    orientationErrorDeg?: number;
    speed?: number;
    jerk?: number;
    gripError?: number;
    coordinationError?: number;
  }>;
  coachingEvents: CoachingEvent[];
};
```

The `PerformanceVector` must have a stable metric ordering for `vector(20)` persistence. Define the ordering once:

```ts
export const PERFORMANCE_VECTOR_ORDER = [
  "pathSimilarity",
  "targetAccuracy",
  "depthConsistency",
  "instrumentAngleAccuracy",
  "movementSmoothness",
  "pathEfficiency",
  "motionStability",
  "overshootControl",
  "correctionEfficiency",
  "wristRotationAccuracy",
  "fingerControlStability",
  "gripTiming",
  "handPositionAccuracy",
  "twoHandCoordination",
  "segmentTiming",
  "speedControl",
  "idleTimeControl",
  "toolCollisionAvoidance",
  "dangerZoneAvoidance",
  "proceduralSequencing",
] as const;
```

Any change to this ordering is a schema migration and must update:
- TypeScript conversion,
- database vector dimension assumptions,
- similarity tests,
- `docs/CONTEXT.md`.

---

# 7. EXPERT DATA AND REFERENCE MOTION PIPELINE

## 7.1 Data sources

### JIGSAWS

Use case:

- Suturing
- Knot Tying
- Needle Passing

Useful fields include:

- Cartesian manipulator positions
- orientations
- velocities
- angular velocities
- gripper angles
- stereo video
- manual gesture annotations
- skill ratings

Important: JIGSAWS is released for academic research, not commercial use. Do not commit raw data to the repository. Do not redistribute derived artifacts until the team confirms the release terms permit the intended hackathon deployment.

### LASK

Use case:

- Laparoscopic Peg Transfer

Useful data includes paired video and two-instrument 6/7-DoF kinematics. The project currently states CC BY 4.0 licensing, which makes it the cleanest dataset for a public reference-motion demo as long as attribution is included.

### SHANDS

Optional P2/P1 research use:

- surgical hand gestures,
- suturing and incision,
- expert versus trainee examples,
- error taxonomy.

Do not block the core project on SHANDS access. Treat it as an optional future source for error categories or a learned classifier.

## 7.2 Licensing gate

Before integrating any dataset:

1. Add an entry to `docs/DATA_LICENSES.md`.
2. Record:
   - source URL,
   - license/access terms,
   - whether raw data can be stored locally,
   - whether derived reference motion can be deployed publicly,
   - required attribution.
3. Keep all raw external datasets outside git in `datasets/raw/` and add the directory to `.gitignore`.
4. If redistribution is unclear, do not deploy the derived dataset artifact publicly. Use the internal reference recorder as the demo fallback.

## 7.3 Canonical scene coordinate system

All external reference data must be converted to one application coordinate system before runtime.

Canonical convention:

```text
+X = user's right
+Y = up
+Z = toward the user/camera
origin = center of training target
units = normalized scene units, not claimed real-world centimeters
quaternion = right-handed Three.js convention
```

The app should never compare raw dataset coordinates directly against user motion.

## 7.4 Conversion pipeline

Each dataset adapter should output `ReferenceMotion` JSON.

```text
raw dataset
  -> select task and expert attempts
  -> parse left/right tool kinematics
  -> select or derive segment annotations
  -> remove invalid frames
  -> transform coordinate basis
  -> translate to target origin
  -> scale into canonical workspace
  -> resample to 30 Hz
  -> offline smooth
  -> segment-normalize progress
  -> optionally combine experts into envelope
  -> validate schema
  -> write public/references/<skill>/<reference>.json
```

## 7.5 Offline smoothing

Use separate data for scoring and display if possible.

- `referenceRaw`: minimally cleaned source motion
- `referenceDisplay`: 7-frame centered moving average or equivalent

Ghost rendering should use `referenceDisplay`.

Evaluation should use the canonical reference with only enough filtering to remove obvious acquisition noise.

## 7.6 Expert envelope

P1 enhancement:

Instead of one "perfect" trajectory, combine several expert attempts.

For every normalized sample index:

1. collect expert positions,
2. compute median position,
3. compute a percentile/tolerance region,
4. compute median quaternion orientation using a stable quaternion averaging method,
5. store permissible spread.

Scoring should penalize only distance outside the expert envelope rather than exact difference from one surgeon.

## 7.7 Internal reference recorder fallback

Route:

```text
/dev/reference-recorder
```

Purpose:

- create a reference when dataset access is blocked,
- create temporary development fixtures,
- validate ghost and replay systems before external data is ready.

The route should record the exact same virtual tool transforms as a normal attempt and export canonical `ReferenceMotion` JSON.

Do not present an internally recorded reference as expert medical ground truth unless it was actually performed/validated by a qualified person.

---

# 8. COMPUTER VISION AND HAND TRACKING

## 8.1 Browser target

Primary supported browser for the hackathon demo:

- Latest Chrome on macOS

Do not spend critical time optimizing Safari unless the Chrome build is already stable.

## 8.2 Camera setup

Request:

```ts
navigator.mediaDevices.getUserMedia({
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
    facingMode: "user",
  },
  audio: false,
});
```

Display a mirrored preview for the user, but centralize mirroring logic. Never mirror once in vision and again in 3D.

## 8.3 MediaPipe configuration

Use Hand Landmarker with:

- `numHands: 2`
- VIDEO or live-stream processing
- tunable confidence thresholds
- model file hosted locally under `public/mediapipe/`

The output includes normalized landmarks, world landmarks, and handedness.

## 8.4 Worker architecture

A1 implementation details and verification are maintained in `docs/HAND_TRACKING.md`.
Next/Turbopack emits classic bundled workers. The installed MediaPipe runtime must
therefore use its classic WASM loader (`forVisionTasks(root, false)`), rather than
the ES-module WASM loader. Assets are prepared locally before dev/build. A1 emits
raw tracking snapshots; A2 constructs calibrated shared `HandFrame` values.

Target:

```text
<video>
  -> requestVideoFrameCallback
  -> ImageBitmap / transferable frame
  -> hand-tracking.worker.ts
  -> MediaPipe result
  -> minimal HandFrame data back to main thread
  -> refs consumed by R3F render loop
```

Do not send React state updates at tracking FPS.

If Web Worker support becomes a blocking issue, fall back to throttled main-thread detection at 20-30 FPS while keeping Three.js updates in refs. Demo smoothness is more important than architectural purity.

## 8.5 Stable hand identity

MediaPipe handedness is useful but may be unstable during overlap.

Use a hand-lock layer:

1. Start with MediaPipe handedness.
2. Compare each new palm center with the previous left/right centers.
3. Choose the assignment minimizing movement distance unless confidence strongly contradicts it.
4. Do not swap identities during a short occlusion.

## 8.6 Calibration

Calibration duration target: 2-4 seconds.

A2 implements automatic neutral/open (750 ms), closed pinch (750 ms), and
open-hand workspace sweep (at least 1,500 ms) stages. Those durations count valid
samples; pose transitions, insufficient motion and retries extend elapsed time.
Neutral/pinch time out after 15 foreground seconds each; workspace allows 45.
Workspace now guides one hand at a time with per-direction checkmarks. Each
direction needs a sustained valid excursion; completed directions survive tracking
gaps. Workspace-only retry preserves those captures and the neutral/pinch stages.
See `docs/HAND_TRACKING.md` for
quality gates, recovery, configurable mapping and physical acceptance.

Collect:

- neutral palm center,
- palm width,
- apparent hand scale,
- neutral palm rotation,
- open thumb-index distance,
- closed pinch distance,
- comfortable XY range.

Store a `CalibrationProfile` in memory for the attempt.

```ts
export type CalibrationProfile = {
  dimensions: { width: number; height: number };
  left: HandCalibration;
  right: HandCalibration;
};
```

The actual A2-owned `HandCalibration`/`CalibrationProfile` definitions live in
`src/lib/vision/control-types.ts`: each hand stores neutral image center, apparent
palm scale, canonical neutral rotation, open/closed pinch ratios, calibrated
enter/release thresholds and directional XY ranges. Profiles are memory-only and
invalidated by camera stream or capture-format changes. Shared `src/types/` remain
unchanged; HandFrame palm center/landmarks retain SDK coordinates, while its palm
rotation is the calibrated control rotation. A3 consumes canonical target poses,
not raw image centers or local world-coordinate translations.

## 8.7 Palm center

Compute from stable palm landmarks, for example wrist + MCP joints rather than finger tips.

Suggested indices:

- wrist 0
- index MCP 5
- middle MCP 9
- pinky MCP 17

## 8.8 Pinch detection

Normalize thumb-index tip distance by palm width.

```ts
pinchRatio = distance(thumbTip, indexTip) / distance(indexMcp, pinkyMcp)
```

Use hysteresis.

Example starting thresholds only:

```text
enter pinch < 0.28
release pinch > 0.40
```

Require the state to remain stable for roughly 80-120 ms before toggling.

Tune these values per calibration and expose them in debug mode.

A2 measures the ratio in local world coordinates and derives per-hand thresholds:
`closed + 0.28 * (open - closed)` to enter, and
`closed + 0.40 * (open - closed)` to release, with a 100 ms debounce.
The example 0.28/0.40 values above are not fixed raw-ratio thresholds in A2.

## 8.9 Wrist/palm rotation

Construct a palm basis:

- horizontal axis: pinky MCP -> index MCP
- vertical axis: wrist -> middle MCP
- normal: cross(horizontal, vertical)

Convert the orthonormal basis into a quaternion.

Then:

- subtract calibration neutral orientation,
- clamp to the useful exercise range,
- reject implausibly large one-frame jumps,
- preserve the previous stable quaternion when confidence is low.

Do not allow unrestricted 360-degree instrument flips.

A2 reconstructs the orthonormal basis after transforming points to the canonical
convention, uses `current * inverse(neutral)`, limits relative rotation to 90°,
and smooths with adaptive quaternion slerp. Assigned-label confidence below 0.5
holds rotation; it is not treated as a geometric accuracy estimate.

## 8.10 Depth

A single webcam does not provide controller-grade absolute depth.

Use a constrained depth estimate based on apparent palm scale relative to calibration.

```text
relative scale smaller -> farther
relative scale larger -> nearer
```

Map it to a narrow tool workspace.

A2's initial depth range is ±0.15 normalized scene units around neutral, with a
debug planar fallback. XY travel is ±0.75 around per-hand rest positions. These
are tunable simulator defaults, not physical centimeter measurements.

Fallback if unstable:

- use three depth zones: Far / Working / Near,
- or reduce the exercise to a nearly planar interaction.

## 8.11 Live smoothing

Use a One Euro filter per relevant scalar/vector axis.

Goals:

- strong filtering while hand is nearly still,
- reduced filtering during intentional fast movement,
- no obvious rubber-band lag.

After filtering, Three.js should still interpolate tool transforms every display frame.

```ts
useFrame((_, delta) => {
  const displayDelta = Math.min(delta, 0.05);
  const positionAlpha = 1 - Math.exp(-40 * displayDelta);
  const rotationAlpha = 1 - Math.exp(-40 * displayDelta);

  tool.position.lerp(targetPosition, positionAlpha);
  tool.quaternion.slerp(targetRotation, rotationAlpha);
});
```

A3 uses the 40/s display response above and skips the first recovery interpolation
step. Synthetic tests guard <30 ms additional position/rotation phase delay;
target-Mac responsiveness and camera-to-display latency still require measurement.

## 8.12 Tracking loss

Rules:

- under ~200 ms loss: hold last stable tool transform,
- do not auto-release a gripped object,
- inhibit progression immediately on missing/invalid input; after 200 ms mark
  sustained loss and fade the control indicator,
- resume after three consecutive valid frames (gaps at most 120 ms), resetting
  filter derivatives and pending pinch evidence while preserving grip.

A2 exposes this gate as `ControlSnapshot.canProgress`; a held target is never
published as a fresh HandFrame. Backend/tab suspension preserves calibration but
requires recovery. Camera restart, errors, stream/format changes and effect
teardown require recalibration. No A2 control event can detach a held object;
that ownership belongs to A3/A4.

## 8.13 PuppetMaster patterns to reuse

The browser-based PuppetMaster hackathon project is a useful reference for:

- GPU MediaPipe usage,
- timestamped frame buffers,
- `requestAnimationFrame` playback,
- keeping high-frequency motion in refs,
- 7-frame offline smoothing,
- consistent mirrored coordinate mapping.

Use these patterns, but do not copy its single-file architecture. This project requires detailed hand landmarks and 3D tools, so Hand Landmarker and modular subsystems are necessary.

---

# 9. 3D SIMULATION

## 9.1 Scene goal

The operating room should look polished, but it is a presentation shell around the motion-training interaction.

Only a small subset of scene objects need behavior.

### Interactive

- left tool
- right tool
- needle or task object
- training tissue / target board
- target points
- danger zones
- ghost tools

### Decorative

- operating table
- patient/mannequin
- lights
- monitor
- cabinets
- trays

## 9.2 Asset strategy on Mac

Use premade licensed GLB/glTF assets.

A3 development-preview decision (2026-10-17): use repository-authored procedural
room/instrument/needle geometry for reproducible control verification. No external
model dependency is required. Licensed GLB/glTF dressing can follow separately;
record any future external models in the asset ledger. See `docs/SIMULATION.md`.

No Blender dependency.

Optimization options:

- `gltfjsx`
- `@gltf-transform/cli`
- texture resizing where licensing permits
- reduced shadow-casting objects

Every external model goes into `docs/ASSET_LICENSES.md`.

## 9.3 R3F hierarchy

```tsx
<Canvas orthographic camera={{ position: [0, 0.15, 4], zoom: 160 }}>
  <Lighting />
  <OperatingRoom />
  <TrainingScene skill={skill} />
  <GhostLayer />
  <UserToolLayer />
  <TrajectoryLayer />
</Canvas>
```

A3 uses a fixed front view, fitting orthographic zoom to a 3.6-by-2.6-unit
workspace on resize. The pickup halo and tool crosshair rings give explicit
alignment feedback. Easy pickup defaults on: tips stay at Z=0 and acquisition
snaps within 0.16 units. Free 3D depth retains the 0.10-unit radius. Switching
assistance resets scene ownership, not calibration.

Use a mostly fixed camera for the training attempt. Allow limited orbiting during replay if stable.

## 9.4 Tool behavior

The virtual tools are kinematic, not physics-driven.

The hand mapping produces target transforms. The tool renderer interpolates toward those transforms.

Simple interaction:

- pinch closes instrument jaws,
- if jaws close while the tool tip is inside a grabbable target radius, attach the target,
- open pinch releases,
- task logic determines whether a checkpoint is satisfied.

## 9.5 Tissue behavior

Do not simulate soft-body tissue.

For needle-passing:

- define an entry point,
- define an exit point,
- define a curved corridor,
- require alignment before entry,
- once engaged, constrain the virtual needle to an arc or guided path while the user still controls progression/rotation,
- optionally animate minor visual deformation.

The user should still have enough freedom to score poorly or leave the correct corridor.

---

# 10. GENERIC EXERCISE ENGINE

## 10.1 Principle

Skills should be data/config-driven. Adding a new exercise should require mostly:

- a `SkillDefinition`,
- a scene config,
- a reference motion,
- segment completion conditions,
- metric weights,
- coaching thresholds.

Do not duplicate an entire training page per skill.

## 10.2 Needle Passing state machine

```text
IDLE
 -> CALIBRATION
 -> DEMONSTRATION (Learn only)
 -> APPROACH
 -> GRIP
 -> ALIGN
 -> ENTRY
 -> ROTATION
 -> EXIT
 -> RELEASE
 -> COMPLETE
 -> EVALUATION
 -> REPLAY
```

### Example conditions

**APPROACH -> GRIP**

- needle holder tip is inside needle grab radius,
- correct hand pinch becomes active.

**GRIP -> ALIGN**

- needle attached,
- tool enters alignment region.

**ALIGN -> ENTRY**

- orientation within tolerance,
- tip crosses entry region.

**ENTRY -> ROTATION**

- needle is engaged,
- correct rotational direction begins.

**ROTATION -> EXIT**

- tip reaches exit corridor,
- sufficient angular progress.

**EXIT -> RELEASE**

- needle leaves tissue zone.

**RELEASE -> COMPLETE**

- pinch releases in valid region.

## 10.3 Mode behavior

### Learn

- full ghost visible,
- path visible,
- target highlighted,
- voice coaching enabled,
- optionally slow ghost to user pace.

### Practice

- ghost initially hidden,
- user can toggle ghost,
- ghost can appear after sustained deviation,
- voice coaching limited to high-severity events.

### Assessment

- no ghost,
- no live voice correction,
- only neutral progress indicators,
- full review after completion.

---

# 11. GHOST MOTION SYSTEM

## 11.1 Accuracy model

The medically meaningful reference is primarily the **instrument trajectory** when the dataset provides tool kinematics.

Do not fabricate detailed expert hand anatomy from tool-only data and imply it is measured ground truth.

Visual options:

- translucent expert tools: always safe and accurate to the reference motion,
- ghost path trail: accurate to tool tip motion,
- optional stylized hand skeleton: clearly visual only, attached to tool control points.

## 11.2 Playback

Reference motion is already timestamped and segmented.

During playback:

1. calculate normalized segment progress,
2. locate bracketing reference frames,
3. linearly interpolate positions,
4. quaternion-slerp rotations,
5. render at display refresh rate.

This produces smoother motion than displaying only the original 30 Hz points.

## 11.3 Ghost styling

Recommended:

- 25-40% opacity,
- emissive edge or subtle glow,
- visible tool-tip trail,
- current target highlight,
- optional tolerance tube around the path,
- wrist/orientation arc only when useful.

Do not use visually noisy skeleton overlays if the ghost instruments alone communicate the motion better.

## 11.4 Guided synchronization

In Learn mode, the ghost should not race away from a slow user.

Two options:

### Option A - fixed demonstration then user attempt

Simplest and safest P0.

### Option B - progress-coupled ghost

P1:

- user segment determines ghost segment,
- ghost stays 5-15% ahead of user normalized progress,
- if user stalls, ghost pauses or loops a short segment.

---

# 12. MOTION RECORDING AND ALIGNMENT

## 12.1 Recording

Record at the tracking/update rate, not every 60 Hz render frame.

Each frame stores:

- timestamp,
- segment,
- normalized progress,
- left/right tool transforms,
- optionally hand state used for user-only metrics.

## 12.2 Separate streams

Maintain three conceptual streams:

1. **Sensor/raw debug** - raw landmarks, optional and not persisted in normal product use.
2. **Control/evaluation stream** - calibrated + One Euro filtered transforms that actually controlled the tools.
3. **Display/replay stream** - additional offline smoothing for visual playback.

Do not score the heavily smoothed replay stream.

## 12.3 Segment normalization

A slower user should not fail path similarity merely because they took longer.

For each segment:

1. cut expert and user frames to the same logical segment,
2. resample each to a fixed number of normalized progress samples,
3. compare corresponding samples,
4. calculate timing separately.

Suggested initial sample counts:

```text
approach: 30
grip: 15
align: 30
entry: 30
rotation: 60
exit: 30
release: 15
```

These numbers are implementation conveniences, not medical constants.

## 12.4 Optional DTW

Only implement Dynamic Time Warping after segment-based resampling passes all tests.

DTW can improve trajectory comparison when local timing differs, but it also complicates explainability. Preserve simple segment metrics even if DTW is added.

---

# 13. EVALUATION ENGINE

## 13.1 Principle

The evaluation engine should be deterministic, testable, and explainable.

Every metric returns:

```ts
export type MetricResult = {
  id: string;
  score: number; // 0-100
  rawValue: number;
  unit?: string;
  tolerance?: number;
  segmentId?: string;
  evidence?: {
    startMs?: number;
    endMs?: number;
    frameIndex?: number;
  };
};
```

## 13.2 Score conversion

Use skill-specific tolerances rather than arbitrary global thresholds.

Generic pattern:

```ts
function errorToScore(error: number, tolerance: number) {
  const normalized = Math.min(1, Math.max(0, error / tolerance));
  return Math.round(100 * (1 - normalized));
}
```

For metrics where higher is better, use an appropriate monotonic mapping.

## 13.3 Twenty metrics

### Precision

1. **Path Similarity**  
   Mean or RMS tool-tip distance from canonical/expert path after segment alignment.

2. **Target Accuracy**  
   Distance from expected grip, entry, exit, and release targets.

3. **Depth Consistency**  
   Difference in constrained Z motion relative to reference/tolerance.

4. **Instrument Orientation Accuracy**  
   Quaternion angular difference between user and reference tool.

### Movement quality

5. **Movement Smoothness**  
   Normalized jerk or high-frequency acceleration changes on the control trajectory.

6. **Path Efficiency**  
   Compare total user tool-tip distance with the reference or minimum task path.

7. **Motion Stability**  
   Positional/angular variance during segments expected to be stable.

8. **Overshoot Control**  
   Count target crossings followed by reversing corrections.

9. **Correction Efficiency**  
   Excess distance and time required to recover after a detected deviation.

### Technique/control

10. **Rotation Control Accuracy**  
    Correct direction, timing, and magnitude of hand-driven instrument rotation. Do not call this expert anatomical wrist accuracy unless expert wrist ground truth exists.

11. **Pinch Stability**  
    Variance of normalized pinch ratio while a tool is expected to remain closed.

12. **Grip Timing**  
    Whether grab/release occurs at the intended task segments.

13. **Hand Workspace Control**  
    Penalize extreme/unnecessary real-hand displacement that creates control instability. This is a simulator interaction metric, not a clinical metric.

14. **Bimanual Coordination**  
    Compare relative timing and motion between left/right tools; use cross-correlation or relative-transform consistency where appropriate.

### Timing and safety

15. **Segment Timing**  
    Duration per segment relative to expert distribution or expected bounds.

16. **Speed Profile Control**  
    Compare normalized speed curve shape and whether the user slows for precision sections.

17. **Idle Time Control**  
    Unnecessary pauses outside intentional hold points.

18. **Tool Collision Avoidance**  
    Count simplified tool-tool or tool-forbidden-zone collisions.

19. **Danger Zone Avoidance**  
    Contact/proximity penalties for defined simulation danger zones.

20. **Procedural Sequencing**  
    Whether segments occurred in required order without invalid skips/reversals.

## 13.4 Category scores

```text
Precision
  - 1,2,3,4

Control
  - 5,6,7,8,9

Technique
  - 10,11,12,13

Coordination
  - 14,18

Efficiency & Safety
  - 15,16,17,19,20
```

Weights are skill-specific.

## 13.5 Worst moments

Every metric should be able to emit evidence timestamps.

Select the top 3 meaningful deviations for replay markers.

Example:

```ts
{
  tMs: 6420,
  segmentId: "rotation",
  metricId: "instrumentOrientationAccuracy",
  severity: 0.84,
  explanationData: {
    userAngleDeg: 22,
    referenceAngleDeg: 41,
    differenceDeg: 19,
  }
}
```

The AI later explains this data. It does not discover it.

## 13.6 Evaluation tests

Create synthetic fixtures:

- perfect reference clone,
- 10% translated path,
- late rotation,
- high jitter,
- wrong sequencing,
- repeated overshoot,
- one-hand idle,
- tool collision.

Expected behavior:

- perfect fixture scores highest,
- each controlled perturbation lowers the relevant metric,
- unrelated metrics stay relatively stable,
- all scores remain 0-100,
- output is deterministic.

---

# 14. LIVE COACHING ENGINE

## 14.1 Deterministic events

Evaluate lightweight rules every 300-500 ms.

Example event types:

```ts
export type CoachingEvent = {
  id: string;
  tMs: number;
  type:
    | "path_deviation"
    | "rotation_late"
    | "moving_too_fast"
    | "unstable_grip"
    | "left_hand_unstable"
    | "danger_zone_near"
    | "overshoot";
  severity: number;
  segmentId: string;
  data: Record<string, number | string | boolean>;
};
```

## 14.2 Message policy

Starting policy:

```text
minimum severity: 0.65
cooldown: 4 seconds
max live spoken messages: 4 per attempt
same-event repeat suppression: 8 seconds
```

If the user corrects the issue before audio starts, cancel the pending message.

## 14.3 Common pre-generated clips

Examples:

- Slow down as you approach the target.
- Begin rotating earlier.
- Keep your assisting hand steady.
- Return toward the highlighted path.
- Keep your grip consistent.
- Good correction. Continue.

Pre-generate these through ElevenLabs and store them under `public/audio/coach/` for near-instant playback.

---

# 15. ELEVENLABS VOICE LAYER

## 15.1 Default model

Use:

```text
eleven_flash_v2_5
```

for low-latency dynamic speech.

## 15.2 Voice architecture

```text
common deterministic event
  -> local pre-generated clip

rare/specific event
  -> /api/speech
  -> ElevenLabs streaming TTS

final AI review
  -> /api/speech
  -> ElevenLabs narration
```

## 15.3 Server route

`src/app/api/speech/route.ts`

Responsibilities:

- validate text length,
- call ElevenLabs using server-side key,
- stream or return audio,
- fail cleanly,
- never expose key to client.

## 15.4 Audio manager

One central audio manager should:

- prevent overlapping coaching speech,
- allow priority interruptions only for severe events,
- cancel obsolete pending speech,
- expose `isSpeaking`,
- pause low-priority coaching during final replay narration.

## 15.5 Fallback

If ElevenLabs is unavailable:

- use browser `speechSynthesis` for demo continuity,
- show text coaching regardless.

---

# 16. BACKBOARD + GEMINI REVIEW LAYER

## 16.1 What AI is allowed to do

AI may:

- explain scores,
- summarize strengths,
- explain the largest deviations,
- generate concise replay narration,
- answer questions about already-calculated metrics.

AI may not:

- calculate tool geometry from raw video,
- declare clinical competence,
- invent measurements,
- override deterministic scores,
- make patient-specific medical decisions.

## 16.2 Model resolution

At setup time, query Backboard's Models API and verify the exact Google Gemini 2.5 Flash entry.

Do not hardcode an assumed catalog name without verification.

Expected configuration conceptually:

```text
llm_provider = google
model_name = <verified Gemini 2.5 Flash model name>
```

## 16.3 Backboard request

Use:

```text
POST https://app.backboard.io/api/threads/messages
```

Default attempt review settings:

```json
{
  "llm_provider": "google",
  "model_name": "<env model>",
  "stream": false,
  "memory": "off",
  "web_search": "off",
  "json_output": true
}
```

## 16.4 Review payload

Send summary metrics, not all motion frames.

```json
{
  "skillId": "needle-passing",
  "mode": "assessment",
  "overallScore": 78,
  "categoryScores": {
    "precision": 84,
    "control": 71,
    "technique": 74,
    "coordination": 80,
    "efficiencySafety": 76
  },
  "performanceVector": {},
  "worstMoments": [],
  "strongestMetrics": [],
  "weakestMetrics": []
}
```

## 16.5 Required response schema

```ts
export const aiReviewSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(1).max(3),
  improvements: z.array(z.string()).min(1).max(3),
  largestDifference: z.object({
    segmentId: z.string(),
    explanation: z.string(),
  }),
  replayNarration: z.string(),
});
```

If JSON parsing fails:

1. do not crash results page,
2. generate a deterministic fallback review from top/bottom metrics,
3. log the failure in debug mode.

## 16.6 System prompt

```text
You are an educational surgical-motion simulation coach.
You receive objective metrics calculated by a deterministic computer-vision and kinematics engine.
Only describe findings supported by the supplied measurements.
Do not invent scores, angles, timing, or medical conclusions.
Do not claim the user is qualified or unqualified to perform surgery.
Use concise, specific language focused on movement precision, control, coordination, efficiency, and simulator technique.
Return only the requested JSON schema.
```

---

# 17. REPLAY SYSTEM

## 17.1 Core visual

The replay is a headline feature.

Render simultaneously:

- user tools: solid,
- expert tools: translucent,
- user path,
- reference path,
- current deviation connector,
- current segment,
- current angle difference,
- timeline markers.

## 17.2 Alignment

Replay is based on normalized segment progress, not raw wall-clock timestamps.

Provide two modes:

- **Synchronized comparison:** expert and user progress are aligned by segment.
- **Original timing:** preserves actual timing difference for timing analysis.

## 17.3 Controls

- play/pause
- scrubber
- 0.25x
- 0.5x
- 1x
- show/hide expert
- show/hide paths
- jump to worst moment
- next/previous issue

## 17.4 Worst-moment automation

On first opening replay:

1. play normally,
2. pause or slow near the highest-severity marker,
3. visually emphasize the divergence,
4. optionally narrate Backboard's `replayNarration` through ElevenLabs.

---

# 18. RESULTS AND PROGRESS

## 18.1 Results page

Show:

- overall score,
- five category scores,
- strongest metric,
- weakest metric,
- top 2-3 issues,
- AI explanation,
- replay CTA,
- all 20 metrics in expandable detail.

The interface should not overwhelm the user with 20 equal-weight cards.

## 18.2 Persistence strategy

Tiger Data is the canonical history store. IndexedDB is a resilient local cache.

```ts
export type SavedAttempt = {
  result: AttemptResult;
  userReplayFrames: MotionFrame[];
  cloudSyncStatus: "pending" | "synced" | "failed";
};
```

Flow:

1. finish the attempt locally;
2. immediately show results from the local deterministic evaluator;
3. save the attempt to IndexedDB;
4. POST a compact batch to `/api/attempts`;
5. if upload succeeds, mark the local copy `synced`;
6. if upload fails, keep the result usable and retry later.

The live training experience must never wait on Tiger Data.

## 18.3 Tiger Data schema

Use PostgreSQL 18 where available so UUIDv7 can provide time-sortable identifiers.

### Relational tables

- `anonymous_users`
- `skills`
- `reference_motions`
- `coach_reviews`
- `skill_documents`

### Time-series tables

- `motion_samples`
- `metric_samples`
- `attempt_scores`
- `coaching_events`

Recommended migration outline:

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_textsearch;

CREATE TABLE anonymous_users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id text PRIMARY KEY,
  title text NOT NULL,
  difficulty text NOT NULL,
  description text NOT NULL,
  source_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  anonymous_user_id uuid NOT NULL REFERENCES anonymous_users(id),
  skill_id text NOT NULL REFERENCES skills(id),
  mode text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  overall_score double precision NOT NULL,
  result_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE motion_samples (
  sampled_at timestamptz NOT NULL,
  attempt_id uuid NOT NULL,
  skill_id text NOT NULL,
  seq integer NOT NULL,
  segment text NOT NULL,
  left_tool jsonb,
  right_tool jsonb
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'sampled_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'sampled_at DESC'
);

CREATE TABLE metric_samples (
  sampled_at timestamptz NOT NULL,
  attempt_id uuid NOT NULL,
  skill_id text NOT NULL,
  seq integer NOT NULL,
  segment text NOT NULL,
  path_deviation double precision,
  orientation_error_deg double precision,
  speed double precision,
  jerk double precision,
  grip_error double precision,
  coordination_error double precision
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'sampled_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'sampled_at DESC'
);

CREATE TABLE attempt_scores (
  completed_at timestamptz NOT NULL,
  attempt_id uuid NOT NULL,
  anonymous_user_id uuid NOT NULL,
  skill_id text NOT NULL,
  overall_score double precision NOT NULL,
  precision_score double precision NOT NULL,
  control_score double precision NOT NULL,
  technique_score double precision NOT NULL,
  coordination_score double precision NOT NULL,
  efficiency_safety_score double precision NOT NULL,
  performance_vector vector(20) NOT NULL
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'completed_at',
  tsdb.chunk_interval = '7 days',
  tsdb.segmentby = 'skill_id,anonymous_user_id',
  tsdb.orderby = 'completed_at DESC'
);

CREATE TABLE coaching_events (
  occurred_at timestamptz NOT NULL,
  attempt_id uuid NOT NULL,
  skill_id text NOT NULL,
  event_type text NOT NULL,
  segment text NOT NULL,
  severity double precision NOT NULL,
  evidence jsonb NOT NULL
) WITH (
  tsdb.hypertable,
  tsdb.partition_column = 'occurred_at',
  tsdb.chunk_interval = '7 days',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'occurred_at DESC'
);

CREATE TABLE skill_documents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  skill_id text NOT NULL REFERENCES skills(id),
  title text NOT NULL,
  content text NOT NULL,
  source_url text,
  source_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

If the exact Tiger Cloud TimescaleDB version has different `CREATE TABLE ... WITH (...)` syntax, the migration agent must verify against current Tiger docs before applying it.

## 18.4 Continuous aggregates

### Per-user skill progress

Precompute dashboard data rather than scanning every attempt:

```sql
CREATE MATERIALIZED VIEW user_skill_daily_progress
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', completed_at) AS bucket,
  anonymous_user_id,
  skill_id,
  count(*) AS attempts,
  avg(overall_score) AS avg_score,
  max(overall_score) AS best_score,
  avg(precision_score) AS avg_precision,
  avg(control_score) AS avg_control,
  avg(technique_score) AS avg_technique,
  avg(coordination_score) AS avg_coordination,
  avg(efficiency_safety_score) AS avg_efficiency_safety
FROM attempt_scores
GROUP BY bucket, anonymous_user_id, skill_id;
```

Add an automatic continuous-aggregate refresh policy.

### Motion-quality rollup

Create a per-second aggregate for compact analysis of long attempts:

```sql
CREATE MATERIALIZED VIEW attempt_motion_1s
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 second', sampled_at) AS bucket,
  attempt_id,
  skill_id,
  avg(path_deviation) AS avg_path_deviation,
  max(path_deviation) AS max_path_deviation,
  avg(orientation_error_deg) AS avg_orientation_error,
  percentile_agg(path_deviation) AS path_deviation_dist,
  avg(speed) AS avg_speed
FROM metric_samples
GROUP BY bucket, attempt_id, skill_id;
```

This is primarily for progress analytics and replay summaries; the immediate evaluator still runs in TypeScript.

## 18.5 Hyperfunctions

Use Tiger hyperfunctions where they add analytical value:

### `time_bucket`

- daily/weekly progress charts,
- per-second motion summaries,
- skill cohort trends.

### `percentile_agg` / `approx_percentile`

Use p50/p95 rather than only means:

- p95 path deviation,
- p95 orientation error,
- population score percentiles,
- "worst sustained deviation" summaries.

### `time_weight`

Use time-weighted averages when frame intervals are uneven:

- path deviation over time,
- instability over time,
- orientation error over time.

### State tracking

Use state-tracking hyperfunctions, where practical, to analyze time spent in exercise segments such as `align`, `entry`, and `rotation`. If the exact current API creates unnecessary complexity, keep segment duration calculation in TypeScript and store the result.

### `lttb` / `asap_smooth`

Use database-side downsampling for progress/replay charts when histories grow:

- LTTB preserves important peaks in deviation/speed graphs;
- ASAP can provide a readable smoothed trend.

Do not use these to alter the canonical 3D replay trajectory.

## 18.6 Similar-attempt search with pgvectorscale

The existing 20-dimensional performance vector becomes a useful native vector representation. It does **not** require an embedding API.

Create the StreamingDiskANN index:

```sql
CREATE INDEX attempt_scores_vector_idx
ON attempt_scores
USING diskann (performance_vector vector_cosine_ops);
```

Example retrieval:

```sql
SELECT
  attempt_id,
  completed_at,
  overall_score,
  performance_vector <=> $1::vector AS distance
FROM attempt_scores
WHERE anonymous_user_id = $2
  AND skill_id = $3
ORDER BY performance_vector <=> $1::vector
LIMIT 5;
```

Product uses:

- "This attempt resembles your previous attempts where wrist rotation was weak."
- Find recurring movement profiles.
- Compare a current attempt with the nearest historical attempt.
- Later, compare against anonymized expert/novice performance profiles when licensing and sample size permit.

Never claim vector similarity itself proves clinical similarity.

## 18.7 BM25 search with pg_textsearch

Create a searchable knowledge layer for:

- skill descriptions,
- coaching explanations,
- reference-source notes,
- definitions of errors,
- lesson instructions.

```sql
CREATE INDEX skill_documents_bm25_idx
ON skill_documents
USING bm25(content)
WITH (text_config = 'english');
```

When the evaluator detects an error such as late wrist rotation, query the relevant skill's documents:

```sql
SELECT id, title, content
FROM skill_documents
WHERE skill_id = $1
ORDER BY content <@> to_bm25query($2, 'skill_documents_bm25_idx')
LIMIT 3;
```

Pass the retrieved snippets plus deterministic metrics to Backboard/Gemini. This makes the AI review grounded in stored instructional material rather than only the model's prior knowledge.

## 18.8 Hypercore / columnstore lifecycle

High-frequency motion samples are hot immediately after an attempt but become mostly analytical later.

Use Hypercore policies to:

- keep recent chunks in rowstore for fast writes/recent replay retrieval;
- automatically convert older chunks to columnstore;
- segment by `attempt_id` where appropriate;
- order by timestamp.

The exact conversion interval should be tuned after measuring data volume. A hackathon-friendly default is 1-7 days.

## 18.9 Retention and optional tiering

Raw telemetry is larger than the durable product value.

Recommended lifecycle:

```text
Recent raw motion/metric samples
    -> rowstore
    -> columnstore
    -> delete after retention window OR tier if plan supports it

Attempt scores + reviews + daily aggregates
    -> keep long-term
```

Suggested policy:

- raw `motion_samples`: retain 30-90 days in a real product; keep throughout the hackathon;
- raw `metric_samples`: same;
- `attempt_scores`: keep;
- continuous aggregates: keep;
- reviews: keep unless user deletes history.

If the Tiger account exposes tiered storage, tier old raw telemetry instead of deleting it. Tiering is optional because free services do not include it.

## 18.10 Background jobs and automation

Use built-in policies first:

- continuous-aggregate refresh policy,
- columnstore policy,
- retention policy.

Use a custom Tiger background job only for a clearly useful task such as:

- purge orphaned telemetry where an attempt metadata row never completed,
- nightly recomputation of derived benchmark metadata,
- occasional BM25 index maintenance after large seed imports.

Do not create jobs just to increase the feature count.

## 18.11 Progress page

P1:

- attempts per skill,
- best score,
- most recent score,
- category trend,
- strongest recurring metric,
- weakest recurring metric,
- p50/p95 deviation trend,
- nearest similar prior attempt,
- optional percentile against the app's anonymous demo cohort.

The progress API should prefer continuous aggregates and compact score rows, not raw sample scans.

Do not overclaim that improvement in simulator score equals improved patient outcomes.

---

# 19. UI ROUTES

## `/`

Landing page:

- value proposition,
- short demo visual,
- CTA to library.

## `/library`

Main Surgical Skills Library:

- cards,
- search/filter,
- difficulty,
- source badge,
- availability status,
- progress.

## `/train/[skillId]`

Contains:

- 3D scene,
- small webcam preview,
- calibration,
- mode selection,
- coach messages,
- live progress.

## `/results/[attemptId]`

- scores,
- AI review,
- replay.

## `/progress`

- Tiger-backed history and trends with IndexedDB offline fallback.

## `/dev/reference-recorder`

- hidden/development-only route,
- records canonical reference motion,
- JSON export,
- never exposed in polished navigation unless promoted to P2 instructor mode.

---

# 20. PERFORMANCE BUDGETS

Targets on the team's primary Mac:

```text
3D render: target 55-60 FPS
hand tracking: target 20-30 FPS
visible control latency: target < 120 ms median
camera resolution: 1280x720 ideal
active hands: 2
normal live coaching calls to cloud during attempt: 0
```

Performance rules:

- no React `setState` every tracking frame,
- refs for high-frequency motion,
- R3F `useFrame` for interpolation,
- worker when stable,
- limit shadow-casting lights,
- compress large GLB assets,
- avoid giant textures,
- preload critical models and reference JSON before attempt begins.

Add a debug HUD behind `?debug=1` showing:

- render FPS,
- tracking FPS,
- worker inference time,
- hand confidence,
- pinch ratios,
- current segment,
- current path deviation,
- audio state.

---

# 21. PRIVACY, SAFETY, AND SECURITY

## 21.1 Webcam and data privacy

Default architecture:

```text
raw webcam frames remain in browser
```

Tiger Data receives:
- anonymous/session IDs,
- skill/mode metadata,
- compact virtual-tool motion samples,
- derived metric samples,
- performance vectors,
- coaching events,
- generated review text.

Tiger Data does **not** receive raw camera frames by default.

Backboard receives only deterministic metrics, selected Tiger retrieval context, and event summaries.

ElevenLabs receives only text to synthesize.

Use anonymous identifiers by default. Do not collect names, medical records, diagnoses, or patient data for the hackathon demo.

## 21.2 API keys

All external keys remain server-side.

Never include keys in:

- browser JavaScript,
- public environment variables,
- client-side network calls directly to privileged endpoints,
- git.

## 21.3 Product language

Use phrases like:

- educational simulation,
- motion-training prototype,
- simulated performance metrics,
- expert reference trajectory.

Avoid:

- certified surgeon score,
- clinical competency,
- safe to perform surgery,
- diagnostic assessment.

---

# 22. TEST STRATEGY

## 22.1 Unit tests

Vitest coverage should prioritize deterministic math.

Required:

- coordinate transforms,
- mirror mapping,
- pinch hysteresis,
- One Euro filter behavior,
- quaternion angle difference,
- segment resampling,
- path length,
- path similarity,
- smoothness/jerk,
- scoring bounds,
- sequencing,
- category aggregation,
- Zod AI response parsing.

## 22.2 Fixture-driven integration

Create prerecorded landmark/tool fixtures.

Feature flag:

```text
?fixture=needle-pass-good
?fixture=needle-pass-late-rotation
```

This lets the full application run without a webcam and is also the emergency demo fallback.

## 22.3 End-to-end tests

Playwright:

- library opens,
- skill route loads,
- fixture calibration bypass works,
- attempt completes,
- results render,
- replay opens,
- AI-disabled fallback review renders.

Cloud APIs should be mocked in automated E2E tests.

## 22.4 Tiger Data integration tests

Required SQL/integration coverage:

- migration applies cleanly to an empty Tiger development service/fork,
- migration re-run is safe according to the chosen migration strategy,
- synthetic attempt batch inserts metadata plus motion/metric samples,
- progress continuous aggregate returns expected synthetic results,
- p95 deviation query returns expected ordering,
- `vector(20)` similarity ranks the intended nearest fixture first,
- BM25 search returns the intended seeded coaching document,
- retention/columnstore policies exist where enabled,
- app APIs degrade cleanly when the database is unreachable.

When Tiger forks are available, AI-generated schema/index changes should be tested on a fork before the shared development service.

## 22.5 Manual QA matrix

Test:

- bright room,
- moderate room,
- sleeves versus bare arms,
- hands crossing,
- one hand temporarily leaving frame,
- fast gesture,
- slow gesture,
- partial pinch,
- repeated pinch,
- network disconnected after app load.

---

# 23. FALLBACKS

## Two-hand tracking is unstable

- simplify left-hand rotation,
- left hand controls position + pinch only,
- right hand retains full position + rotation.

## Depth is unstable

- clamp depth heavily,
- use discrete zones,
- redesign task as mostly planar.

## Rotation flips

- clamp axes,
- reject large frame-to-frame quaternion jumps,
- hold previous orientation during low confidence.

## Needle/tissue interaction breaks

- switch to checkpoint-driven guided arc rather than physics.

## Tiger Data fails

- keep the active attempt, score, and replay fully local,
- store the completed attempt in IndexedDB with `cloudSyncStatus = "failed"`,
- retry sync later,
- fall back to local recent history on the progress page.

Tiger Data failure must never block training, deterministic scoring, or replay.

## Backboard fails

- deterministic review from strongest/weakest metrics.

## ElevenLabs fails

- text feedback always remains,
- browser `speechSynthesis` fallback.

## 3D asset fails

- use primitive geometry fallback.

## Camera fails during judging

- run a saved fixture through the same evaluation/replay pipeline.

## External dataset is unavailable or cannot legally be deployed

- use internal reference recorder,
- clearly label it as a prototype reference,
- keep the dataset adapter implemented for future validated data.

---

# 24. TWO-PERSON OWNERSHIP MODEL

Two developers should work in parallel with minimal file collisions.

## Person A - Realtime Vision and 3D Simulation

Primary ownership:

```text
src/workers/
src/lib/vision/
src/lib/filters/
src/lib/simulation/
src/lib/exercise/
src/components/camera/
src/components/scene/
src/components/training/3d-*
```

Responsibilities:

- webcam,
- MediaPipe,
- calibration,
- pinch,
- hand identity,
- One Euro filter,
- hand-to-tool mapping,
- operating room,
- instruments,
- task interaction,
- ghost renderer,
- 3D replay renderer,
- realtime performance tuning.

## Person B - Data, Evaluation, Tiger Data, Product, AI and Voice

Primary ownership:

```text
src/types/
src/lib/references/
src/lib/motion/
src/lib/evaluation/
src/lib/coaching/
src/lib/ai/
src/lib/voice/
src/lib/db/
src/lib/storage/
db/
scripts/tiger/
src/components/library/
src/components/results/
src/components/replay/controls-*
src/app/api/
src/data/
scripts/data/
scripts/audio/
```

Responsibilities:

- shared contracts,
- dataset adapters,
- reference-motion format,
- evaluator,
- skill directory,
- modes and result logic,
- Tiger Data schema, migrations, hypertables, aggregates, search, and similarity,
- cloud progress persistence with IndexedDB fallback,
- Tiger MCP/fork workflow,
- Backboard integration,
- ElevenLabs integration,
- review schema,
- deterministic fallback review.

## Shared files

These require coordination:

```text
src/store/training-store.ts
src/app/train/[skillId]/page.tsx
docs/CONTEXT.md
docs/DECISIONS.md
docs/TIGER_DATA.md
package.json
```

Person B is the default contract owner for `src/types/`. Person A proposes contract changes before editing those files.

---

# 25. BRANCH AND AI-AGENT WORKFLOW

## 25.1 Branches

Recommended:

```text
main
person-a/realtime
person-b/platform
integration/<milestone>
```

If AI assistants are used heavily, use worktrees or separate branches per task.

Example:

```text
ai/A2-control-mapping
ai/B3-evaluator
```

## 25.2 Commit rule

One coherent task per commit where possible.

Examples:

```text
A1: add MediaPipe hand tracking worker
A2: add calibrated pinch and rotation mapping
B2: convert LASK reference to canonical motion schema
B0: add Tiger Data schema and migration runner
B3: add path and orientation evaluation metrics
B10: sync attempts and progress through Tiger hypertables
S2: integrate needle-passing end-to-end flow
```

## 25.3 Merge checkpoints

Do not wait until the end to integrate.

Merge/integrate at:

- M1 tracking contract,
- M2 tool control + reference schema,
- M3 first exercise,
- M4 evaluation + replay,
- M5 AI + voice,
- M6 library expansion.

---

# 26. DETAILED TASK PLAN

The task IDs below are designed to be handed directly to coding agents.

---

## S0 - Repository bootstrap and contracts

**Owner:** Both, Person B edits shared types  
**Depends on:** none  
**Priority:** P0

### Work

- Create Next.js project.
- Install dependencies.
- Enable TypeScript strict mode.
- Add scripts: `typecheck`, `test`, `test:e2e`.
- Create repository structure.
- Create initial shared types.
- Create `docs/CONTEXT.md` from Section 4 template.
- Create licensing docs.
- Create `docs/TIGER_DATA.md`.
- Add raw dataset directories to `.gitignore`.
- Add `.env.example`.
- Add health page or API health route.

### Acceptance

```bash
npm run typecheck
npm run lint
npm run build
```

all pass.

`docs/CONTEXT.md` exists and lists ownership.

---

## A1 - Webcam and MediaPipe hand detection

**Owner:** Person A  
**Depends on:** S0  
**Priority:** P0

### Output

- webcam component,
- two-hand detection,
- debug skeleton overlay,
- current hand data stored in refs,
- stable hand ID helper.

Implementation surface: `/dev/hand-tracking?debug=1` (development only), reusable
camera hook/controller, worker with main-thread fallback, and raw observation types
owned by Person A. See `docs/HAND_TRACKING.md` for setup, interfaces and manual QA.

### Acceptance

- both hands visible in debug overlay,
- tracking continues for 2 minutes without app crash,
- no React render loop caused by landmark updates,
- current tracking FPS displayed in debug mode.

---

## B0 - Tiger Data bootstrap, MCP, and base migrations

**Owner:** Person B  
**Depends on:** S0  
**Priority:** P0

### Work

- Create a Tiger Cloud service.
- Verify PostgreSQL/TimescaleDB versions.
- Enable/verify `timescaledb`, `vectorscale`, and `pg_textsearch`.
- Install/configure Tiger CLI.
- Configure Tiger MCP or pg-aiguide for the AI coding assistants.
- Add `postgres` server-side client.
- Create `db/migrations/`.
- Implement migration runner.
- Create core relational tables plus initial hypertables.
- Add `/api/health` database check.
- Add `docs/TIGER_DATA.md`.
- If the plan supports forks, define the fork-first workflow for AI-generated migrations.
- Seed one skill and one synthetic attempt.

### Acceptance

- `scripts/tiger/verify.ts` connects successfully.
- migrations are idempotent or safely versioned.
- one synthetic attempt can be inserted and queried.
- browser bundle contains no database credentials.
- AI assistants can query current Tiger/Postgres docs through MCP.
- `docs/CONTEXT.md` records service setup and enabled features.

---

## B1 - Skill library schema and product shell

**Owner:** Person B  
**Depends on:** S0  
**Priority:** P1 but start early

### Output

- `SkillDefinition`,
- initial skill metadata,
- `/library`,
- mode selector,
- stub training route,
- source/license badges.

### Acceptance

- all four planned skills appear,
- unavailable references can be marked "coming soon" without breaking navigation,
- route is data-driven.

---

## A2 - Calibration, pinch, rotation, smoothing

**Owner:** Person A  
**Depends on:** A1  
**Priority:** P0

### Output

- calibration flow,
- One Euro filter,
- pinch hysteresis,
- palm rotation quaternion,
- depth proxy,
- tracking-loss grace,
- hand-to-tool target transforms.

Implementation surface: reusable `useHandControls(tracking)` and deterministic
vision/filter modules, with guided calibration and target visualization in the
existing development-only `/dev/hand-tracking?debug=1` preview. Shared schemas are
unchanged. A3 owns real instrument meshes, tips, held objects and display-frame
interpolation. Setup, interface semantics and physical QA are maintained in
`docs/HAND_TRACKING.md`.

### Acceptance

- pinch does not chatter near threshold,
- instrument target does not visibly vibrate when hand is steady,
- hand leaving frame briefly does not drop held object,
- left/right assignment is stable during normal movement.

---

## B2 - Reference motion adapter framework

**Owner:** Person B  
**Depends on:** S0  
**Priority:** P0

### Output

- `ReferenceMotion` schema,
- loader,
- validator,
- canonical scene coordinate rules,
- fixture reference JSON,
- Python adapter skeletons for JIGSAWS and LASK.

### Acceptance

- fixture reference loads in browser,
- schema validation rejects malformed data,
- scripts can produce a reference JSON from a synthetic CSV.

---

## A3 - 3D operating room and virtual tools

**Owner:** Person A  
**Depends on:** A2  
**Priority:** P0

Implementation is available in the development-only tracking preview. A numerical
simulation controller consumes A2 controls once per source sample, publishes real
shared ToolState tips, and owns the practice needle through deterministic
grab/release. Both tools freeze when either control becomes ineligible. The scene
uses procedural geometry and separate 40/s display interpolation, with no shared
schema changes or additional camera acquisition. A4/A5 and product-route
integration remain separate. See `docs/SIMULATION.md` for API/lifecycle semantics,
automated coverage and outstanding target-Mac acceptance; availability does not
constitute physical performance signoff.

### Output

- R3F scene,
- fixed camera,
- two tool objects,
- tissue/target area,
- target transforms from hand controls,
- basic grab/release behavior.

### Acceptance

- tools move smoothly from hand targets,
- render remains near 60 FPS on target Mac,
- pinch controls jaws/grip,
- no obvious orientation flips during the planned motion range.

---

## B3 - Core evaluation engine

**Owner:** Person B  
**Depends on:** B2  
**Priority:** P0

### Output

Implement first 8 metrics:

- path similarity,
- target accuracy,
- orientation accuracy,
- path efficiency,
- smoothness,
- speed profile,
- segment timing,
- procedural sequencing.

Also build:

- resampling,
- metric result evidence timestamps,
- category aggregation,
- synthetic fixtures.

### Acceptance

- perfect fixture scores clearly above perturbed fixtures,
- late-rotation fixture specifically lowers orientation/rotation-related score,
- all results deterministic,
- unit tests pass.

---

## A4 - First complete exercise state machine

**Owner:** Person A  
**Depends on:** A3 + skill contract from B1  
**Priority:** P0

Implementation is available in `src/lib/exercise/` (`needle-passing-config.ts`,
`exercise-controller.ts`), `src/components/scene/exercise-targets.tsx`,
`src/components/scene/training-scene.tsx`, and `src/components/training/3d-training-preview.tsx`
on the development preview surface. `ExerciseController` validates against
`needlePassingSkill`, sequences all 8 segments (`approach -> grip -> align -> entry ->
rotation -> exit -> release -> complete`) across `ring-1`, `ring-2`, `ring-3` and
`release-zone` above the `tissue-wall` danger zone, guards against un-held/out-of-order
or early-release completion, exposes `Learn`/`Practice`/`Assessment` `ModeBehaviorHooks`
(with Assessment hiding ghost/coaching hooks), and records canonical `MotionFrame`
samples compatible with B3's `evaluateAttempt`. See `docs/SIMULATION.md`.

### Target

Needle Passing or Peg Transfer. If JIGSAWS licensing/data access is unresolved, Peg Transfer using LASK or internal reference is the cleanest public-data path.

### Output

- all exercise segments,
- target/danger zones,
- completion logic,
- progress reporting,
- Learn/Practice/Assessment behavior hooks.

### Acceptance

- user can complete the task from calibration to completion,
- invalid actions do not accidentally complete later segments,
- assessment mode hides ghost hooks.

---

## B4 - External data conversion

**Owner:** Person B  
**Depends on:** B2  
**Priority:** P0/P1

### Work

- confirm data license/access status,
- implement LASK converter first if available,
- implement JIGSAWS converter if access and use are cleared,
- choose expert/reference attempts,
- transform into canonical coordinates,
- resample,
- smooth display copy,
- output attribution metadata.

### Acceptance

- reference JSON passes validator,
- trajectory renders sensibly in a simple debug viewer,
- no raw restricted data committed,
- `DATA_LICENSES.md` updated.

---

## A5 - Ghost renderer

**Owner:** Person A  
**Depends on:** A3 + B2 reference schema  
**Priority:** P0

Implementation is available in `src/lib/exercise/ghost-reference.ts`,
`src/lib/exercise/ghost-playback.ts`, `src/components/scene/ghost-layer.tsx`,
`src/components/scene/training-scene.tsx`, and `src/components/training/3d-training-preview.tsx`.
`GhostPlaybackController` interpolates 30 Hz `ReferenceMotion` frames at display
refresh rate via linear position `lerp` and shortest-path quaternion `slerp`,
resolves grip poses so translucent instrument tips match `tipPosition` on the
path trail, supports `0.5x` and `1x` playback speeds plus `demonstration`,
`progress-coupled` (12% lead + 600 ms stall micro-loop), and `continuous` sync
modes, strictly hides ghost visuals in `Assessment` mode, and provides runtime
workspace fitting + gesture mapping for B4's JIGSAWS `Needle_Passing_E005` expert
reference with Gao et al. (2014) attribution. See `docs/SIMULATION.md`.

### Output

- translucent tool playback,
- path trail,
- reference frame interpolation,
- demonstration playback,
- show/hide controls,
- progress-coupled mode hook.

### Acceptance

- no visible 30 Hz stepping,
- rotations interpolate smoothly,
- ghost path matches reference JSON,
- ghost can replay at 0.5x and 1x.

---

## B5 - Complete 20-metric evaluator

**Owner:** Person B  
**Depends on:** B3 + A4 exercise events  
**Priority:** P1

### Output

Implement remaining metrics, skill-specific weights, worst-moment extraction, category scoring, and score explanations.

### Acceptance

- all 20 fields populated,
- all scores 0-100,
- metrics have tests for expected direction,
- no metric is mislabeled as medically validated if it is simulator-specific.

---

## S1 - First end-to-end integration

**Owner:** Both  
**Depends on:** A4 + A5 + B3 + B4  
**Priority:** P0

Implementation handoff (2026-10-17): S1 now uses the shared `TrainingRuntime` on
`/train/needle-passing` and the development preview, with animated 30 Hz fixtures,
once-per-attempt results, exact tissue-wall evaluator boxes, B6 text/event wiring,
and asynchronous local IndexedDB saving. The scoring reference remains synthetic
and independent of optional ghost display data. See `docs/SIMULATION.md` for reset,
failure, cache, and manual acceptance semantics. A6/B7/B8/B9/B10 remain separate tasks.

### Goal

One skill works with webcam, tool control, ghost, recording, and deterministic results before any cloud AI is required.

### Acceptance

- fresh page load,
- calibration,
- ghost demo,
- complete attempt,
- evaluator runs,
- result object is produced,
- no uncaught errors,
- fixture mode also works.

Do not move forward if this milestone is unstable.

---

## B6 - Live coaching event engine

**Owner:** Person B  
**Depends on:** B3/B5  
**Priority:** P0

### Output

- threshold rules,
- event suppression,
- cooldown,
- severity,
- event recording,
- text message selection.

### Acceptance

- intentional large path deviation generates one event,
- same issue does not spam repeatedly,
- corrected issue can cancel queued coaching.

---

## B7 - ElevenLabs integration

**Owner:** Person B  
**Depends on:** B6  
**Priority:** P0

### Output

- pre-generation script,
- local coaching clips,
- `/api/speech`,
- audio manager,
- browser speech fallback.

### Acceptance

- common correction plays immediately from local asset,
- final dynamic phrase can be generated,
- no API key appears in browser bundle/network request body,
- overlapping audio is prevented.

---

## A6 - Attempt recording and 3D replay renderer

**Owner:** Person A  
**Depends on:** A4 + A5  
**Priority:** P0

Implementation baseline: S1 PR #12 is merged on main `a1f1c2a`. A6 extends the
existing `TrainingRuntime`, recorder, fixtures, and inline product surface; it
preserves S1's evaluation/cache contracts and uses the exact canonical reference
adapted for the attempt. See `docs/A6_PLAN.md` for the revised bounded plan and
`docs/SIMULATION.md` for the replay cursor/renderer handoff. Needle/visibility
sidecars and exact reference snapshots are memory-only in this chunk.

### Output

- user motion recorder,
- visual replay smoothing,
- dual user/reference rendering,
- path lines,
- replay cursor API.

### Acceptance

- completed attempt can be replayed without webcam,
- expert and user remain correctly aligned to scene,
- replay can seek to a supplied timestamp/progress marker.

---

## B8 - Replay controls and results UI

**Owner:** Person B  
**Depends on:** A6 + B5  
**Priority:** P0

### Output

- score summary,
- expandable metrics,
- replay controls,
- worst-moment buttons,
- AI review placeholder/fallback.

### Acceptance

- user can jump to top 3 issues,
- metric evidence is visible,
- results page is understandable without reading all 20 metrics.

---

## B9 - Backboard + Gemini integration

**Owner:** Person B  
**Depends on:** B8  
**Priority:** P0

### Output

- model verification script or setup check,
- review route,
- Tiger BM25 retrieval hook for skill/error-specific coaching context,
- optional similar-attempt context from pgvectorscale,
- Zod output validation,
- deterministic fallback,
- token/cost debug logging if available.

### Acceptance

- review uses only supplied measurements plus explicitly retrieved Tiger coaching context,
- Tiger retrieval failures degrade gracefully to metrics-only review,
- malformed AI response does not crash page,
- feature can be disabled without blocking results,
- Backboard memory remains off by default.

---

## S2 - AI-narrated replay integration

**Owner:** Both  
**Depends on:** A6 + B7 + B9  
**Priority:** P0

### Output

- replay automatically focuses on largest difference,
- narration describes the supplied evidence,
- user can skip narration,
- audio and replay do not conflict.

### Acceptance

A judge can intentionally perform a bad movement and see/hear the system explain the same mistake afterward.

---

## B10 - Tiger persistence, time-series analytics, and progress

**Owner:** Person B  
**Depends on:** B0 + B5 + B8  
**Priority:** P1

### Output

- `/api/attempts` batch-ingest route,
- Tiger persistence for attempt metadata, 20D score vectors, motion/metric samples, and coaching events,
- IndexedDB sync queue/fallback,
- `attempt_scores` hypertable,
- progress continuous aggregate,
- motion-quality continuous aggregate,
- Hypercore/columnstore policy,
- progress queries,
- `/progress` page.

### Acceptance

- attempts survive refresh and a second browser session through Tiger Data,
- live training still works when Tiger is unreachable,
- failed cloud writes remain queued locally,
- progress query uses aggregate/score tables rather than scanning raw motion rows,
- current user can delete their anonymous attempt history,
- migration and representative queries are documented in `docs/TIGER_DATA.md`.

---

## B12 - Tiger search, vector similarity, and hyperfunction analytics

**Owner:** Person B  
**Depends on:** B10 + B9  
**Priority:** P1

### Output

- `pgvectorscale` DiskANN index over `vector(20)` performance profiles,
- similar-attempt API/query,
- `pg_textsearch` BM25 index over coaching/skill documents,
- error-to-coaching-document retrieval,
- p50/p95 motion deviation queries with `percentile_agg`,
- time-weighted deviation query,
- LTTB or ASAP downsampled progress/replay chart endpoint,
- retention policy,
- optional custom maintenance job.

### Acceptance

- current attempt can retrieve nearest prior attempts within the same skill,
- BM25 retrieves the expected coaching document for known seeded queries,
- Backboard review can cite/use retrieved internal coaching context without changing deterministic scores,
- p95 deviation and time-weighted analytics are covered by SQL tests/fixtures,
- downsampled chart returns substantially fewer points while preserving visible peaks,
- no feature is added solely for sponsor-name padding.

---

## A7 - Additional skill scene configs

**Owner:** Person A  
**Depends on:** stable generic exercise engine  
**Priority:** P1

### Output

Scene/interactions for additional skills without duplicating the entire runtime.

### Acceptance

At least two skills use the same generic engine with different config/reference data.

---

## B11 - Additional reference motions and skill configs

**Owner:** Person B  
**Depends on:** B4 + B5  
**Priority:** P1

### Output

- additional references,
- metric weights,
- segment definitions,
- attribution.

### Acceptance

Library cards launch functional or clearly marked unavailable exercises.

---

## S3 - Reliability and performance pass

**Owner:** Both  
**Priority:** P0 before final demo

### Checklist

- test target Mac,
- target Chrome,
- good lighting,
- average lighting,
- repeated hand crossing,
- 10 consecutive attempts,
- network unavailable after initial load,
- Tiger Data unavailable,
- pending IndexedDB-to-Tiger sync retry,
- Backboard failure,
- ElevenLabs failure,
- fixture mode,
- `npm run build`.

No demo-blocking error may be knowingly left without a fallback.

---

## S4 - Final polish

**Owner:** Both  
**Priority:** P1

### Work

- improve loading states,
- improve scene lighting,
- remove debug UI by default,
- tune thresholds,
- prepare attributions,
- tighten copy,
- record backup demo video,
- rehearse exact judge path.

---

# 27. MILESTONES

## M0 - Foundation

- repo builds,
- context doc exists,
- shared types exist,
- Tiger Cloud development service and migrations are reachable.

## M1 - Hand tracking

- two stable hands,
- pinch,
- rotation,
- calibration.

## M2 - Tool control

- two virtual instruments respond smoothly.

## M3 - First complete skill

- exercise can be completed without ghost/evaluation.

## M4 - Expert comparison

- reference motion loads,
- ghost works,
- user motion records,
- evaluator produces meaningful scores.

## M5 - Replay

- expert and user replay together,
- worst moments are visible.

## M6 - AI and voice

- live coaching,
- Backboard review,
- ElevenLabs narration.

## M7 - Platform

- library,
- modes,
- Tiger-backed progress,
- continuous aggregates,
- BM25 coaching retrieval,
- similar-attempt vector search,
- multiple skills.

## M8 - Demo hardening

- stable 10-run demo,
- fallbacks tested,
- polished judge flow.

---

# 28. RECOMMENDED TWO-PERSON SEQUENCE

The exact hours depend on the hackathon schedule. Use this sequence rather than assuming one fixed duration.

## Block 1 - Shared setup

Both:

- S0
- agree on contracts
- create context doc
- acquire initial 3D assets and datasets

## Block 2 - First parallel build

Person A:

- A1
- A2
- A3

Person B:

- B0
- B1
- B2
- B3

## Block 3 - First real skill

Person A:

- A4
- A5

Person B:

- B4
- extend B3

Then both:

- S1 immediately

## Block 4 - Intelligence and replay

Person A:

- A6

Person B:

- B6
- B7
- B8
- B9

Then both:

- S2

## Block 5 - Expansion

Person A:

- A7
- scene polish

Person B:

- B10
- B11
- B12
- full B5 metrics

## Block 6 - Hardening

Both:

- S3
- S4

Never sacrifice S3 reliability for one more incomplete skill.

---

# 29. TASK PROMPT TEMPLATE FOR AI CODING ASSISTANTS

Copy this prompt and replace the bracketed fields.

```text
You are implementing task [TASK_ID] in the Surgical Motion Trainer repository.

BEFORE WRITING CODE:
1. Read docs/IMPLEMENTATION_PLAN.md completely enough to understand the subsystem.
2. Read docs/CONTEXT.md.
3. Inspect the existing shared contracts in src/types/.
4. If the task touches persistence, read docs/TIGER_DATA.md and current db/migrations.
5. If Tiger MCP is configured, use it for current Postgres/Timescale guidance rather than guessing syntax.
6. Do not modify files outside the task ownership unless strictly required.

TASK GOAL:
[goal]

OWNED FILES/DIRECTORIES:
[list]

INPUT CONTRACTS:
[list]

OUTPUT CONTRACTS:
[list]

REQUIRED BEHAVIOR:
[list]

ACCEPTANCE CRITERIA:
[list]

CONSTRAINTS:
- TypeScript strict mode.
- No secrets client-side.
- No raw webcam upload.
- No per-frame React state updates.
- No generative AI for geometric correctness.
- Preserve demo fallbacks.
- Do not refactor unrelated code.

IMPLEMENTATION PROCESS:
1. Briefly state your plan.
2. Implement the smallest working version.
3. Add/update tests.
4. Run typecheck, lint, relevant unit tests, and build if feasible.
5. Fix failures before declaring completion.
6. Update docs/CONTEXT.md with current state, files changed, known issues, and next unblocked task.

AT COMPLETION REPORT:
- task ID,
- files changed,
- tests run and results,
- acceptance criteria status,
- context update status,
- known issues/fallbacks.
```

---

# 30. DEMO FLOW TO BUILD TOWARD

The final implementation should optimize for this exact judge experience.

1. Open `/library`.
2. Choose **Needle Passing** or **Peg Transfer**.
3. Show source badge: reference derived from expert surgical-training kinematics where licensing permits.
4. Select Learn mode.
5. Calibrate both hands in 2-4 seconds.
6. Show a smooth translucent expert demonstration.
7. Judge/user performs the movement.
8. Intentionally make one clear error, for example late rotation or path overshoot.
9. ElevenLabs gives one concise live correction.
10. Finish the task.
11. Results appear immediately.
12. Show category scores and the relevant low metric.
13. Open replay.
14. Expert ghost and user movement play together.
15. Replay slows/pauses at the largest deviation.
16. ElevenLabs narrates Backboard/Gemini's evidence-grounded explanation.
17. Return to library to show that the engine supports multiple skills and modes.

The demo must communicate that the core achievement is not the operating-room model. It is the full motion-intelligence loop:

```text
observe -> map -> teach -> measure -> compare -> explain
```

---

# 31. DEFINITION OF DONE

## P0 release is done when

- latest Chrome on target Mac can complete 10 consecutive attempts without a blocking crash,
- hand tracking feels responsive enough for deliberate movement,
- pinch is reliable,
- ghost is visibly smooth,
- at least one exercise works end-to-end,
- scoring changes in the expected direction when deliberate mistakes are introduced,
- replay clearly visualizes the same mistake,
- live coaching does not spam,
- AI review is grounded in metrics,
- AI and voice have fallbacks,
- fixture demo works without webcam/network-dependent scoring,
- dataset/asset attributions are documented,
- `npm run build` passes.

## P1 release is done when

- library supports multiple skills,
- Learn/Practice/Assessment modes work,
- 20-metric vector is implemented and tested,
- progress is stored in Tiger Data with IndexedDB fallback,
- at least one Tiger continuous aggregate powers the progress view,
- similar-attempt vector retrieval works,
- BM25 coaching retrieval works,
- at least two distinct exercises use the generic engine,
- expert envelope is supported where multiple reference attempts exist.

---

# 32. EXTERNAL TECHNICAL REFERENCES

These are reference links for implementation agents. Verify APIs again if documentation changes.

## Tiger Data

- Main docs: https://www.tigerdata.com/docs
- Feature comparison: https://www.tigerdata.com/docs/get-started/feature-comparison
- Hypertables: https://www.tigerdata.com/docs/reference/timescaledb/hypertables
- Continuous aggregates: https://www.tigerdata.com/docs/reference/timescaledb/continuous-aggregates
- Hyperfunctions: https://www.tigerdata.com/docs/build/data-management/hyperfunctions
- Hypercore/columnstore: https://www.tigerdata.com/docs/learn/columnar-storage/understand-hypercore
- Data lifecycle/retention: https://www.tigerdata.com/docs/learn/data-lifecycle
- Hybrid BM25 + vector search: https://www.tigerdata.com/docs/learn/tutorials/hybrid-search
- pg_textsearch: https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-aws/tiger-cloud-extensions/pg-textsearch
- Tiger MCP/Agentic Postgres overview: https://www.tigerdata.com/blog/postgres-for-agents
- Tiger CLI/MCP changelog: https://www.tigerdata.com/docs/get-started/news/new

Important: verify the exact service plan and extension versions at implementation time. Core behavior must not depend on a paid-only feature.

## Backboard

- Send Message endpoint: https://docs.backboard.io/api-reference/threads/send-message
- Messages concept: https://docs.backboard.io/concepts/messages
- Models API: https://docs.backboard.io/concepts/models

Implementation note: `POST /threads/messages` supports `llm_provider`, `model_name`, `memory`, and `json_output`. The Models API can filter by provider/capability and should be used to confirm the exact Gemini 2.5 Flash model name available to the account.

## MediaPipe

- Google AI Edge Hand Landmarker documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
- API concepts include multiple-hand configuration, normalized landmarks, world landmarks, handedness, video/live-stream modes.

## ElevenLabs

- Models: https://elevenlabs.io/docs/overview/models
- Streaming TTS: https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/streaming
- `eleven_flash_v2_5` is intended for low-latency interactive TTS.

## Expert motion data

- JIGSAWS: https://cirl.lcsr.jhu.edu/research/hmm/datasets/jigsaws_release/
- LASK: https://github.com/omariosc/LASK
- SHANDS CVPR 2026: https://openaccess.thecvf.com/content/CVPR2026/html/Ma_SHands_A_Multi-View_Dataset_and_Benchmark_for_Surgical_Hand-Gesture_and_CVPR_2026_paper.html

## Browser motion-capture implementation reference

- PuppetMaster Devpost: https://devpost.com/software/puppetmaster

Useful PuppetMaster patterns include timestamped frame recording, GPU MediaPipe, ref-based animation state, `requestAnimationFrame` playback, and centered temporal smoothing for recorded motion.

---

# 33. FINAL ARCHITECTURE SUMMARY

```text
                             SURGICAL SKILLS LIBRARY
                                      |
                            SkillDefinition + mode
                                      |
                                      v
Laptop webcam -> MediaPipe Hand Landmarker -> calibration -> One Euro filter
                                      |
                                      v
                         hand-to-tool mapping
                                      |
                                      v
                React Three Fiber surgical training scene
                     |                         |
                     |                         +-> expert reference ghost
                     |                             from canonical motion data
                     v
              user tool motion
                     |
          +----------+----------+
          |                     |
          v                     v
 exercise state machine     motion recorder
          |                     |
          v                     v
 deterministic coaching     segment alignment
          |                     |
          v                     v
 ElevenLabs voice          20-metric evaluator
                                |
                   +------------+-------------+
                   |                          |
                   v                          v
           immediate local results      Tiger Data sync
                                              |
                           +------------------+-------------------+
                           |                  |                   |
                           v                  v                   v
                    hypertables +       vector(20) +        BM25 lesson/
                    Hypercore           pgvectorscale       coaching search
                           |                  |                   |
                           v                  v                   v
                    continuous aggs     similar attempts      grounded context
                    + hyperfunctions           \              /
                           |                    \            /
                           +---------------------+----------+
                                                 |
                                                 v
                                         Backboard/Gemini
                                                 |
                                                 v
                                        ElevenLabs review
                     expert/user 3D replay
                                |
                                v
                  Backboard + Gemini 2.5 Flash
                                |
                                v
                     ElevenLabs final narration
                                |
                                v
                       local progress history
```

The project should remain understandable even if all external AI services are turned off. The motion-training, ghost, evaluation, and replay engine are the core product. Backboard and ElevenLabs make that engine easier to understand and more engaging, but they are not the source of truth for whether a movement was correct.
