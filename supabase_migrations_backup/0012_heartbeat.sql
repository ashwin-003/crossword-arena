-- Server-side "last seen" heartbeat. Fullscreen-exit events only fire
-- while the tab stays open, so someone who fully closes the tab was never
-- detected at all before this. Clients call touch_last_seen every ~20s
-- while actively playing; a stale value means they're really gone.
alter table public.participants add column last_seen_at timestamptz not null default now();

create function public.touch_last_seen(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.participants
  set last_seen_at = now()
  where game_id = p_game_id and user_id = auth.uid();
end;
$$;

grant execute on function public.touch_last_seen(uuid) to authenticated;
