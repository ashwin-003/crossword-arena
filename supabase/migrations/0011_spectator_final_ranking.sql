-- Once a match has ended, the spectator/projector leaderboard should show
-- the authoritative final ranking (score desc, completion_time_seconds asc
-- — see recompute_ranks) pulled from `results`, instead of the live
-- in-progress `participants.live_score` figures, which have no concept of
-- completion time and can't correctly break ties once everyone is done.
-- While the match is still waiting/active, behavior is unchanged.
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
      select u.name, r.score, r.solved_count, r.rank
      from public.results r
      join public.users u on u.id = r.user_id
      where r.game_id = v_game.id
      order by r.rank asc nulls last
      limit 10
    ) top;
  else
    select coalesce(jsonb_agg(row_to_json(top)), '[]'::jsonb)
    into v_leaderboard
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
