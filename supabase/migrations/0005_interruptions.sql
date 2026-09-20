-- ============================================================================
-- record_interruption — server-authoritative interruption counter.
-- Called by the client when fullscreen is exited during Competition Mode.
-- The displayed "Interruption Count" therefore always reflects the number
-- the server has actually recorded, not a value the client could inflate
-- or reset on its own.
-- ============================================================================
create function public.record_interruption(p_game_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.game_id = p_game_id and p.user_id = auth.uid()
  ) then
    raise exception 'not a participant of this game';
  end if;

  update public.participants
  set interruption_count = interruption_count + 1
  where game_id = p_game_id and user_id = auth.uid()
  returning interruption_count into v_new_count;

  return v_new_count;
end;
$$;

grant execute on function public.record_interruption(uuid) to authenticated;
