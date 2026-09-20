-- ============================================================================
-- CROSSWORD ARENA — Row Level Security
-- ============================================================================
-- Golden rule: score, rank, completion_time, is_correct and game
-- status/timing are NEVER writable by the `authenticated` role. They are
-- only ever written by SECURITY DEFINER functions (check_word_answer,
-- recompute_ranks) or by Edge Functions using the service_role key, which
-- bypasses RLS entirely. Everything below enforces that split.
-- ============================================================================

alter table public.users enable row level security;
alter table public.games enable row level security;
alter table public.questions enable row level security;
alter table public.participants enable row level security;
alter table public.answers enable row level security;
alter table public.results enable row level security;
alter table public.game_events enable row level security;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
create policy users_select_self_or_game_peers
on public.users for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.participants theirs
    where theirs.user_id = public.users.id
      and public.is_game_participant(theirs.game_id, auth.uid())
  )
);

-- No insert/update/delete policies for `authenticated`: profiles are created
-- exclusively by the handle_new_auth_user trigger.
revoke insert, update, delete on public.users from authenticated;

-- ----------------------------------------------------------------------------
-- games — visible to any authenticated user (needed to look a game up by
-- code before joining); mutated only by Edge Functions via service_role.
-- ----------------------------------------------------------------------------
create policy games_select_any_authenticated
on public.games for select
to authenticated
using (true);

revoke insert, update, delete on public.games from authenticated;

-- ----------------------------------------------------------------------------
-- questions — no policies at all for authenticated/anon: default deny.
-- Clients read via the answer-free public.questions_public view instead.
-- ----------------------------------------------------------------------------
revoke all on public.questions from authenticated, anon;

-- ----------------------------------------------------------------------------
-- participants — visible to game peers (roster/leaderboard); all writes go
-- through join-game / start-game / submit-game Edge Functions.
-- ----------------------------------------------------------------------------
create policy participants_select_game_peers
on public.participants for select
to authenticated
using (
  user_id = auth.uid()
  -- NOT a plain self-join subquery against participants: querying this
  -- same table from within its own policy causes Postgres to re-apply
  -- this policy to the inner query, and so on forever ("infinite
  -- recursion detected in policy for relation participants"). The
  -- SECURITY DEFINER helper below bypasses RLS internally, breaking the
  -- cycle. See its definition in 0003_functions_triggers.sql.
  or public.is_game_participant(public.participants.game_id, auth.uid())
  or exists (
    select 1 from public.games g
    where g.id = public.participants.game_id
      and g.creator_id = auth.uid()
  )
);

revoke insert, update, delete on public.participants from authenticated;

-- ----------------------------------------------------------------------------
-- answers — a player can read/write ONLY their own progress, only while
-- they are an active participant of an active game. is_correct is further
-- locked down by the protect_answers_is_correct trigger.
-- ----------------------------------------------------------------------------
create policy answers_select_own
on public.answers for select
to authenticated
using (user_id = auth.uid());

-- Both write policies below gate on end_time as well as status = 'active'
-- for the same reason check_word_answer does (see its comment in
-- 0003_functions_triggers.sql): status only flips to 'ended' once the
-- update-game-state sweep runs, which is nudged by a client's own timer,
-- so it can never be the only thing standing between "time's up" and a
-- client still being able to write.
create policy answers_insert_own_active_game
on public.answers for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.participants p
    where p.game_id = public.answers.game_id and p.user_id = auth.uid()
  )
  and exists (
    select 1 from public.games g
    where g.id = public.answers.game_id
      and g.status = 'active'
      and (g.end_time is null or now() < g.end_time)
  )
);

create policy answers_update_own_active_game
on public.answers for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.games g
    where g.id = public.answers.game_id
      and g.status = 'active'
      and (g.end_time is null or now() < g.end_time)
  )
);

revoke delete on public.answers from authenticated;

-- ----------------------------------------------------------------------------
-- results — read-only to game peers; only service_role (submit-game /
-- update-game-state / recompute_ranks) ever writes a row.
-- ----------------------------------------------------------------------------
create policy results_select_game_peers
on public.results for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.participants p
    where p.game_id = public.results.game_id and p.user_id = auth.uid()
  )
);

revoke insert, update, delete on public.results from authenticated;

-- ----------------------------------------------------------------------------
-- game_events — a player may log their own client-side monitoring events;
-- only the event's own author or the game's creator may read them back.
-- ----------------------------------------------------------------------------
create policy game_events_select_own_or_creator
on public.game_events for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.games g
    where g.id = public.game_events.game_id and g.creator_id = auth.uid()
  )
);

create policy game_events_insert_own
on public.game_events for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.participants p
    where p.game_id = public.game_events.game_id and p.user_id = auth.uid()
  )
);

revoke update, delete on public.game_events from authenticated;
