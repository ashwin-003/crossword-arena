-- ============================================================================
-- 0009_student_progress_monitoring.sql
-- ============================================================================
-- Complete Backend System for student-wise live progress monitoring,
-- sequential section enforcement, and result tracking.
-- ============================================================================

-- 1. Add progress tracking columns to public.participants
alter table public.participants
  add column if not exists current_section_index integer default 0,
  add column if not exists current_section_name text default 'Section A',
  add column if not exists completed_sections_count integer default 0,
  add column if not exists current_section_status text default 'in_progress',
  add column if not exists total_correct integer default 0,
  add column if not exists total_wrong integer default 0,
  add column if not exists total_unanswered integer default 60,
  add column if not exists total_attempted integer default 0,
  add column if not exists section_scores jsonb default '[]'::jsonb;

-- 2. Add section_results and results to supabase_realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'section_results'
  ) then
    alter publication supabase_realtime add table public.section_results;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'results'
  ) then
    alter publication supabase_realtime add table public.results;
  end if;
exception when others then
  null;
end $$;

-- 3. Update participants_public view to include all progress monitoring columns
drop view if exists public.participants_public cascade;

create view public.participants_public as
select
  p.id,
  p.game_id,
  p.user_id,
  p.joined_at,
  p.status,
  p.submitted_at,
  p.live_score,
  p.live_solved_count,
  p.interruption_count,
  p.last_seen_at,
  p.current_section_index,
  p.current_section_name,
  p.completed_sections_count,
  p.current_section_status,
  p.total_correct,
  p.total_wrong,
  p.total_unanswered,
  p.total_attempted,
  p.section_scores,
  coalesce(ss.batch_number, '') as batch_number,
  coalesce('Student ' || ss.batch_number, m.name, 'Student') as display_name,
  coalesce(ss.batch_number, m.name, 'Student') as display_class
from public.participants p
left join public.student_sessions ss on ss.id = p.user_id
left join public.mentors m on m.auth_user_id = p.user_id;

grant select on public.participants_public to anon, authenticated, service_role;

-- 4. Enforce sequential section access in check_word_answer
create or replace function public.check_word_answer(
  p_game_id uuid,
  p_question_id uuid,
  p_guess text,
  p_user_id uuid default null
)
returns table (is_correct boolean, points_awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_user_id uuid;
  v_game_status public.game_status;
  v_game_end_time timestamptz;
  v_answer text;
  v_normalized_guess text := upper(btrim(p_guess));
  v_now_correct boolean;
  v_was_correct boolean;
  v_points integer := 0;
  v_question_section_id uuid;
  v_question_section_pos integer;
  v_max_submitted_pos integer;
  v_participant_status public.participant_status;
begin
  v_effective_user_id := coalesce(p_user_id, auth.uid());
  if v_effective_user_id is null then
    raise exception 'authentication required';
  end if;

  select g.status, g.end_time into v_game_status, v_game_end_time
  from public.games g where g.id = p_game_id;

  if v_game_status is distinct from 'active' then
    raise exception 'game is not active';
  end if;

  if v_game_end_time is not null and now() >= v_game_end_time then
    raise exception 'game time limit has expired';
  end if;

  select p.status into v_participant_status
  from public.participants p
  where p.game_id = p_game_id and p.user_id = v_effective_user_id;

  if v_participant_status is null then
    raise exception 'not a participant of this game';
  end if;

  if v_participant_status = 'submitted' then
    raise exception 'game already submitted';
  end if;

  -- Verify question belongs to game & retrieve its section
  select q.answer, q.section_id into v_answer, v_question_section_id
  from public.questions q
  where q.id = p_question_id and q.game_id = p_game_id;

  if v_answer is null then
    raise exception 'question not found for this game';
  end if;

  -- If game has sections, enforce sequential section access
  if v_question_section_id is not null then
    select gs.position into v_question_section_pos
    from public.game_sections gs
    where gs.id = v_question_section_id and gs.game_id = p_game_id;

    -- Check if this section is already submitted (locked)
    if exists (
      select 1 from public.section_results sr
      where sr.section_id = v_question_section_id and sr.user_id = v_effective_user_id
    ) then
      raise exception 'section is already submitted and locked';
    end if;

    -- Check highest completed section position
    select coalesce(max(gs.position), -1) into v_max_submitted_pos
    from public.section_results sr
    join public.game_sections gs on gs.id = sr.section_id
    where sr.game_id = p_game_id and sr.user_id = v_effective_user_id;

    -- A student can only answer questions in section (v_max_submitted_pos + 1)
    if v_question_section_pos > (v_max_submitted_pos + 1) then
      raise exception 'section is not unlocked yet. Submit previous section first.';
    end if;
  end if;

  v_now_correct := (v_normalized_guess = v_answer);

  select a.is_correct into v_was_correct
  from public.answers a
  where a.game_id = p_game_id and a.user_id = v_effective_user_id and a.question_id = p_question_id;

  insert into public.answers (game_id, user_id, question_id, answer, is_correct, updated_at)
  values (p_game_id, v_effective_user_id, p_question_id, v_normalized_guess, v_now_correct, now())
  on conflict (game_id, user_id, question_id)
  do update set answer = excluded.answer, is_correct = excluded.is_correct, updated_at = now();

  if v_now_correct and coalesce(v_was_correct, false) = false then
    v_points := 1;

    update public.participants
    set live_score = live_score + 1,
        live_solved_count = live_solved_count + 1,
        total_correct = total_correct + 1,
        total_attempted = total_attempted + (case when v_was_correct is null then 1 else 0 end),
        total_wrong = greatest(total_wrong - (case when coalesce(v_was_correct, false) = false and v_was_correct is not null then 1 else 0 end), 0),
        total_unanswered = greatest(total_unanswered - (case when v_was_correct is null then 1 else 0 end), 0),
        last_seen_at = now()
    where game_id = p_game_id and user_id = v_effective_user_id;
  elsif not v_now_correct and coalesce(v_was_correct, false) = true then
    v_points := 0;

    update public.participants
    set live_score = greatest(live_score - 1, 0),
        live_solved_count = greatest(live_solved_count - 1, 0),
        total_correct = greatest(total_correct - 1, 0),
        total_wrong = total_wrong + 1,
        last_seen_at = now()
    where game_id = p_game_id and user_id = v_effective_user_id;
  elsif not v_now_correct and v_was_correct is null then
    -- First attempt and wrong
    update public.participants
    set total_wrong = total_wrong + 1,
        total_attempted = total_attempted + 1,
        total_unanswered = greatest(total_unanswered - 1, 0),
        last_seen_at = now()
    where game_id = p_game_id and user_id = v_effective_user_id;
  else
    update public.participants
    set last_seen_at = now()
    where game_id = p_game_id and user_id = v_effective_user_id;
  end if;

  return query select v_now_correct, v_points;
end;
$$;

grant execute on function public.check_word_answer(uuid, uuid, text, uuid) to anon, authenticated, service_role;

-- 5. Secure Mentor Live Monitoring RPC
-- Only the mentor who created the game can access this detailed progress dataset.
create or replace function public.get_mentor_live_monitoring(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_creator_id uuid;
  v_game_title text;
  v_game_code text;
  v_game_status public.game_status;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_time_limit integer;
  v_total_sections integer;
  v_total_questions integer;
  v_students jsonb;
begin
  -- 1. Mentor authorization check
  select g.creator_id, g.title, g.game_code, g.status, g.start_time, g.end_time, g.time_limit_seconds
  into v_creator_id, v_game_title, v_game_code, v_game_status, v_start_time, v_end_time, v_time_limit
  from public.games g
  where g.id = p_game_id;

  if v_creator_id is null then
    raise exception 'Game not found.';
  end if;

  if auth.uid() is distinct from v_creator_id then
    raise exception 'Access denied: You are not the creator of this match.';
  end if;

  -- Count total sections and total questions
  select count(*) into v_total_sections from public.game_sections where game_id = p_game_id;
  select count(*) into v_total_questions from public.questions where game_id = p_game_id;

  if v_total_sections = 0 then
    v_total_sections := 1;
  end if;
  if v_total_questions = 0 then
    v_total_questions := 60;
  end if;

  -- Build student progress array sorted by batch_number ASC
  select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  into v_students
  from (
    select
      p.user_id,
      coalesce(ss.batch_number, '') as batch_number,
      coalesce('Student ' || ss.batch_number, m.name, 'Student') as display_name,
      coalesce(ss.batch_number, m.name, 'Student') as display_class,
      p.status as game_status,
      p.current_section_index,
      coalesce(p.current_section_name, 'Section A') as current_section_name,
      p.completed_sections_count,
      v_total_sections as total_sections,
      case
        when p.status = 'submitted' then 'Completed'
        when p.completed_sections_count >= v_total_sections then 'Completed'
        else coalesce(p.current_section_status, 'In Progress')
      end as current_section_status,
      p.live_score as total_score,
      v_total_questions as max_score,
      p.total_correct as correct_answers,
      p.total_wrong as wrong_answers,
      greatest(v_total_questions - p.total_attempted, 0) as unanswered_questions,
      p.total_attempted as answered_questions,
      v_total_questions as total_questions,
      p.interruption_count,
      p.joined_at,
      p.last_seen_at,
      p.submitted_at as completed_at,
      r.completion_time_seconds,
      r.rank,
      -- Per-section breakdown array
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'section_id', gs.id,
          'name', gs.name,
          'position', gs.position,
          'score', coalesce(sr.score, 0),
          'solved_count', coalesce(sr.solved_count, 0),
          'total_questions', coalesce(sr.total_questions, (select count(*) from public.questions q where q.section_id = gs.id)),
          'completion_time_seconds', sr.completion_time_seconds,
          'status', case
            when sr.id is not null then 'Submitted'
            when gs.position = p.current_section_index and p.status <> 'submitted' then 'In Progress'
            when gs.position < p.current_section_index then 'Submitted'
            else 'Locked'
          end
        ) order by gs.position asc)
        from public.game_sections gs
        left join public.section_results sr on sr.section_id = gs.id and sr.user_id = p.user_id
        where gs.game_id = p_game_id
      ), '[]'::jsonb) as section_breakdown
    from public.participants p
    left join public.student_sessions ss on ss.id = p.user_id
    left join public.mentors m on m.auth_user_id = p.user_id
    left join public.results r on r.game_id = p_game_id and r.user_id = p.user_id
    where p.game_id = p_game_id
    order by coalesce(ss.batch_number, m.name, p.user_id::text) asc
  ) s;

  return jsonb_build_object(
    'game_id', p_game_id,
    'title', v_game_title,
    'game_code', v_game_code,
    'status', v_game_status,
    'start_time', v_start_time,
    'end_time', v_end_time,
    'time_limit_seconds', v_time_limit,
    'total_sections', v_total_sections,
    'total_questions', v_total_questions,
    'participant_count', (select count(*) from public.participants where game_id = p_game_id),
    'students', v_students
  );
end;
$$;

grant execute on function public.get_mentor_live_monitoring(uuid) to authenticated, service_role;
