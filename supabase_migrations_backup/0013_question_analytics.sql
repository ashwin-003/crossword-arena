-- Per-question solve-rate for the creator's post-match analytics view.
-- Creator-only (checked inside the function, not just via RLS) since it
-- aggregates from `answers`/`questions`, which clients can't query directly.
create function public.get_question_analytics(p_game_id uuid)
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
