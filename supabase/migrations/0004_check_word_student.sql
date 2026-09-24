-- ============================================================================
-- 0004_check_word_student.sql
-- ============================================================================
-- Update check_word_answer, touch_last_seen, and questions_public to accept
-- an explicit p_user_id or fall back to auth.uid().
-- Security: Verifies that p_user_id is a valid participant of the active game.
-- ============================================================================

-- 1. check_word_answer
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
    v_points := public.scoring_points_for_answer(char_length(v_answer));

    update public.participants
    set live_score = live_score + v_points,
        live_solved_count = live_solved_count + 1
    where game_id = p_game_id and user_id = v_effective_user_id;
  elsif not v_now_correct and coalesce(v_was_correct, false) = true then
    select public.scoring_points_for_answer(char_length(v_answer)) into v_points;

    update public.participants
    set live_score = greatest(live_score - v_points, 0),
        live_solved_count = greatest(live_solved_count - 1, 0)
    where game_id = p_game_id and user_id = v_effective_user_id;

    v_points := 0;
  end if;

  return query select v_now_correct, v_points;
end;
$$;

grant execute on function public.check_word_answer(uuid, uuid, text, uuid) to anon, authenticated;

-- 2. touch_last_seen
create or replace function public.touch_last_seen(p_game_id uuid, p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_user_id uuid;
begin
  v_effective_user_id := coalesce(p_user_id, auth.uid());
  if v_effective_user_id is not null then
    update public.participants
    set last_seen_at = now()
    where game_id = p_game_id and user_id = v_effective_user_id;
  end if;
end;
$$;

grant execute on function public.touch_last_seen(uuid, uuid) to anon, authenticated;

-- 3. update questions_public view to allow participants regardless of auth role
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
from public.questions q;

grant select on public.questions_public to anon, authenticated;
