-- B12: search, vector similarity, and retention/maintenance.
-- Adds the StreamingDiskANN vector index, the BM25 coaching-document index,
-- raw-telemetry retention policies, and one custom maintenance job.
-- Written to be idempotent so `npm run db:migrate` can re-run safely.

-- Vector similarity (plan 18.5) ------------------------------------------
-- StreamingDiskANN (pgvectorscale) over the 20D performance profiles so the
-- current attempt can find its nearest prior attempts. Cosine distance matches
-- "similar simulator performance profile" (magnitude-insensitive), not clinical
-- equivalence. Built per chunk on the attempt_scores hypertable.
create index if not exists attempt_scores_vector_idx
  on attempt_scores using diskann (performance_vector vector_cosine_ops);

-- Full-text retrieval (plan 18.5) ----------------------------------------
-- BM25 (pg_textsearch) over the coaching corpus so an error/metric query maps to
-- the most relevant coaching document. Single-column index with an english
-- text_config; query with `content <@> to_bm25query('terms')`.
create index if not exists skill_documents_bm25_idx
  on skill_documents using bm25 (content text_bm25_ops)
  with (text_config = 'english');

-- Retention (plan 18.8) --------------------------------------------------
-- Raw per-sample telemetry is only needed for recent replay/analytics. Chunks
-- convert to Hypercore columnstore after 7 days (0002) and are dropped after 90.
-- Compact score vectors and daily aggregates are kept indefinitely. Each policy
-- is added only when `timescaledb_information.jobs` has no matching
-- `policy_retention` for the hypertable, so re-running is a no-op without
-- swallowing unrelated errors (mirrors the custom-job guard below).
do $$
begin
  if not exists (
    select 1 from timescaledb_information.jobs
    where proc_name = 'policy_retention' and hypertable_name = 'motion_samples'
  ) then
    perform add_retention_policy('motion_samples', drop_after => interval '90 days');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from timescaledb_information.jobs
    where proc_name = 'policy_retention' and hypertable_name = 'metric_samples'
  ) then
    perform add_retention_policy('metric_samples', drop_after => interval '90 days');
  end if;
end $$;

-- Custom maintenance job (plan 18.9) -------------------------------------
-- Keep planner statistics on the vector/BM25/analytics tables fresh so the
-- DiskANN, BM25, and percentile queries keep choosing their indexes as data
-- grows. A single daily job rather than per-table autovacuum tuning.
create or replace procedure steady_refresh_search_stats(job_id integer, config jsonb)
language plpgsql as $$
begin
  analyze attempt_scores;
  analyze metric_samples;
  analyze skill_documents;
end;
$$;

do $$
begin
  if not exists (
    select 1 from timescaledb_information.jobs
    where proc_name = 'steady_refresh_search_stats'
  ) then
    perform add_job('steady_refresh_search_stats', schedule_interval => interval '1 day');
  end if;
end $$;
