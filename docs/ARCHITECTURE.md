# Architecture

This document explains the design decisions behind CROSSWORD ARENA's backend — the parts of the spec about server authority, RLS, and realtime efficiency — and where to find each piece in the code.

## Authentication: batch number + password, no email

Players register with a name, class, 6-digit batch number, and an unrestricted password. Rather than hand-roll password hashing and session/refresh-token handling, the app leans on Supabase Auth (`auth.users`), which already does this securely and is never exposed to PostgREST:

- A batch number is deterministically mapped to a synthetic internal email (`p<batch>@players.crossword-arena.internal`, see `src/lib/auth.ts`). Players never see this address.
- `supabase/functions/register` creates the `auth.users` row via the Auth Admin API (service role only) after checking batch-number uniqueness.
- `on_auth_user_created` (a trigger on `auth.users`, see `0003_functions_triggers.sql`) creates the matching `public.users` profile row — name/class/batch_number, no password of any kind.
- Login is a plain `supabase.auth.signInWithPassword()` call with the derived email — no custom Edge Function needed, and `supabase-js` handles session persistence/refresh/logout for free.
- `supabase/config.toml` sets `minimum_password_length = 1` and disables email confirmation, since "no complexity requirements" is a literal spec requirement and there's no real inbox behind the synthetic address.

`public.users.batch_number` carries its own `UNIQUE` + `CHECK (batch_number ~ '^[0-9]{6}$')` constraint, so uniqueness/format is enforced at the database level even if the Edge Function's pre-check is ever bypassed.

## The server-authority rule

Section 49 of the spec is blunt about this, so the schema is built to make it structurally true rather than just documented:

**Never writable by the `authenticated` role:** `games.status/start_time/end_time`, all of `questions` (including `answer`), `participants.live_score/live_solved_count`, all of `results`, `answers.is_correct`.

How that's enforced (see `0004_rls_policies.sql`):

- `games`, `questions`, `participants`, `results`: **no INSERT/UPDATE/DELETE policy exists for `authenticated`** — with RLS enabled and no matching policy, PostgREST returns zero rows / rejects the write. Every mutation goes through an Edge Function using the service-role key (`supabase/functions/_shared/supabaseAdmin.ts`'s `getAdminClient()`), which bypasses RLS entirely because that's the trust boundary, not the browser.
- `answers`: a client **can** write here directly (autosaving raw guess text is meant to be cheap and immediate), but a `BEFORE INSERT OR UPDATE` trigger (`protect_answers_is_correct`) forces `is_correct` back to its previous value unless a transaction-local flag (`app.trusted_write`) is set — and the only code that ever sets that flag is `check_word_answer()`, a `SECURITY DEFINER` function (below).
- `participants.interruption_count` is similarly only ever incremented by the `record_interruption()` `SECURITY DEFINER` function, never by a direct client UPDATE (participants has no UPDATE policy for `authenticated` at all).

## Answer key protection

`questions.answer` is never sent to a playing client:

- The base `questions` table has **no** SELECT policy for `authenticated`/`anon` — default deny.
- Clients read `public.questions_public`, a view that projects everything needed to render and play (clue, position, numbering, expected word length) but never the answer column, and self-filters to participants/creator of that game in its own `WHERE` clause.
- Correctness feedback ("is this word right?") comes from `check_word_answer(game_id, question_id, guess)`, a `SECURITY DEFINER` Postgres function that can read the real answer (definer functions run with the owner's privileges, bypassing the table's RLS) but only ever returns a boolean — the answer itself never crosses the wire. On a genuinely new correct solve it also atomically bumps `participants.live_score`/`live_solved_count`, which is what the realtime leaderboard reads.
- `create-game`'s Edge Function independently **regenerates** the crossword layout server-side from the raw clue/answer list (`supabase/functions/_shared/crosswordGenerator.ts`, a deliberate duplicate of `src/utils/crosswordGenerator.ts` — Deno Edge Functions can't import across the Vite/React build boundary) rather than trusting whatever grid the client's preview computed. A tampered client-side layout can never be persisted.
- `games.grid_layout` (readable by all authenticated users, needed to render the grid shape) stores only `{ rows, cols, cellMask }` — structural information, never the solution letters.

## Scoring: one formula, one place

`scoring_points_for_answer(length)` (SQL, `0003_functions_triggers.sql`) is the **only** place points are computed — base 50 + 5 per letter, applied the instant `check_word_answer()` validates a newly-correct word. `participants.live_score` is therefore already the authoritative running total during play.

Finalizing a result (`supabase/functions/_shared/finalizeResult.ts`, shared by `submit-game` and `update-game-state`) never recomputes points — it snapshots `live_score`/`live_solved_count` into an immutable `results` row alongside `accuracy` (a simple `solved/total` calculation) and `completion_time_seconds`. This is also why the in-progress leaderboard and the final results screen can never disagree: they're reading the same number.

Ranks are computed by `recompute_ranks(game_id)`, a `rank() over (order by score desc, completion_time_seconds asc)` window function — completion time is a tie-breaker only, never added to score.

## Server-authoritative timing, no per-player timer loop

`games.start_time`/`end_time` are set once, server-side, by `start-game`. Every client independently renders a countdown from `end_time - Date.now()` (`src/hooks/useGameTimer.ts`) — there is no backend process ticking per player.

Enforcement of "time's up" is a sweep, not a loop: `update-game-state` finds every `active` game whose `end_time` has passed, auto-submits (`finalizeParticipantResult(..., autoSubmitted: true)`) anyone who hasn't manually submitted using whatever they had saved, recomputes ranks, and flips the game to `ended`. It's called two ways, both idempotent:

1. **A player's own client**, the instant its local countdown hits zero (`nudgeGameStateIfExpired`) — cheap, immediate, no infrastructure.
2. **Optionally, `pg_cron` + `pg_net`** on a short interval (e.g. every 15–30s) calling the deployed function with no `gameId`, so a match still ends on time even if every participant's tab is closed. This is off by default (not every Supabase plan/project has `pg_cron` enabled) — wire it up in the dashboard's Database → Cron if you want the belt-and-suspenders version.

## Realtime, kept cheap

- **Waiting room roster + live leaderboard** are the same data source: `src/hooks/useGameParticipants.ts` subscribes to Postgres Changes on `participants` (filtered by `game_id`) and debounce-refetches the small roster. Because `participants.live_score`/`live_solved_count` only change inside `check_word_answer()` — a real scoring event, never a keystroke — this channel only fires on genuinely meaningful events (someone joined, someone solved a word), which is exactly the "controlled update interval" the spec asks for, without any custom throttling logic.
- **Game status/timing** (`src/hooks/useRealtimeGame.ts`) subscribes to a single-row UPDATE filter on `games`, so `start-game` flipping `status → active` reaches every connected client immediately without a manual broadcast fan-out.
- **Crossword letters are never broadcast.** Autosave writes go to `answers` (debounced ~600ms, plus immediately on word completion) and nothing subscribes to that table — per spec, players never see each other's in-progress typing.
- **Spectator/projector mode** (`/crossword/:gameCode/live`) doesn't use Realtime at all: it's unauthenticated, so it polls `get_spectator_snapshot(game_code)` — a `SECURITY DEFINER` function granted to `anon` — every 4 seconds. That function deliberately returns no clue/answer content, only title/status/timer fields/participant count/top-10 leaderboard.

## Why Edge Functions for some things and a DB function for others

Both are "server-side" in Supabase's terms; the split here is about who's allowed to call it and what it touches:

- **Edge Functions** (`create-game`, `join-game`, `start-game`, `submit-game`, `calculate-result`, `update-game-state`, `register`) use the **service role key**, so they're the only code that can write to `games`/`questions`/`participants`/`results`. They're used for multi-step operations with real business logic (game-code collision retry, "restore existing participation instead of duplicating", the finalize-and-recompute-ranks sequence).
- **`SECURITY DEFINER` SQL functions** (`check_word_answer`, `record_interruption`, `get_spectator_snapshot`, `recompute_ranks`) are for single, high-frequency, narrowly-scoped operations callable directly by `authenticated` (or `anon`, for the spectator one) via `supabase.rpc()` — no network hop to a Deno cold start for something that happens every time a player finishes typing a word.

## Known simplifications

- `pg_cron` sweeping is documented but not auto-configured (see above) — the client-triggered sweep is what actually guarantees a match ends even with `pg_cron` off, just slightly less precisely than a scheduled sweep would.
- The crossword generator's "shelved word becomes a disconnected island" fallback (see its doc comment in `src/utils/crosswordGenerator.ts`) trades strict connectivity for always producing *a* valid grid rather than erroring out on inputs that share few letters — this matches the spec's "attempt to intersect" wording rather than "guarantee".
