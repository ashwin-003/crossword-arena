-- Per-player answer review, only after THEIR OWN submission. Deliberately
-- separate from questions_public (which never exposes the answer column):
-- this reveals the correct answer, gated entirely inside the function on
-- the caller already having status = 'submitted' for this game, so there
-- is no way to see answers before finishing your own attempt.
create function public.get_my_review(p_game_id uuid)
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
