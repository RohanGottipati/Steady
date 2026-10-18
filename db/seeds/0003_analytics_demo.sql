-- B12 analytics demo data: synthetic attempts + telemetry so vector similarity
-- and percentile/time-weighted/downsample analytics have data to operate on.
-- All rows belong to one isolable synthetic user so they never mix with real
-- progress and can be deleted wholesale. Idempotent: fixed IDs + guards.
-- Fixed timestamps keep the data deterministic for the opt-in integration tests.

insert into anonymous_users (id)
values ('00000000-0000-7000-8000-0000000000b1')
on conflict (id) do nothing;

-- Five needle-passing attempts whose 20D performance vectors differ in
-- direction, so nearest-neighbour ordering by cosine distance is deterministic.
-- A is the most recent ("current attempt"); B is nearly identical to A and must
-- rank as its closest prior attempt; E points in the most different direction.
insert into attempts (id, anonymous_user_id, skill_id, mode, started_at, completed_at, duration_ms, overall_score, result_json)
values
  ('00000000-0000-7000-8000-00000000b001','00000000-0000-7000-8000-0000000000b1','needle-passing','assessment','2026-10-16 12:00:00+00','2026-10-16 12:02:00+00',120000,80.0,'{"synthetic":true}'::jsonb),
  ('00000000-0000-7000-8000-00000000b002','00000000-0000-7000-8000-0000000000b1','needle-passing','assessment','2026-10-15 12:00:00+00','2026-10-15 12:02:00+00',120000,78.0,'{"synthetic":true}'::jsonb),
  ('00000000-0000-7000-8000-00000000b003','00000000-0000-7000-8000-0000000000b1','needle-passing','assessment','2026-10-14 12:00:00+00','2026-10-14 12:02:00+00',120000,74.0,'{"synthetic":true}'::jsonb),
  ('00000000-0000-7000-8000-00000000b004','00000000-0000-7000-8000-0000000000b1','needle-passing','assessment','2026-10-13 12:00:00+00','2026-10-13 12:02:00+00',120000,70.0,'{"synthetic":true}'::jsonb),
  ('00000000-0000-7000-8000-00000000b005','00000000-0000-7000-8000-0000000000b1','needle-passing','assessment','2026-10-12 12:00:00+00','2026-10-12 12:02:00+00',120000,64.0,'{"synthetic":true}'::jsonb)
on conflict (id) do nothing;

insert into attempt_scores (completed_at, attempt_id, anonymous_user_id, skill_id, overall_score, precision_score, control_score, technique_score, coordination_score, efficiency_safety_score, performance_vector)
select v.completed_at, v.attempt_id, '00000000-0000-7000-8000-0000000000b1', 'needle-passing',
       v.overall, v.overall, v.overall, v.overall, v.overall, v.overall, v.vec::vector
from (values
  ('2026-10-16 12:02:00+00'::timestamptz,'00000000-0000-7000-8000-00000000b001'::uuid,80.0,'[80,80,80,80,80,80,80,80,80,80,80,80,80,80,80,80,80,80,80,80]'),
  ('2026-10-15 12:02:00+00'::timestamptz,'00000000-0000-7000-8000-00000000b002'::uuid,78.0,'[78,78,78,78,78,78,78,78,78,78,78,78,78,78,78,78,78,78,78,78]'),
  ('2026-10-14 12:02:00+00'::timestamptz,'00000000-0000-7000-8000-00000000b003'::uuid,74.0,'[76,84,76,84,76,84,76,84,76,84,76,84,76,84,76,84,76,84,76,84]'),
  ('2026-10-13 12:02:00+00'::timestamptz,'00000000-0000-7000-8000-00000000b004'::uuid,70.0,'[90,90,90,90,90,90,90,90,90,90,60,60,60,60,60,60,60,60,60,60]'),
  ('2026-10-12 12:02:00+00'::timestamptz,'00000000-0000-7000-8000-00000000b005'::uuid,64.0,'[42,42,42,42,42,42,42,42,42,42,96,96,96,96,96,96,96,96,96,96]')
) as v(completed_at, attempt_id, overall, vec)
where not exists (
  select 1 from attempt_scores
  where anonymous_user_id = '00000000-0000-7000-8000-0000000000b1'
);

-- Per-sample motion telemetry for attempt A: a smooth baseline with two sharp
-- path-deviation spikes. p50 stays near baseline while p95 is pulled up by the
-- spikes, and an LTTB downsample must keep points near the peaks.
insert into metric_samples (sampled_at, attempt_id, skill_id, seq, segment, path_deviation, orientation_error_deg, speed, jerk, grip_error, coordination_error)
select
  timestamptz '2026-10-16 12:00:00+00' + (g * interval '500 milliseconds'),
  '00000000-0000-7000-8000-00000000b001',
  'needle-passing',
  g,
  'insertion',
  0.40 + 0.15 * sin(g / 6.0)
    + case when g = 60 then 3.0 when g = 180 then 2.6 else 0 end,
  5.0 + 2.0 * sin(g / 9.0),
  0.30 + 0.05 * cos(g / 7.0),
  0.10 + 0.02 * abs(sin(g / 5.0)),
  0.05,
  0.08
from generate_series(0, 239) as g
where not exists (
  select 1 from metric_samples
  where attempt_id = '00000000-0000-7000-8000-00000000b001'
);
