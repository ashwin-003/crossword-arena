-- Fix get_spectator_snapshot: the old schema joined public.students on auth_user_id,
-- but the new students table only has batch_number (text primary key).
-- Participants created by students use student_sessions.id as user_id,
-- so we must join student_sessions to resolve display names.

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
        r.score,
        r.solved_count,
        r.rank
      from public.results r
      left join public.student_sessions ss on ss.id = r.user_id
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
        coalesce('Student ' || ss.batch_number, m.name, 'Player') as name,
        p.live_score as score,
        p.live_solved_count as solved_count,
        rank() over (order by p.live_score desc, p.live_solved_count desc) as rank
      from public.participants p
      left join public.student_sessions ss on ss.id = p.user_id
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
