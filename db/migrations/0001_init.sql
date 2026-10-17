-- B0: core Tiger Data schema (plan 18.3).
-- Relational tables + TimescaleDB hypertables for attempt telemetry.
-- Continuous aggregates, vector/BM25 indexes, and retention come later (B10/B12).

create extension if not exists timescaledb;
create extension if not exists vectorscale cascade; -- pulls in pgvector (vector)
create extension if not exists pg_textsearch;

-- Relational --------------------------------------------------------------

create table if not exists anonymous_users (
  id uuid primary key default uuidv7(),
  created_at timestamptz not null default now()
);

create table if not exists skills (
  id text primary key,
  title text not null,
  difficulty text not null,
  description text not null,
  source_label text,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default uuidv7(),
  anonymous_user_id uuid not null references anonymous_users(id),
  skill_id text not null references skills(id),
  mode text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  duration_ms integer not null,
  overall_score double precision not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists reference_motions (
  id uuid primary key default uuidv7(),
  skill_id text not null references skills(id),
  source_label text not null,
  accuracy_label text not null,
  duration_ms integer not null,
  frames jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists coach_reviews (
  id uuid primary key default uuidv7(),
  attempt_id uuid not null references attempts(id),
  model text not null,
  summary text not null,
  detail_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists skill_documents (
  id uuid primary key default uuidv7(),
  skill_id text not null references skills(id),
  title text not null,
  content text not null,
  source_url text,
  source_type text not null,
  created_at timestamptz not null default now()
);

-- Time-series (hypertables) ----------------------------------------------

create table if not exists motion_samples (
  sampled_at timestamptz not null,
  attempt_id uuid not null,
  skill_id text not null,
  seq integer not null,
  segment text not null,
  left_tool jsonb,
  right_tool jsonb
) with (
  tsdb.hypertable,
  tsdb.partition_column = 'sampled_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'sampled_at desc'
);

create table if not exists metric_samples (
  sampled_at timestamptz not null,
  attempt_id uuid not null,
  skill_id text not null,
  seq integer not null,
  segment text not null,
  path_deviation double precision,
  orientation_error_deg double precision,
  speed double precision,
  jerk double precision,
  grip_error double precision,
  coordination_error double precision
) with (
  tsdb.hypertable,
  tsdb.partition_column = 'sampled_at',
  tsdb.chunk_interval = '1 day',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'sampled_at desc'
);

create table if not exists attempt_scores (
  completed_at timestamptz not null,
  attempt_id uuid not null,
  anonymous_user_id uuid not null,
  skill_id text not null,
  overall_score double precision not null,
  precision_score double precision not null,
  control_score double precision not null,
  technique_score double precision not null,
  coordination_score double precision not null,
  efficiency_safety_score double precision not null,
  performance_vector vector(20) not null
) with (
  tsdb.hypertable,
  tsdb.partition_column = 'completed_at',
  tsdb.chunk_interval = '7 days',
  tsdb.segmentby = 'skill_id,anonymous_user_id',
  tsdb.orderby = 'completed_at desc'
);

create table if not exists coaching_events (
  occurred_at timestamptz not null,
  attempt_id uuid not null,
  skill_id text not null,
  event_type text not null,
  segment text not null,
  severity double precision not null,
  evidence jsonb not null
) with (
  tsdb.hypertable,
  tsdb.partition_column = 'occurred_at',
  tsdb.chunk_interval = '7 days',
  tsdb.segmentby = 'attempt_id',
  tsdb.orderby = 'occurred_at desc'
);
