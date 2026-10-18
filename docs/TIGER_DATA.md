# Tiger Data Project Context

Last updated: 2026-10-18
Updated by: B12 search/similarity/analytics (migration 0003 applied live)

## 1. Service Status
- Tiger project ID: p2r9lzrn7s
- Tiger service ID: ort1b0mw86 (name: db-21893)
- PostgreSQL version: 18.6
- TimescaleDB version: 2.30.2
- Service plan/free vs standard: free
- Region: us-east-1
- Current migration version: 0003_search (applied; tracked in `schema_migrations`).
  0001_init, 0002_progress (continuous aggregates + Hypercore columnstore) and
  0003_search (vector/BM25 indexes, retention policies, maintenance job) are all
  applied to the live service. Each migration is idempotent (re-running 0003 raw
  is a no-op and creates no duplicate policies/jobs).
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
- timescaledb_toolkit/hyperfunctions: enabled (1.26.0). Confirmed live during
  B12; `percentile_agg`/`approx_percentile`, `time_weight`, and `lttb` are all
  available, so B12 no longer gates on or defers the toolkit.

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
BM25 (pg_textsearch), added in 0003:
- Index: `skill_documents_bm25_idx` on `skill_documents(content)`
  `using bm25 (content text_bm25_ops) with (text_config = 'english')`.
- Query: `content <@> to_bm25query('terms', 'skill_documents_bm25_idx')` returns a
  NEGATIVE BM25 score for matches and 0 for non-matches, so retrieval filters
  `< 0` and orders ascending (best match first).
- Code: `src/lib/db/search.ts` (`searchCoachingDocuments`). `coaching-retrieval.ts`
  expands weak-metric ids (camelCase → words) into the BM25 query to ground the
  B9 review. Corpus seeded by `db/seeds/0002_coaching_knowledge.sql`.
- Used for skill instructions, error-to-coaching retrieval, and source notes.

Vector similarity (added in 0003):
- Column: `attempt_scores.performance_vector vector(20)`.
- Index: `attempt_scores_vector_idx using diskann (performance_vector vector_cosine_ops)`
  (pgvectorscale StreamingDiskANN).
- Query: `performance_vector <=> q.v` (cosine distance), scoped to the same skill,
  excluding the query attempt, `completed_at < q.completed_at` (prior attempts).
- Code: `src/lib/db/similarity.ts` (`findSimilarAttempts`), `/api/similar-attempts`.
- Similarity meaning: similarity of simulator performance profiles, not clinical equivalence.

## 6. Hyperfunctions in Use
- time_bucket: 0002 daily progress CAGG and per-second motion CAGG.
- percentile_agg / approx_percentile: B12 p50/p95 of per-attempt path deviation
  (`src/lib/db/analytics.ts` → `getAttemptDeviationStats`, `/api/analytics`).
- time_weight ('Linear') + average: B12 time-weighted mean path deviation so
  uneven sampling does not skew the average (same module/route).
- lttb: B12 downsampled deviation series for replay/progress charts
  (`getDownsampledDeviation`, `/api/analytics`) — preserves visible peaks.
- state tracking: not used.

## 7. Policies / Jobs
- Continuous aggregate refresh: defined in 0002 for `user_skill_daily_progress`
  (hourly) and `attempt_motion_1s` (15 min); each `add_*_policy` call is guarded
  so re-running the migration is idempotent.
- Columnstore: 0002 converts `motion_samples`/`metric_samples` chunks older than
  7 days to Hypercore columnstore (guarded, idempotent).
- Retention: 0003 drops `motion_samples` and `metric_samples` chunks older than
  90 days (`add_retention_policy`, guarded). Compact `attempt_scores` vectors and
  the daily CAGG are kept indefinitely.
- Custom jobs: 0003 adds `steady_refresh_search_stats` (daily) — ANALYZEs
  `attempt_scores`, `metric_samples`, `skill_documents` so the DiskANN/BM25/
  percentile queries keep choosing their indexes as data grows.
- Last verified: all three migrations applied and verified live during B12
  (2026-10-18). Two `policy_retention` jobs + one custom job present; re-applying
  0003 creates no duplicates.

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
- similar-attempt query: DiskANN cosine over the synthetic needle-passing set
  ranks the nearest prior attempt first (B002, distance ~0) then 0.00125 / 0.019
  / 0.069 — verified by `tests/unit/b12-tiger-search.test.ts`.
- BM25 query: "movement smoothness jerky trembling" → "Smoothing jerky needle
  motion"; "danger zone collision safety" → "Avoiding danger zones and
  collisions" (known-answer, same test).
- deviation analytics (attempt A, 240 samples): p50 ~0.416, p95 ~0.549, max
  ~3.318, time-weighted avg ~0.429; LTTB → 20 points still carrying the ~3.3 peak.
- largest current table: metric_samples (240 synthetic rows for the demo attempt).
- notes: synthetic analytics rows live under anonymous user
  `00000000-0000-7000-8000-0000000000b1` (isolable from real progress).

## 10. Known Limitations
- Free-plan limitations:
- Pending migration issues:
- Query/index issues:
- Demo fallbacks: training, deterministic scores, and replay stay in the browser when
  Tiger is down. Fixture sessions are not uploaded. S3 did not run a live cloud sync
  smoke test; the route tests use a fake client.
