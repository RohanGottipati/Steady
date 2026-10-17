-- B0 demo seed: one skill + one synthetic attempt so the pipeline is queryable.
-- Idempotent: fixed IDs with ON CONFLICT / NOT EXISTS guards.

insert into skills (id, title, difficulty, description, source_label)
values (
  'needle-passing',
  'Needle Passing',
  'beginner',
  'Pass a needle through target rings with precise bimanual control.',
  'internal-reference'
)
on conflict (id) do nothing;

insert into anonymous_users (id)
values ('00000000-0000-7000-8000-000000000001')
on conflict (id) do nothing;

insert into attempts (
  id, anonymous_user_id, skill_id, mode,
  started_at, completed_at, duration_ms, overall_score, result_json
)
values (
  '00000000-0000-7000-8000-000000000a01',
  '00000000-0000-7000-8000-000000000001',
  'needle-passing',
  'assessment',
  now() - interval '2 minutes',
  now(),
  120000,
  78.5,
  '{"synthetic": true}'::jsonb
)
on conflict (id) do nothing;

-- attempt_scores is a hypertable with no unique constraint; guard with NOT EXISTS.
insert into attempt_scores (
  completed_at, attempt_id, anonymous_user_id, skill_id,
  overall_score, precision_score, control_score, technique_score,
  coordination_score, efficiency_safety_score, performance_vector
)
select
  now(),
  '00000000-0000-7000-8000-000000000a01',
  '00000000-0000-7000-8000-000000000001',
  'needle-passing',
  78.5, 80, 75, 82, 70, 85,
  '[0.80,0.78,0.72,0.81,0.69,0.74,0.77,0.70,0.73,0.79,0.68,0.75,0.82,0.71,0.76,0.80,0.67,0.85,0.88,0.72]'::vector
where not exists (
  select 1 from attempt_scores where attempt_id = '00000000-0000-7000-8000-000000000a01'
);
