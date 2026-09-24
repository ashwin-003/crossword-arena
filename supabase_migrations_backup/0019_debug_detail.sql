create or replace function public.debug_game_questions_detail()
returns json
language sql
security definer
as $$
  select json_agg(row_to_json(q))
  from (
    select id, number, direction, row_index, col_index, clue, answer
    from public.questions
    where game_id = '01e95fa0-b75f-4f4a-b2da-6375817c70b0'
    order by number, direction
  ) q;
$$;

grant execute on function public.debug_game_questions_detail() to anon, authenticated;
