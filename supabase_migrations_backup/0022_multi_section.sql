-- ============================================================================
-- Migration 0022: Multi-Section Competition Support
-- ============================================================================
-- Adds three new tables and extends questions with a section_id FK so that
-- a single game can contain multiple independent crossword sections, each
-- with its own time limit, grid, and per-student timer tracking.
-- All server-computed values (scores, elapsed time, lock state) are written
-- only by SECURITY DEFINER functions or Edge Functions via service_role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- game_sections: one row per section within a game
-- ----------------------------------------------------------------------------
create table public.game_sections (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position integer not null check (position >= 0),
  time_limit_seconds integer not null default 600 check (time_limit_seconds >= 10),
  grid_rows integer not null check (grid_rows between 3 and 30),
  grid_cols integer not null check (grid_cols between 3 and 30),
  grid_layout jsonb not null,
  created_at timestamptz not null default now()
);

create index game_sections_game_id_idx on public.game_sections (game_id);
create unique index game_sections_game_position_idx on public.game_sections (game_id, position);

alter table public.game_sections enable row level security;

-- Anyone who can see the game can see its sections (same rule as games)
create policy game_sections_select_authenticated
on public.game_sections for select
to authenticated
using (true);

revoke insert, update, delete on public.game_sections from authenticated;

-- ----------------------------------------------------------------------------
-- Extend questions with an optional section_id.
-- Nullable for full backward compatibility: existing games have no sections.
-- ----------------------------------------------------------------------------
alter table public.questions
  add column if not exists section_id uuid references public.game_sections (id) on delete cascade;

create index if not exists questions_section_id_idx on public.questions (section_id);

-- Extend questions_public view to expose section_id
-- (Must drop & recreate because Postgres views are immutable in column list)
drop view if exists public.questions_public;

create view public.questions_public
as
select
  q.id,
  q.game_id,
  q.section_id,
  q.direction,
  q.clue,
  q.number,
  q.row_index,
  q.col_index,
  char_length(q.answer) as answer_length
from public.questions q
where
  exists (
    select 1
    from public.participants p
    where p.game_id = q.game_id
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.games g
    where g.id = q.game_id
      and g.creator_id = auth.uid()
  );

comment on view public.questions_public is 'Answer-free projection of questions (with section_id), self-filtered to participants/creator. Safe to expose to the authenticated role.';

grant select on public.questions_public to authenticated;

-- ----------------------------------------------------------------------------
-- section_timers: server-authoritative per-student per-section elapsed time.
-- The client is never trusted to report how much time has passed.
-- started_at: when the student first opened this section during the game.
-- elapsed_seconds: accumulated seconds from prior visits (pause/resume support).
-- last_active_at: timestamp of most recent start-section call (for expiry math).
-- is_locked: true once the section time is exhausted or explicitly submitted.
-- ----------------------------------------------------------------------------
create table public.section_timers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid not null references public.game_sections (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  last_active_at timestamptz,
  is_locked boolean not null default false,
  constraint section_timers_unique_slot unique (section_id, user_id)
);

create index section_timers_game_id_idx on public.section_timers (game_id);
create index section_timers_section_id_idx on public.section_timers (section_id);
create index section_timers_user_id_idx on public.section_timers (user_id);

alter table public.section_timers enable row level security;

-- Students can read their own section timer rows (needed to show remaining time on client)
create policy section_timers_select_own
on public.section_timers for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.section_timers.game_id and g.creator_id = auth.uid()
  )
);

-- No direct writes from clients — all writes via service_role Edge Functions
revoke insert, update, delete on public.section_timers from authenticated;

-- ----------------------------------------------------------------------------
-- section_results: final per-section scores per student.
-- Written only by submit-section / submit-game Edge Functions (service_role).
-- Idempotent upsert on (section_id, user_id).
-- ----------------------------------------------------------------------------
create table public.section_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid not null references public.game_sections (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  solved_count integer not null default 0 check (solved_count >= 0),
  total_questions integer not null default 0 check (total_questions >= 0),
  completion_time_seconds integer not null default 0 check (completion_time_seconds >= 0),
  auto_submitted boolean not null default false,
  submitted_at timestamptz not null default now(),
  constraint section_results_unique_slot unique (section_id, user_id)
);

create index section_results_game_id_idx on public.section_results (game_id);
create index section_results_section_id_idx on public.section_results (section_id);
create index section_results_user_id_idx on public.section_results (user_id);

alter table public.section_results enable row level security;

-- Students can read their own results; game creator can see all
create policy section_results_select_own_or_creator
on public.section_results for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.section_results.game_id and g.creator_id = auth.uid()
  )
  or exists (
    select 1 from public.participants p
    where p.game_id = public.section_results.game_id and p.user_id = auth.uid()
  )
);

revoke insert, update, delete on public.section_results from authenticated;

-- ----------------------------------------------------------------------------
-- Extend game_drafts to support sections JSONB.
-- The clues column is kept for backward compat; new drafts use a sections
-- column. The frontend detects which shape is present on load.
-- ----------------------------------------------------------------------------
alter table public.game_drafts
  add column if not exists sections jsonb not null default '[]'::jsonb;
