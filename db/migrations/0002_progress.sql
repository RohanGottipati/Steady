-- B10: progress analytics — continuous aggregates + Hypercore columnstore policies.
-- Retention policies and vector/BM25 indexes come later (B12). Written to be
-- idempotent so `npm run db:migrate` can re-run safely.

-- Per-user, per-skill daily progress (plan 18.4). Precomputes dashboard rows so
-- longer-horizon rollups never scan raw motion samples. The live /api/progress
-- page reads attempt_scores directly so just-synced attempts appear immediately.
create materialized view if not exists user_skill_daily_progress
with (timescaledb.continuous) as
select
  time_bucket('1 day', completed_at) as bucket,
  anonymous_user_id,
  skill_id,
  count(*) as attempts,
  avg(overall_score) as avg_score,
  max(overall_score) as best_score,
  avg(precision_score) as avg_precision,
  avg(control_score) as avg_control,
  avg(technique_score) as avg_technique,
  avg(coordination_score) as avg_coordination,
  avg(efficiency_safety_score) as avg_efficiency_safety
from attempt_scores
group by bucket, anonymous_user_id, skill_id
with no data;

-- Per-second motion-quality rollup (plan 18.4) for compact analysis of long
-- attempts. Only base aggregates here; percentile/distribution analytics need
-- the timescaledb_toolkit extension and are deferred to B12 so this migration
-- runs on a stock TimescaleDB instance.
create materialized view if not exists attempt_motion_1s
with (timescaledb.continuous) as
select
  time_bucket('1 second', sampled_at) as bucket,
  attempt_id,
  skill_id,
  avg(path_deviation) as avg_path_deviation,
  max(path_deviation) as max_path_deviation,
  avg(orientation_error_deg) as avg_orientation_error,
  avg(speed) as avg_speed
from metric_samples
group by bucket, attempt_id, skill_id
with no data;

-- Refresh + columnstore policies. add_*_policy raises if one already exists, so
-- each is guarded to keep the migration idempotent.
do $$
begin
  perform add_continuous_aggregate_policy('user_skill_daily_progress',
    start_offset => interval '30 days', end_offset => interval '1 hour',
    schedule_interval => interval '1 hour');
exception when others then null;
end $$;

do $$
begin
  perform add_continuous_aggregate_policy('attempt_motion_1s',
    start_offset => interval '7 days', end_offset => interval '1 minute',
    schedule_interval => interval '15 minutes');
exception when others then null;
end $$;

-- Hypercore: convert older raw telemetry chunks to columnstore (plan 18.8).
-- Hackathon default conversion age of 7 days keeps recent replay reads in rowstore.
do $$
begin
  call add_columnstore_policy('motion_samples', after => interval '7 days');
exception when others then null;
end $$;

do $$
begin
  call add_columnstore_policy('metric_samples', after => interval '7 days');
exception when others then null;
end $$;
