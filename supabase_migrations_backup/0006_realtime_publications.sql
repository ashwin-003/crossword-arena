-- ============================================================================
-- CROSSWORD ARENA — Realtime Publications
-- ============================================================================
-- Ensure that tables used in Realtime Postgres Changes subscriptions
-- (games for start/status updates, participants for join/status, answers for progress)
-- broadcast UPDATE/INSERT events to subscribed clients.
-- ============================================================================

do $$
begin
  -- Add games to supabase_realtime publication if not already included
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;

  -- Add participants to supabase_realtime publication
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;

  -- Add player_answers (or answers) to supabase_realtime publication
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'answers'
  ) then
    alter publication supabase_realtime add table public.answers;
  end if;
end;
$$;
