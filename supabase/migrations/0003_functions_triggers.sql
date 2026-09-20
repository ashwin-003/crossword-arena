-- ============================================================================
-- CROSSWORD ARENA — functions & triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic updated_at maintenance
-- ----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

create trigger answers_set_updated_at
  before update on public.answers
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- is_game_participant: RLS helper. Several policies below need to ask "is
-- auth.uid() a participant of this game?" from WITHIN a policy defined on
-- the participants table itself (e.g. "show me every row for a game I'm
-- also in"). A plain correlated subquery against public.participants
-- inside that same table's own policy makes Postgres re-evaluate that same
-- policy for the inner query, which re-evaluates it again for its own
-- inner query, forever — "infinite recursion detected in policy for
-- relation participants". Routing the membership check through a SECURITY
-- DEFINER function breaks the cycle: the function body runs as its owner
-- and therefore bypasses RLS entirely for this one narrow, safe check.
-- ----------------------------------------------------------------------------
create function public.is_game_participant(p_game_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.participants
    where game_id = p_game_id and user_id = p_user_id
  );
$$;

grant execute on function public.is_game_participant(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Profile provisioning: a public.users row is born the moment Supabase Auth
-- creates the underlying auth.users row (done by the register Edge Function
-- via the service-role admin API). name/class/batch_number travel in via
-- user_metadata so this trigger is the ONLY place a profile is created.
-- ----------------------------------------------------------------------------
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, class, batch_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Player'),
    coalesce(new.raw_user_meta_data ->> 'class', ''),
    new.raw_user_meta_data ->> 'batch_number'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- Trusted-write gate: distinguishes calls made by our own SECURITY DEFINER
-- functions (which set a transaction-local flag) from ordinary PostgREST
-- writes made directly by an authenticated client. Used to protect columns
-- that must only ever be set by server-side logic.
-- ----------------------------------------------------------------------------
create function public.is_trusted_write()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.trusted_write', true), '') = 'on';
$$;

-- A client is allowed to autosave the raw text of its own guess into
-- answers.answer, but can never mark itself correct: is_correct is only ever
-- written by check_word_answer() below (which sets the trusted-write flag).
create function public.protect_answers_is_correct()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_write() then
    if tg_op = 'INSERT' then
      new.is_correct := null;
    else
      new.is_correct := old.is_correct;
    end if;
  end if;
  return new;
end;
$$;

create trigger answers_protect_is_correct
  before insert or update on public.answers
  for each row execute function public.protect_answers_is_correct();

-- ----------------------------------------------------------------------------
-- Scoring — the single, centralized formula. Base points per solved entry
-- plus a small per-letter bonus for longer answers. Completion time is used
-- purely as a tie-breaker at rank time, never added to the score itself.
-- Changing the competition's economy means editing ONLY this function.
-- ----------------------------------------------------------------------------
create function public.scoring_points_for_answer(p_answer_length integer)
returns integer
language sql
immutable
as $$
  select 50 + (5 * greatest(p_answer_length, 0));
$$;

-- ----------------------------------------------------------------------------
-- check_word_answer — the ONLY path by which a guess is ever validated.
-- Runs as SECURITY DEFINER so it can read public.questions.answer (which
-- authenticated clients otherwise cannot select at all), while enforcing its
-- own authorization: caller must be an active participant of an active game.
-- On a *new* correct solve it atomically bumps the participant's live score,
-- which is what powers the realtime leaderboard (see participants table).
-- ----------------------------------------------------------------------------
create function public.check_word_answer(p_game_id uuid, p_question_id uuid, p_guess text)
returns table (is_correct boolean, points_awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer text;
  v_normalized_guess text := upper(regexp_replace(coalesce(p_guess, ''), '[^A-Za-z]', '', 'g'));
  v_was_correct boolean;
  v_now_correct boolean;
  v_points integer := 0;
  v_game_status public.game_status;
  v_game_end_time timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select g.status, g.end_time into v_game_status, v_game_end_time
  from public.games g where g.id = p_game_id;

  if v_game_status is distinct from 'active' then
    raise exception 'game is not active';
  end if;

  -- Defense in depth: status only flips to 'ended' when the
  -- update-game-state sweep runs, which is nudged by each client's own
  -- timer hitting zero. A client is never trusted to send that nudge —
  -- checking end_time here too means scoring stops the instant server
  -- time passes it, even if every client stayed silent.
  if v_game_end_time is not null and now() >= v_game_end_time then
    raise exception 'game is not active';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.game_id = p_game_id and p.user_id = auth.uid()
  ) then
    raise exception 'not a participant of this game';
  end if;

  select q.answer into v_answer
  from public.questions q
  where q.id = p_question_id and q.game_id = p_game_id;

  if v_answer is null then
    raise exception 'question not found for this game';
  end if;

  v_now_correct := (v_normalized_guess = v_answer);

  select a.is_correct into v_was_correct
  from public.answers a
  where a.game_id = p_game_id and a.user_id = auth.uid() and a.question_id = p_question_id;

  perform set_config('app.trusted_write', 'on', true);

  insert into public.answers (game_id, user_id, question_id, answer, is_correct, updated_at)
  values (p_game_id, auth.uid(), p_question_id, v_normalized_guess, v_now_correct, now())
  on conflict (game_id, user_id, question_id)
  do update set answer = excluded.answer, is_correct = excluded.is_correct, updated_at = now();

  if v_now_correct and coalesce(v_was_correct, false) = false then
    v_points := public.scoring_points_for_answer(char_length(v_answer));

    update public.participants
    set live_score = live_score + v_points,
        live_solved_count = live_solved_count + 1
    where game_id = p_game_id and user_id = auth.uid();
  elsif not v_now_correct and coalesce(v_was_correct, false) = true then
    -- Player overwrote a previously-correct word with an incorrect one:
    -- claw back the points so live_score always matches reality.
    select public.scoring_points_for_answer(char_length(v_answer)) into v_points;

    update public.participants
    set live_score = greatest(live_score - v_points, 0),
        live_solved_count = greatest(live_solved_count - 1, 0)
    where game_id = p_game_id and user_id = auth.uid();

    v_points := 0;
  end if;

  return query select v_now_correct, v_points;
end;
$$;

grant execute on function public.check_word_answer(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- recompute_ranks — service-role only. Called by the submit-game /
-- update-game-state Edge Functions after a result is finalized.
-- ----------------------------------------------------------------------------
create function public.recompute_ranks(p_game_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.results r
  set rank = ranked.rnk
  from (
    select id, rank() over (order by score desc, completion_time_seconds asc) as rnk
    from public.results
    where game_id = p_game_id
  ) ranked
  where r.id = ranked.id;
$$;

revoke all on function public.recompute_ranks(uuid) from public, authenticated, anon;
grant execute on function public.recompute_ranks(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- get_spectator_snapshot — powers the public projector/spectator route.
-- Deliberately excludes clue/answer content entirely.
-- ----------------------------------------------------------------------------
create function public.get_spectator_snapshot(p_game_code text)
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
