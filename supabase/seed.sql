-- ============================================================================
-- Local development seed data. Runs automatically after `supabase db
-- reset`. NEVER run this against a production project — it creates
-- plaintext-password demo accounts.
--
-- Demo accounts (batch number / password):
--   100001 / password123  (Maddy Iyer — owns the demo match below)
--   100002 / password123  (Arun Kumar)
--   100003 / password123  (Divya Ramesh)
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    'p100001@players.crossword-arena.internal',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Maddy Iyer","class":"IV CSE","batch_number":"100001"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'p100002@players.crossword-arena.internal',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Arun Kumar","class":"III ECE","batch_number":"100002"}',
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated',
    'p100003@players.crossword-arena.internal',
    crypt('password123', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"name":"Divya Ramesh","class":"II CSE","batch_number":"100003"}',
    now(), now(), '', '', '', ''
  );

-- public.users rows are created automatically by the on_auth_user_created
-- trigger — nothing to insert here.

-- A tiny 3x3 demo crossword: CAT (across) crossing CAB (down) at the C.
insert into public.games (
  id, game_code, title, creator_id, time_limit_seconds, status,
  grid_rows, grid_cols, grid_layout
) values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'DEMO01',
  'Demo Crossword Clash',
  '11111111-1111-1111-1111-111111111111',
  300,
  'waiting',
  3, 3,
  '{"rows":3,"cols":3,"cellMask":[[true,true,true],[true,false,false],[true,false,false]]}'::jsonb
);

insert into public.questions (game_id, direction, clue, answer, row_index, col_index, number) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'across', 'Feline pet', 'CAT', 0, 0, 1),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'down', 'Yellow taxi', 'CAB', 0, 0, 1);

insert into public.participants (game_id, user_id, status) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'joined');
