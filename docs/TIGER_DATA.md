# Tiger Data Project Context

Last updated: 2026-10-18
Updated by: B10 progress rework (migration 0002 added to repo)

## 1. Service Status
- Tiger project ID: p2r9lzrn7s
- Tiger service ID: ort1b0mw86 (name: db-21893)
- PostgreSQL version: 18.6
- TimescaleDB version: 2.30.2
- Service plan/free vs standard: free
- Region: us-east-1
- Current migration version: 0001_init (applied; tracked in `schema_migrations`).
  0002_progress added to repo (continuous aggregates + Hypercore columnstore policies,
  idempotent); not yet applied to the live service — no DB access on this host.
- Cloud sync smoke test: not-run
- Optional fork support available: unknown

Access notes (no secrets here):
- Connection string lives only in the git-crypt-encrypted `.env.local` as `TIGER_DATABASE_URL`.
- Tiger CLI v0.26.0 installed at `C:\Users\david\.local\bin\tiger`; authenticated to project p2r9lzrn7s.
- Master password stored in the Tiger keyring. Retrieve with `tiger service get ort1b0mw86 --with-password`.
- Connectivity check: `tiger db ping ort1b0mw86`. Run SQL with `tiger db query ort1b0mw86 -c "..."`.

Never put a database password, API secret, or full connection string in this file.

## 2. Required Extensions
- timescaledb: enabled (2.30.2)
- vectorscale: enabled (0.9.0) via `0001_init`
- pg_textsearch: enabled (1.5.1) via `0001_init`
- vector (pgvector): enabled (0.8.7, pulled in by vectorscale CASCADE)
- timescaledb_toolkit/hyperfunctions: not verified — not required by 0002. The
  per-second rollup keeps only avg/max aggregates; percentile distributions
  (`percentile_agg`) are deferred to B12, which will gate on the extension.

## 3. Core Data Model
Relational:
- anonymous_users
- skills
- attempts
- reference_motions
- coach_reviews
- skill_documents

Hypertables:
- motion_samples
- metric_samples
- attempt_scores
- coaching_events

Continuous aggregates:
- user_skill_daily_progress
- attempt_motion_1s

## 4. Data Lifecycle
- Active attempt remains browser-local.
- After completion, compact numerical telemetry is batch uploaded.
- Raw webcam frames are never stored.
- IndexedDB is the offline/pending-sync buffer.
- S3 upload is one idempotent row in `attempts` plus one `attempt_scores` vector,
  using the browser's stable anonymous user ID and the existing AttemptUploadPayload
  contract. Identity fields must match the nested result. Server-owned skill metadata
  makes both trainable skills uploadable. `ON CONFLICT (id) DO NOTHING` serializes
  same-ID inserts; only the transaction that inserts the attempt writes a score.
  Duplicates return before writing to the score hypertable. Motion-sample
  hypertables are not filled here. If Tiger is unconfigured or the write fails, the
  route returns 503 and the browser keeps the local attempt.
- Recent telemetry stays queryable for replay/history.
- B10 `/api/progress` reads per-skill aggregates straight from `attempt_scores`
  (never raw motion/metric samples) so a just-synced attempt appears before the
  next CAGG refresh; returns 503 when Tiger is unconfigured/unreachable.
- B10 delete-history (`DELETE /api/attempts`) erases the anonymous user's rows
  across the telemetry/score/attempt tables in one transaction; the client also
  clears its local IndexedDB copies so a later retry cannot resurrect them. The
  anonymous user ID is the device-scoped capability token (no account system).
- Older telemetry converts to Hypercore columnstore according to policy.
- Retention policy:
- Optional tiering policy if plan supports it:

## 5. Search and Retrieval
BM25:
- Index: skill_documents_bm25_idx
- Used for skill instructions, error explanations, and source notes.

Vector similarity:
- Column: attempt_scores.performance_vector vector(20)
- Index: attempt_scores_vector_idx using StreamingDiskANN
- Similarity meaning: similarity of simulator performance profiles, not clinical equivalence.

## 6. Hyperfunctions in Use
- time_bucket: 0002 daily progress CAGG and per-second motion CAGG.
- percentile_agg / approx_percentile: deferred to B12 (needs timescaledb_toolkit).
- time_weight:
- state tracking:
- lttb/asap_smooth:

## 7. Policies / Jobs
- Continuous aggregate refresh: defined in 0002 for `user_skill_daily_progress`
  (hourly) and `attempt_motion_1s` (15 min); each `add_*_policy` call is guarded
  so re-running the migration is idempotent.
- Columnstore: 0002 converts `motion_samples`/`metric_samples` chunks older than
  7 days to Hypercore columnstore (guarded, idempotent).
- Retention:
- Custom jobs:
- Last verified: not applied to live service yet (no DB access on this host).

## 8. AI-Agent Database Workflow
Before schema/query work:
1. Read docs/IMPLEMENTATION_PLAN.md and docs/CONTEXT.md.
2. Use Tiger MCP/pg-aiguide for current Postgres/Timescale guidance when configured.
3. Prefer a Tiger data fork or development service for migrations when available.
4. Apply migration.
5. Run verification queries and EXPLAIN when relevant.
6. Run app tests.
7. Update this file and docs/CONTEXT.md.

## 9. Important Queries / Benchmarks
Record only useful, current information:
- ingest benchmark:
- progress query latency:
- similar-attempt query latency:
- BM25 query latency:
- largest current table:
- notes:

## 10. Known Limitations
- Free-plan limitations:
- Pending migration issues:
- Query/index issues:
- Demo fallbacks: training, deterministic scores, and replay stay in the browser when
  Tiger is down. Fixture sessions are not uploaded. S3 did not run a live cloud sync
  smoke test; the route tests use a fake client.
