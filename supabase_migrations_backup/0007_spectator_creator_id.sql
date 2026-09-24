-- ============================================================================
-- Migration 0007: Expose game_id and creator_id in spectator snapshot
-- ============================================================================
-- Allows the spectator view to identify if the current viewer is the match
-- creator and invoke creator actions (e.g. stopGame(game_id)).
-- ============================================================================

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
begin
  select * into v_game from public.games where game_code = upper(p_game_code);

  if v_game.id is null then
    return null;
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
    'leaderboard', (
      select coalesce(jsonb_agg(row_to_json(top)), '[]'::jsonb)
      from (
        select
          u.name,
          p.live_score as score,
          p.live_solved_count as solved_count,
          rank() over (order by p.live_score desc, p.live_solved_count desc) as rank
        from public.participants p
        join public.users u on u.id = p.user_id
        where p.game_id = v_game.id
        order by p.live_score desc, p.live_solved_count desc
        limit 10
      ) top
    )
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_spectator_snapshot(text) to anon, authenticated;
