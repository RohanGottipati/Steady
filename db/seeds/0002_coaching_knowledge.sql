-- B12 coaching corpus: skill_documents the BM25 index retrieves to ground the
-- AI review (plan 18.5). Each document targets a metric family in natural
-- language so a metric-derived query ("movement smoothness jerk", "path
-- deviation precision") retrieves the matching document. Idempotent: fixed IDs
-- with ON CONFLICT. Content is internal coaching guidance, not clinical advice.

-- peg-transfer may not have been uploaded yet; coaching docs need a valid FK.
insert into skills (id, title, difficulty, description, source_label)
values (
  'peg-transfer',
  'Peg Transfer',
  'beginner',
  'Transfer pegs between pegboard posts with controlled bimanual handoffs.',
  'lask'
)
on conflict (id) do nothing;

insert into skill_documents (id, skill_id, title, content, source_url, source_type)
values
  (
    '00000000-0000-7000-8000-00000000d001',
    'needle-passing',
    'Smoothing jerky needle motion',
    'Jerky, trembling instrument motion lowers movement smoothness and raises '
    || 'jerk. Move the needle in one continuous arc, decelerate gently before the '
    || 'target, and avoid sudden corrections. Smooth, steady motion keeps the tip '
    || 'controlled and the path predictable.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d002',
    'needle-passing',
    'Correcting needle path deviation',
    'When the needle drifts off the ideal arc the path deviation and precision '
    || 'scores fall. Keep the tip on the planned path, enter the ring squarely, and '
    || 'reduce overshoot past the target. Accurate path tracking improves precision '
    || 'and target accuracy.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d003',
    'needle-passing',
    'Instrument orientation and rotation control',
    'A poor approach angle shows up as orientation error and weak rotation control. '
    || 'Rotate the wrist so the needle meets the tissue perpendicular to the ring, and '
    || 'hold a stable instrument orientation through the pass instead of twisting mid-motion.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d004',
    'needle-passing',
    'Bimanual coordination in the needle handoff',
    'Weak bimanual coordination makes the handoff between the two instruments ragged. '
    || 'Time both hands together, stabilise the receiving grasper before releasing, and '
    || 'keep the coordination between left and right hands continuous during the transfer.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d005',
    'needle-passing',
    'Avoiding danger zones and collisions',
    'Entering a danger zone or letting the instruments collide lowers the safety score. '
    || 'Keep tool tips inside the safe workspace, avoid collision between the two '
    || 'instruments, and stay clear of danger zones around the tissue.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d006',
    'needle-passing',
    'Efficient needle-passing tempo',
    'Low efficiency comes from a slow, hesitant speed profile and long idle time between '
    || 'actions. Keep a steady tempo, minimise idle pauses, and take a direct, efficient '
    || 'path so the overall speed and path efficiency improve.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d007',
    'peg-transfer',
    'Peg transfer grip stability',
    'Dropping pegs or regrasping comes from poor pinch stability and mistimed grip. '
    || 'Close the grasper firmly before lifting, hold a stable pinch through the move, '
    || 'and time the grip so the peg is secure before transfer.',
    null,
    'coaching'
  ),
  (
    '00000000-0000-7000-8000-00000000d008',
    'peg-transfer',
    'Controlled bimanual peg handoff',
    'A clean peg transfer needs smooth bimanual coordination. Hand the peg from one '
    || 'grasper to the other over the centre of the board, keep both hands coordinated, '
    || 'and avoid rushing the handoff so the peg is not dropped.',
    null,
    'coaching'
  )
on conflict (id) do nothing;
