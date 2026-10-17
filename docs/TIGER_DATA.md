# Tiger Data Project Context

Last updated: 2026-10-16 23:14
Updated by: repo bootstrap

## 1. Service Status
- Tiger project ID:
- Tiger service ID:
- PostgreSQL version:
- TimescaleDB version:
- Service plan/free vs standard:
- Region:
- Current migration version:
- Cloud sync smoke test:
- Optional fork support available: yes/no/unknown

Never put a database password, API secret, or full connection string in this file.

## 2. Required Extensions
- timescaledb: verified/not verified
- vectorscale: verified/not verified
- pg_textsearch: verified/not verified
- timescaledb_toolkit/hyperfunctions: verified/not verified

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
- Recent telemetry stays queryable for replay/history.
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
- time_bucket:
- percentile_agg / approx_percentile:
- time_weight:
- state tracking:
- lttb/asap_smooth:

## 7. Policies / Jobs
- Continuous aggregate refresh:
- Columnstore:
- Retention:
- Custom jobs:
- Last verified:

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
- Demo fallbacks:
