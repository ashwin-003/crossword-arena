# Testing Strategy

This project ships without a full automated test suite pre-wired (no test runner is installed), but the codebase is structured so the pieces that matter most — server-authoritative logic and the crossword algorithm — are pure functions or isolated modules that are cheap to test. This document is both the rationale and a concrete plan for the coverage a team running this at a real event should add before relying on it.

## What's already verifiable today

`npm run test:generator` runs `scripts/dev-test-generator.ts`, a standalone smoke test for `src/utils/crosswordGenerator.ts` that checks: every placed word's letters match the shared grid at every cell they touch (no silent corruption), all input words get placed (directly interlocking or as a fallback island), and empty input is rejected with a clear error. Run it after any change to the generator.

## Recommended layers, in priority order

### 1. Crossword generator — unit tests (highest value, zero infra needed)

`src/utils/crosswordGenerator.ts` and its Deno twin `supabase/functions/_shared/crosswordGenerator.ts` are pure functions: `DraftClueInput[] → CrosswordGenerationResult`. Add Vitest (`npm install -D vitest`) and cover:

- A nicely-interlocking set of words places 100% of them (regression-tests the intersection search).
- Words sharing no letters at all still produce a *valid* grid (the disconnected-island fallback) rather than erroring.
- Duplicate/invalid answers (too short, too long, non-letters) are rejected with a message naming the offending entry.
- Numbering follows standard crossword rules: a cell is numbered iff it starts an across and/or down entry of length ≥ 2, numbers increase in row-major order.
- Every generated grid stays within `MAX_GRID_DIMENSION` (26×26).
- The two copies of the generator (client + Edge Function) stay behaviorally identical — run the same fixture set against both and diff the output. This is the one place duplication was accepted (Deno can't import across the Vite build boundary) and it's worth a regression test specifically to catch drift.

### 2. Database — RLS and function tests (`supabase test db`)

The Supabase CLI supports pgTAP tests under `supabase/tests/`. The highest-value cases, given how much of this app's security lives in `0004_rls_policies.sql` and the `SECURITY DEFINER` functions:

- A user cannot `SELECT` another user's row from `public.users` unless they share a game.
- A user cannot `SELECT` anything from `public.questions` directly (only via `questions_public`, and only for their own games).
- A user cannot `UPDATE` `games.status`, `participants.live_score`, or any column of `results` directly through PostgREST.
- `answers.is_correct` cannot be set to `true` by a direct client `UPDATE` — only `check_word_answer()` can flip it.
- `check_word_answer()` rejects calls for a game the caller isn't a participant of, and for a game that isn't `active`.
- `record_interruption()` and `recompute_ranks()` respect their intended callers (the latter is `service_role`-only).
- `get_spectator_snapshot()` never returns clue or answer content.

### 3. Edge Functions — integration tests against a local Supabase stack

With `supabase start` running, hit each function with `curl`/a small Deno or Node test script and assert on status codes and payloads:

- `register`: duplicate batch number → 409; malformed batch number → 422; success → a queryable `auth.users` row with the right synthetic email.
- `create-game`: an unplaceable clue set → 422 with a useful message; success → `games`/`questions`/`participants` rows exist and `grid_layout` contains no answer text.
- `join-game`: invalid code → 404; already-active game → 409; second join by the same user → `alreadyJoined: true`, no duplicate row (exercises the `participants_unique_membership` constraint path).
- `start-game`: non-creator → 403; double-start race (two concurrent calls) → exactly one succeeds, thanks to the `eq('status','waiting')` guard on the update.
- `submit-game`: idempotent on a second call (same result returned, no duplicate `results` row, `results_unique_membership` constraint enforced).
- `update-game-state`: a game whose `end_time` is in the past gets swept to `ended` and every un-submitted participant gets an `auto_submitted: true` result.

### 4. Frontend component tests

For the highest-complexity interactive piece, `useCrosswordPlay` (`src/hooks/useCrosswordPlay.ts`) and `CrosswordGrid` (`src/components/crossword/CrosswordGrid.tsx`), with React Testing Library:

- Typing a letter advances the selection to the next cell in the current word; typing at the last cell of a word does not overflow.
- Backspace on an empty cell moves back and clears the previous cell; on a filled cell it just clears in place.
- Arrow keys skip blocked cells and stop at grid edges.
- Tab/Shift+Tab cycle through clues in number order; Enter toggles direction at an intersection.
- Completing a word triggers exactly one `check_word_answer` RPC call (not one per keystroke) and exactly one debounced `answers` upsert flush.

### 5. End-to-end (Playwright, already usable in this sandbox — Chromium is preinstalled)

The one flow worth automating end-to-end given how many moving parts touch it: **register → create a 2-clue match → open a second browser context, join by code → creator starts → both browsers see the grid → solve → submit → both land on a results screen with a correct rank ordering.** This is the flow most likely to regress silently (it touches Auth, RLS, Realtime, and three Edge Functions in sequence) and the cheapest to catch with one script.

## Manual QA checklist for a real event

Run through this on the actual deployed (Vercel + hosted Supabase) stack, not just locally, before a live event:

- Fullscreen gate → exit fullscreen mid-match → interruption overlay appears with an incrementing count → return to fullscreen → play resumes with progress intact.
- Kill Wi-Fi for 10 seconds mid-match → reconnect → "Reconnecting…" then "Reconnected" toast → grid state matches what was last saved server-side.
- Two devices, same account, same match: not a supported flow (the UNIQUE `(game_id, user_id)` constraint means only one participant row) — verify the second device just resumes the same session rather than erroring confusingly.
- Let a match's timer expire with a browser tab left open and idle → auto-submit fires, "Time's Up" message shown, results are correct.
- Projector route (`/crossword/:code/live`) open in an incognito window with no login at all → loads and updates without ever prompting for auth.
