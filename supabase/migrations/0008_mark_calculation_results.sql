-- ============================================================================
-- 0008_mark_calculation_results.sql
-- ============================================================================
-- 1. Standardize scoring formula: 1 mark per correct question (max 60 marks).
-- 2. Update check_word_answer to award 1 mark per correct answer.
-- 3. Update recompute_ranks with deterministic tie-breaker:
--    score DESC -> completion_time_seconds ASC -> batch_number ASC.
-- 4. Update get_spectator_snapshot with correct scoring and ranking.
-- ============================================================================

-- 1. scoring_points_for_answer: Exactly 1 mark per correct answer
create or replace function public.scoring_points_for_answer(p_answer_length integer)
returns integer
language sql
immutable
as $$
  select 1;
$$;

grant execute on function public.scoring_points_for_answer(integer) to anon, authenticated, service_role;

-- 2. check_word_answer: 1 mark per correct answer
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
    raise exception 'game is not active';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.game_id = p_game_id and p.user_id = v_effective_user_id
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
  where a.game_id = p_game_id and a.user_id = v_effective_user_id and a.question_id = p_question_id;

  insert into public.answers (game_id, user_id, question_id, answer, is_correct, updated_at)
  values (p_game_id, v_effective_user_id, p_question_id, v_normalized_guess, v_now_correct, now())
  on conflict (game_id, user_id, question_id)
  do update set answer = excluded.answer, is_correct = excluded.is_correct, updated_at = now();

  if v_now_correct and coalesce(v_was_correct, false) = false then
    v_points := 1;

    update public.participants
    set live_score = live_score + 1,
        live_solved_count = live_solved_count + 1
    where game_id = p_game_id and user_id = v_effective_user_id;
  elsif not v_now_correct and coalesce(v_was_correct, false) = true then
    v_points := 0;

    update public.participants
    set live_score = greatest(live_score - 1, 0),
        live_solved_count = greatest(live_solved_count - 1, 0)
    where game_id = p_game_id and user_id = v_effective_user_id;
  end if;

  return query select v_now_correct, v_points;
end;
$$;

grant execute on function public.check_word_answer(uuid, uuid, text, uuid) to anon, authenticated, service_role;

-- 3. recompute_ranks: Deterministic tie-breaker
--    score DESC -> completion_time_seconds ASC -> batch_number ASC
create or replace function public.recompute_ranks(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.results r
  set rank = ranked.rnk
  from (
    select
      r.id,
      row_number() over (
        order by
          r.score desc,
          r.completion_time_seconds asc,
          coalesce(ss.batch_number, m.name, r.id::text) asc
      ) as rnk
    from public.results r
    left join public.student_sessions ss on ss.id = r.user_id
    left join public.mentors m on m.auth_user_id = r.user_id
    where r.game_id = p_game_id
  ) ranked
  where r.id = ranked.id;
$$;

grant execute on function public.recompute_ranks(uuid) to anon, authenticated, service_role;

-- 4. get_spectator_snapshot: Deterministic sorting
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
      select
        coalesce('Student ' || ss.batch_number, m.name, 'Player') as name,
        coalesce(ss.batch_number, '') as batch_number,
        r.score,
        r.solved_count,
        r.completion_time_seconds,
        r.rank
      from public.results r
      left join public.student_sessions ss on ss.id = r.user_id
      left join public.mentors m on m.auth_user_id = r.user_id
      where r.game_id = v_game.id
      order by r.rank asc nulls last
      limit 200
    ) top;
  else
    select coalesce(jsonb_agg(row_to_json(top)), '[]'::jsonb)
    into v_leaderboard
    from (
      select
        coalesce('Student ' || ss.batch_number, m.name, 'Player') as name,
        coalesce(ss.batch_number, '') as batch_number,
        p.live_score as score,
        p.live_solved_count as solved_count,
        row_number() over (
          order by
            p.live_score desc,
            p.live_solved_count desc,
            coalesce(ss.batch_number, m.name, p.id::text) asc
        ) as rank
      from public.participants p
      left join public.student_sessions ss on ss.id = p.user_id
      left join public.mentors m on m.auth_user_id = p.user_id
      where p.game_id = v_game.id
      order by
        p.live_score desc,
        p.live_solved_count desc,
        coalesce(ss.batch_number, m.name, p.id::text) asc
      limit 200
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

grant execute on function public.get_spectator_snapshot(text) to anon, authenticated, service_role;
