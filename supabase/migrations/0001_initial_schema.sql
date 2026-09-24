-- ============================================================================
-- CROSSWORD ARENA — Initial Schema for New Supabase Project
-- ============================================================================
-- Clean architecture:
--   * No public.users table.
--   * No handle_new_auth_user() auth trigger.
--   * public.mentors references auth.users(id).
--   * public.students references auth.users(id).
--   * Server-authoritative section timers and scoring.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. MENTORS & STUDENTS
-- ----------------------------------------------------------------------------

create table if not exists public.mentors (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists mentors_auth_user_id_idx on public.mentors (auth_user_id);
create index if not exists mentors_email_idx on public.mentors (email);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  class text not null,
  batch_number text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists students_auth_user_id_idx on public.students (auth_user_id);
create index if not exists students_batch_number_idx on public.students (batch_number);

-- Ensure the existing mentor profile exists for auth user 15d9c762-e4d7-495f-b8b5-fd0ae77b8832
insert into public.mentors (auth_user_id, name, email, is_active)
values ('15d9c762-e4d7-495f-b8b5-fd0ae77b8832', 'Dharshan', 'dharshantry04@gmail.com', true)
on conflict (auth_user_id) do update set
  name = excluded.name,
  email = excluded.email,
  is_active = true;

-- ----------------------------------------------------------------------------
-- 2. GAMES & SECTIONS
-- ----------------------------------------------------------------------------

do $$ begin
  create type public.game_status as enum ('waiting', 'starting', 'active', 'ended', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.clue_direction as enum ('across', 'down');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.participant_status as enum ('joined', 'active', 'submitted', 'disconnected');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  game_code text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  creator_id uuid not null references auth.users (id) on delete cascade,
  time_limit_seconds integer not null default 600 check (time_limit_seconds >= 10),
  start_time timestamptz,
  end_time timestamptz,
  status public.game_status not null default 'waiting',
  grid_rows integer not null check (grid_rows between 3 and 30),
  grid_cols integer not null check (grid_cols between 3 and 30),
  grid_layout jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_game_code_unique unique (game_code),
  constraint games_game_code_format check (game_code ~ '^[A-Z0-9]{6}$')
);

create index if not exists games_game_code_idx on public.games (game_code);
create index if not exists games_creator_id_idx on public.games (creator_id);
create index if not exists games_status_idx on public.games (status);

create table if not exists public.game_sections (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  position integer not null check (position >= 0),
  time_limit_seconds integer not null default 600 check (time_limit_seconds >= 10),
  grid_rows integer not null check (grid_rows between 3 and 30),
  grid_cols integer not null check (grid_cols between 3 and 30),
  grid_layout jsonb not null,
  created_at timestamptz not null default now(),
  constraint game_sections_game_position_unique unique (game_id, position)
);

create index if not exists game_sections_game_id_idx on public.game_sections (game_id);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid references public.game_sections (id) on delete cascade,
  direction public.clue_direction not null,
  clue text not null check (char_length(btrim(clue)) between 1 and 300),
  answer text not null check (answer = upper(answer) and answer ~ '^[A-Z]{1,20}$'),
  row_index integer not null check (row_index >= 0),
  col_index integer not null check (col_index >= 0),
  number integer not null check (number > 0),
  created_at timestamptz not null default now(),
  constraint questions_section_slot_unique unique (section_id, direction, row_index, col_index)
);

create index if not exists questions_game_id_idx on public.questions (game_id);
create index if not exists questions_section_id_idx on public.questions (section_id);

-- ----------------------------------------------------------------------------
-- 3. PARTICIPANTS, TIMERS, ANSWERS, RESULTS
-- ----------------------------------------------------------------------------

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  status public.participant_status not null default 'joined',
  submitted_at timestamptz,
  live_score integer not null default 0,
  live_solved_count integer not null default 0,
  interruption_count integer not null default 0,
  last_seen_at timestamptz default now(),
  constraint participants_unique_membership unique (game_id, user_id)
);

create index if not exists participants_game_id_idx on public.participants (game_id);
create index if not exists participants_user_id_idx on public.participants (user_id);
create index if not exists participants_game_leaderboard_idx on public.participants (game_id, live_score desc, live_solved_count desc);

create table if not exists public.section_timers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid not null references public.game_sections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  last_active_at timestamptz,
  is_locked boolean not null default false,
  constraint section_timers_unique_slot unique (section_id, user_id)
);

create index if not exists section_timers_game_id_idx on public.section_timers (game_id);
create index if not exists section_timers_section_id_idx on public.section_timers (section_id);
create index if not exists section_timers_user_id_idx on public.section_timers (user_id);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  answer text not null default '' check (char_length(answer) <= 20),
  is_correct boolean,
  updated_at timestamptz not null default now(),
  constraint answers_unique_slot unique (game_id, user_id, question_id)
);

create index if not exists answers_game_user_idx on public.answers (game_id, user_id);
create index if not exists answers_question_id_idx on public.answers (question_id);

create table if not exists public.section_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  section_id uuid not null references public.game_sections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null default 0 check (score >= 0),
  solved_count integer not null default 0 check (solved_count >= 0),
  total_questions integer not null default 0 check (total_questions >= 0),
  completion_time_seconds integer not null default 0 check (completion_time_seconds >= 0),
  auto_submitted boolean not null default false,
  submitted_at timestamptz not null default now(),
  constraint section_results_unique_slot unique (section_id, user_id)
);

create index if not exists section_results_game_id_idx on public.section_results (game_id);
create index if not exists section_results_section_id_idx on public.section_results (section_id);
create index if not exists section_results_user_id_idx on public.section_results (user_id);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
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

create index if not exists results_game_id_idx on public.results (game_id);
create index if not exists results_game_rank_idx on public.results (game_id, rank);
create index if not exists results_user_id_idx on public.results (user_id);

create table if not exists public.game_drafts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  time_limit_seconds integer not null default 600,
  clues jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_drafts_creator_id_idx on public.game_drafts (creator_id);

do $$ begin
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
exception
  when duplicate_object then null;
end $$;

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  event_type public.game_event_type not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_events_game_id_idx on public.game_events (game_id, created_at desc);
create index if not exists game_events_user_id_idx on public.game_events (user_id);

create table if not exists public.removed_participants (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  removed_at timestamptz not null default now(),
  constraint removed_participants_pk primary key (game_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. VIEWS & FUNCTIONS
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at before update on public.games for each row execute function public.set_updated_at();

drop trigger if exists answers_set_updated_at on public.answers;
create trigger answers_set_updated_at before update on public.answers for each row execute function public.set_updated_at();

drop trigger if exists game_drafts_set_updated_at on public.game_drafts;
create trigger game_drafts_set_updated_at before update on public.game_drafts for each row execute function public.set_updated_at();

create or replace function public.is_game_participant(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where game_id = p_game_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_game_participant(uuid, uuid) to authenticated;

create or replace view public.questions_public as
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
    select 1 from public.participants p
    where p.game_id = q.game_id and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.games g
    where g.id = q.game_id and g.creator_id = auth.uid()
  );

grant select on public.questions_public to authenticated;

create or replace function public.scoring_points_for_answer(p_answer_length integer)
returns integer
language sql
immutable
as $$
  select 50 + (5 * greatest(p_answer_length, 0));
$$;

create or replace function public.check_word_answer(p_game_id uuid, p_question_id uuid, p_guess text)
returns table (is_correct boolean, points_awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer text;
  v_normalized_guess text := upper(regexp_replace(coalesce(p_guess, ''), '[^A-Za-z]', '', 'g'));
  v_was_correct boolean;
  v_now_correct boolean;
  v_points integer := 0;
  v_game_status public.game_status;
  v_game_end_time timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select g.status, g.end_time into v_game_status, v_game_end_time
  from public.games g where g.id = p_game_id;

  if v_game_status is distinct from 'active' then
    raise exception 'game is not active';
  end if;

  if v_game_end_time is not null and now() >= v_game_end_time then
    raise exception 'game is not active';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.game_id = p_game_id and p.user_id = auth.uid()
  ) then
    raise exception 'not a participant of this game';
  end if;

  select q.answer into v_answer
  from public.questions q
  where q.id = p_question_id and q.game_id = p_game_id;

  if v_answer is null then
    raise exception 'question not found for this game';
  end if;

  v_now_correct := (v_normalized_guess = v_answer);

  select a.is_correct into v_was_correct
  from public.answers a
  where a.game_id = p_game_id and a.user_id = auth.uid() and a.question_id = p_question_id;

  insert into public.answers (game_id, user_id, question_id, answer, is_correct, updated_at)
  values (p_game_id, auth.uid(), p_question_id, v_normalized_guess, v_now_correct, now())
  on conflict (game_id, user_id, question_id)
  do update set answer = excluded.answer, is_correct = excluded.is_correct, updated_at = now();

  if v_now_correct and coalesce(v_was_correct, false) = false then
    v_points := public.scoring_points_for_answer(char_length(v_answer));

    update public.participants
    set live_score = live_score + v_points,
        live_solved_count = live_solved_count + 1
    where game_id = p_game_id and user_id = auth.uid();
  elsif not v_now_correct and coalesce(v_was_correct, false) = true then
    select public.scoring_points_for_answer(char_length(v_answer)) into v_points;

    update public.participants
    set live_score = greatest(live_score - v_points, 0),
        live_solved_count = greatest(live_solved_count - 1, 0)
    where game_id = p_game_id and user_id = auth.uid();

    v_points := 0;
  end if;

  return query select v_now_correct, v_points;
end;
$$;

grant execute on function public.check_word_answer(uuid, uuid, text) to authenticated;

create or replace function public.recompute_ranks(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.results r
  set rank = ranked.rnk
  from (
    select id, rank() over (order by score desc, completion_time_seconds asc) as rnk
    from public.results
    where game_id = p_game_id
  ) ranked
  where r.id = ranked.id;
$$;

grant execute on function public.recompute_ranks(uuid) to service_role;

create or replace function public.get_spectator_snapshot(p_game_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_game public.games%rowtype;
  v_result jsonb;
  v_leaderboard jsonb;
begin
  select * into v_game from public.games where game_code = upper(p_game_code);

  if v_game.id is null then
    return null;
  end if;

  if v_game.status = 'ended' then
    select coalesce(jsonb_agg(row_to_json(top)), '[]'::jsonb)
    into v_leaderboard
    from (
      select coalesce(s.name, m.name, 'Player') as name, r.score, r.solved_count, r.rank
      from public.results r
      left join public.students s on s.auth_user_id = r.user_id
      left join public.mentors m on m.auth_user_id = r.user_id
      where r.game_id = v_game.id
      order by r.rank asc nulls last
      limit 10
    ) top;
  else
    select coalesce(jsonb_agg(row_to_json(top)), '[]'::jsonb)
    into v_leaderboard
    from (
      select
        coalesce(s.name, m.name, 'Player') as name,
        p.live_score as score,
        p.live_solved_count as solved_count,
        rank() over (order by p.live_score desc, p.live_solved_count desc) as rank
      from public.participants p
      left join public.students s on s.auth_user_id = p.user_id
      left join public.mentors m on m.auth_user_id = p.user_id
      where p.game_id = v_game.id
      order by p.live_score desc, p.live_solved_count desc
      limit 10
    ) top;
  end if;

  select jsonb_build_object(
    'game_id', v_game.id,
    'creator_id', v_game.creator_id,
    'title', v_game.title,
    'game_code', v_game.game_code,
    'status', v_game.status,
    'start_time', v_game.start_time,
    'end_time', v_game.end_time,
    'participant_count', (select count(*) from public.participants p where p.game_id = v_game.id),
    'leaderboard', v_leaderboard
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_spectator_snapshot(text) to anon, authenticated;

create or replace function public.get_my_review(p_game_id uuid)
returns table (
  question_id uuid,
  number integer,
  direction public.clue_direction,
  clue text,
  correct_answer text,
  my_answer text,
  is_correct boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.game_id = p_game_id and p.user_id = auth.uid() and p.status = 'submitted'
  ) then
    raise exception 'submit your game before viewing the answer review';
  end if;

  return query
    select
      q.id as question_id,
      q.number,
      q.direction,
      q.clue,
      q.answer as correct_answer,
      coalesce(a.answer, '') as my_answer,
      a.is_correct
    from public.questions q
    left join public.answers a on a.question_id = q.id and a.game_id = p_game_id and a.user_id = auth.uid()
    where q.game_id = p_game_id
    order by q.number, q.direction;
end;
$$;

grant execute on function public.get_my_review(uuid) to authenticated;

create or replace function public.get_question_analytics(p_game_id uuid)
returns table (question_id uuid, clue text, direction public.clue_direction, number integer, attempts integer, correct_count integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (select 1 from public.games g where g.id = p_game_id and g.creator_id = auth.uid()) then
    raise exception 'only the match creator can view analytics';
  end if;

  return query
    select
      q.id as question_id,
      q.clue,
      q.direction,
      q.number,
      count(a.id) filter (where a.is_correct is not null)::integer as attempts,
      count(a.id) filter (where a.is_correct = true)::integer as correct_count
    from public.questions q
    left join public.answers a on a.question_id = q.id and a.game_id = p_game_id
    where q.game_id = p_game_id
    group by q.id, q.clue, q.direction, q.number
    order by q.number, q.direction;
end;
$$;

grant execute on function public.get_question_analytics(uuid) to authenticated;

create or replace function public.touch_last_seen(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.participants
  set last_seen_at = now()
  where game_id = p_game_id and user_id = auth.uid();
end;
$$;

grant execute on function public.touch_last_seen(uuid) to authenticated;

create or replace function public.record_interruption(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.participants
  set interruption_count = interruption_count + 1
  where game_id = p_game_id and user_id = auth.uid()
  returning interruption_count into v_count;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.record_interruption(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table public.mentors enable row level security;
alter table public.students enable row level security;
alter table public.games enable row level security;
alter table public.game_sections enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.section_timers enable row level security;
alter table public.answers enable row level security;
alter table public.section_results enable row level security;
alter table public.results enable row level security;
alter table public.game_drafts enable row level security;
alter table public.game_events enable row level security;
alter table public.removed_participants enable row level security;

-- Mentors RLS
drop policy if exists mentors_select_authenticated on public.mentors;
create policy mentors_select_authenticated on public.mentors for select to authenticated using (true);
revoke insert, update, delete on public.mentors from authenticated;

-- Students RLS
drop policy if exists students_select_authenticated on public.students;
create policy students_select_authenticated on public.students for select to authenticated using (true);
revoke insert, update, delete on public.students from authenticated;

-- Games RLS
drop policy if exists games_select_authenticated on public.games;
create policy games_select_authenticated on public.games for select to authenticated using (true);
revoke insert, update, delete on public.games from authenticated;

-- Game Sections RLS
drop policy if exists game_sections_select_authenticated on public.game_sections;
create policy game_sections_select_authenticated on public.game_sections for select to authenticated using (true);
revoke insert, update, delete on public.game_sections from authenticated;

-- Questions RLS (no direct select for non-service; use questions_public)
revoke all on public.questions from authenticated, anon;

-- Participants RLS
drop policy if exists participants_select_authenticated on public.participants;
create policy participants_select_authenticated on public.participants for select to authenticated using (
  user_id = auth.uid()
  or public.is_game_participant(public.participants.game_id, auth.uid())
  or exists (
    select 1 from public.games g
    where g.id = public.participants.game_id and g.creator_id = auth.uid()
  )
);
revoke insert, update, delete on public.participants from authenticated;

-- Section Timers RLS
drop policy if exists section_timers_select_authenticated on public.section_timers;
create policy section_timers_select_authenticated on public.section_timers for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.section_timers.game_id and g.creator_id = auth.uid()
  )
);
revoke insert, update, delete on public.section_timers from authenticated;

-- Answers RLS
drop policy if exists answers_select_own on public.answers;
create policy answers_select_own on public.answers for select to authenticated using (user_id = auth.uid());

drop policy if exists answers_insert_own on public.answers;
create policy answers_insert_own on public.answers for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.participants p
    where p.game_id = public.answers.game_id and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.games g
    where g.id = public.answers.game_id and g.status = 'active' and (g.end_time is null or now() < g.end_time)
  )
);

drop policy if exists answers_update_own on public.answers;
create policy answers_update_own on public.answers for update to authenticated using (user_id = auth.uid()) with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.games g
    where g.id = public.answers.game_id and g.status = 'active' and (g.end_time is null or now() < g.end_time)
  )
);
revoke delete on public.answers from authenticated;

-- Section Results RLS
drop policy if exists section_results_select_authenticated on public.section_results;
create policy section_results_select_authenticated on public.section_results for select to authenticated using (
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

-- Results RLS
drop policy if exists results_select_authenticated on public.results;
create policy results_select_authenticated on public.results for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.participants p
    where p.game_id = public.results.game_id and p.user_id = auth.uid()
  )
  or exists (
    select 1 from public.games g
    where g.id = public.results.game_id and g.creator_id = auth.uid()
  )
);
revoke insert, update, delete on public.results from authenticated;

-- Game Drafts RLS
drop policy if exists game_drafts_owner_all on public.game_drafts;
create policy game_drafts_owner_all on public.game_drafts for all to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());

-- Game Events RLS
drop policy if exists game_events_select_authenticated on public.game_events;
create policy game_events_select_authenticated on public.game_events for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.game_events.game_id and g.creator_id = auth.uid()
  )
);

drop policy if exists game_events_insert_own on public.game_events;
create policy game_events_insert_own on public.game_events for insert to authenticated with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.participants p
    where p.game_id = public.game_events.game_id and p.user_id = auth.uid()
  )
);
revoke update, delete on public.game_events from authenticated;

-- Removed Participants RLS
drop policy if exists removed_participants_select on public.removed_participants;
create policy removed_participants_select on public.removed_participants for select to authenticated using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.removed_participants.game_id and g.creator_id = auth.uid()
  )
);
revoke insert, update, delete on public.removed_participants from authenticated;

-- ----------------------------------------------------------------------------
-- 6. REALTIME REPLICATION
-- ----------------------------------------------------------------------------

alter table public.games replica identity full;
alter table public.participants replica identity full;
alter table public.answers replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.games;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.participants;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.answers;
exception when others then null;
end $$;
