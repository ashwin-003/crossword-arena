-- ============================================================================
-- CROSSWORD ARENA — initial schema
-- ============================================================================
-- Design notes:
--  * Authentication credentials (password hashing, sessions) are delegated to
--    Supabase Auth (auth.users) rather than a hand-rolled password_hash
--    column. See supabase/functions/register and src/lib/auth.ts for how a
--    6-digit batch number is mapped to a synthetic auth email. This gets us
--    battle-tested secure hashing + session/JWT handling for free, and means
--    a credential can never leak through the public schema/PostgREST at all
--    (auth.users is not exposed to PostgREST). public.users is a 1:1 PUBLIC
--    PROFILE row, created by a trigger the moment an auth.users row appears.
--  * Every column a browser could tamper with to cheat (scores, ranks,
--    completion time, correctness, game status/timing) is only ever written
--    by SECURITY DEFINER database functions or Edge Functions using the
--    service role — never directly by an authenticated client. See
--    0003_functions_triggers.sql and 0004_rls_policies.sql.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- users: public profile, 1:1 with an auth.users row
-- ----------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  class text not null check (char_length(btrim(class)) between 1 and 40),
  batch_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_batch_number_format check (batch_number ~ '^[0-9]{6}$'),
  constraint users_batch_number_unique unique (batch_number)
);

comment on table public.users is 'Public player profile. Password hashing/session handling lives in Supabase Auth (auth.users), never in this table or exposed to PostgREST.';

create index users_batch_number_idx on public.users (batch_number);

-- ----------------------------------------------------------------------------
-- games
-- ----------------------------------------------------------------------------
create type public.game_status as enum ('waiting', 'starting', 'active', 'ended', 'cancelled');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  game_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  creator_id uuid not null references public.users (id) on delete cascade,
  time_limit_seconds integer not null check (time_limit_seconds between 60 and 10800),
  start_time timestamptz,
  end_time timestamptz,
  status public.game_status not null default 'waiting',
  grid_rows integer not null check (grid_rows between 3 and 30),
  grid_cols integer not null check (grid_cols between 3 and 30),
  -- grid_layout stores ONLY structural info (blocked cells, numbering) — never answers.
  grid_layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_game_code_unique unique (game_code),
  constraint games_game_code_format check (game_code ~ '^[A-Z0-9]{6}$'),
  constraint games_timing_order check (end_time is null or start_time is null or end_time > start_time)
);

create index games_game_code_idx on public.games (game_code);
create index games_creator_id_idx on public.games (creator_id);
create index games_status_idx on public.games (status);
create index games_status_end_time_idx on public.games (status, end_time) where status = 'active';

-- ----------------------------------------------------------------------------
-- questions (answer key — locked down hard, see RLS + questions_public view)
-- ----------------------------------------------------------------------------
create type public.clue_direction as enum ('across', 'down');

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  direction public.clue_direction not null,
  clue text not null check (char_length(btrim(clue)) between 1 and 300),
  answer text not null check (answer = upper(answer) and answer ~ '^[A-Z]{1,20}$'),
  row_index integer not null check (row_index >= 0),
  col_index integer not null check (col_index >= 0),
  number integer not null check (number > 0),
  created_at timestamptz not null default now(),
  constraint questions_unique_slot unique (game_id, direction, row_index, col_index)
);

create index questions_game_id_idx on public.questions (game_id);

-- ----------------------------------------------------------------------------
-- participants
-- ----------------------------------------------------------------------------
create type public.participant_status as enum ('joined', 'active', 'submitted', 'disconnected');

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  status public.participant_status not null default 'joined',
  submitted_at timestamptz,
  -- Server-computed "live" figures for the in-progress leaderboard only.
  -- Never writable directly by clients — see check_word_answer() and RLS.
  live_score integer not null default 0,
  live_solved_count integer not null default 0,
  interruption_count integer not null default 0,
  constraint participants_unique_membership unique (game_id, user_id)
);

create index participants_game_id_idx on public.participants (game_id);
create index participants_user_id_idx on public.participants (user_id);
create index participants_game_leaderboard_idx on public.participants (game_id, live_score desc, live_solved_count desc);

-- ----------------------------------------------------------------------------
-- answers (player progress / submissions)
-- ----------------------------------------------------------------------------
create table public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  answer text not null default '' check (char_length(answer) <= 20),
  is_correct boolean,
  updated_at timestamptz not null default now(),
  constraint answers_unique_slot unique (game_id, user_id, question_id)
);

create index answers_game_user_idx on public.answers (game_id, user_id);
create index answers_question_id_idx on public.answers (question_id);

-- ----------------------------------------------------------------------------
-- results (final, server-computed, immutable to clients)
-- ----------------------------------------------------------------------------
create table public.results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  score integer not null default 0,
  completion_time_seconds integer not null default 0,
  solved_count integer not null default 0,
  total_questions integer not null default 0,
  accuracy numeric(5, 2) not null default 0,
  rank integer,
  auto_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint results_unique_membership unique (game_id, user_id)
);

create index results_game_id_idx on public.results (game_id);
create index results_game_rank_idx on public.results (game_id, rank);
create index results_user_id_idx on public.results (user_id);

-- ----------------------------------------------------------------------------
-- game_events (competition monitoring / audit log)
-- ----------------------------------------------------------------------------
create type public.game_event_type as enum (
  'game_started',
  'fullscreen_entered',
  'fullscreen_exited',
  'fullscreen_restored',
  'visibility_changed',
  'focus_lost',
  'focus_restored',
  'reconnected',
  'submitted',
  'game_ended'
);

create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  event_type public.game_event_type not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index game_events_game_id_idx on public.game_events (game_id, created_at desc);
create index game_events_user_id_idx on public.game_events (user_id);
