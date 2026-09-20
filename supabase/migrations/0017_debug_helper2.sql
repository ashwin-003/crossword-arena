create or replace function public.debug_game_questions()
returns json
language sql
security definer
as $$
  select json_build_object(
    'users', (select json_agg(row_to_json(u)) from (select id, name, batch_number from public.users) u),
    'games', (select json_agg(row_to_json(g)) from (select id, game_code, title, creator_id, status, created_at from public.games order by created_at desc) g),
    'questions', (select json_agg(row_to_json(q)) from (select id, game_id, number, direction, clue from public.questions) q),
    'participants', (select json_agg(row_to_json(p)) from (select id, game_id, user_id, status from public.participants) p)
  );
$$;

grant execute on function public.debug_game_questions() to anon, authenticated;
