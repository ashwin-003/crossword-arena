# Load Testing Strategy

Target: comfortably handle 60–70 simultaneous players (a real college event), architected and tested toward 150 concurrent users.

## Why the architecture should hold up

Worth restating before the numbers below, because it's *why* these targets are realistic rather than aspirational (see `docs/ARCHITECTURE.md` for the full detail):

- No per-player backend timer loop — every client renders its own countdown from a shared `end_time`; the server's only timing work is the periodic/triggered `update-game-state` sweep.
- No per-keystroke database writes — autosave is debounced (~600ms) and only flushed immediately on word completion; the live leaderboard only updates on real scoring events, not typing.
- No per-keystroke realtime broadcasts — the only Realtime subscriptions are on `participants` (roster + score changes) and a single `games` row (status/timing), both naturally low-frequency.
- All the hot-path writes (`check_word_answer`) are a single `SECURITY DEFINER` SQL round-trip, not an Edge Function cold start.
- `game_code` and the `(game_id, user_id)` pairs on `participants`/`answers`/`results` are all indexed (see `0001_init_schema.sql`).

## Tooling

`loadtest/k6-match-flow.js` — a [k6](https://k6.io) script simulating the join → wait-for-start → solve a couple of words → submit loop against a real (staging) Supabase project. It hits the same endpoints the real client does: the `join-game`/`submit-game` Edge Functions, a `games` poll (standing in for the Realtime subscription), `questions_public`, and the `check_word_answer` RPC.

k6 is a good fit here because the load that matters is HTTP/RPC throughput (PostgREST + Edge Functions), not maintaining thousands of open WebSocket connections — Realtime's own connection scaling is Supabase's concern, not something this app's code needs to load-test directly. If you want to specifically validate Realtime fan-out under load, pair this with a small number of scripted browser sessions (Playwright) watching for the toast/leaderboard update latency while the k6 script runs.

### Seeding test accounts

The load test expects pre-registered demo accounts, batch numbers `200001`–`200150`, password `loadtest123` — don't register 150 accounts through the UI by hand. Use the `register` Edge Function directly in a loop against your **staging** project (never production):

```bash
for i in $(seq -w 200001 200150); do
  curl -s -X POST "$SUPABASE_URL/functions/v1/register" \
    -H "Content-Type: application/json" -H "apikey: $SUPABASE_ANON_KEY" \
    -d "{\"name\":\"LoadTest $i\",\"className\":\"LT\",\"batchNumber\":\"$i\",\"password\":\"loadtest123\"}"
done
```

Create the match itself once, normally, through the app UI (or `create-game` directly) — match creation is a single creator action, not something to load-test at concurrency; note its game code for the `GAME_CODE` env var below.

## Staged plan

Run each tier against a staging Supabase project (same plan/region you intend to actually use for the event), not local Docker — local resource limits don't reflect production. Between tiers, check the Supabase dashboard's Database and Edge Function metrics (CPU, active connections, function invocation latency) in addition to k6's own summary.

| Tier | Command | What to watch | Pass bar |
|---|---|---|---|
| 20 users | `k6 run -e VUS=20 -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e GAME_CODE=... loadtest/k6-match-flow.js` | Baseline latency, no errors | p95 < 500ms on all three timed operations, 0% failure |
| 50 users | same, `VUS=50` | Postgres connection count, PostgREST queueing | p95 < 800ms, <1% failure |
| 70 users | same, `VUS=70` | This is the real target size — treat any regression here as a blocker | p95 < 1000ms, <1% failure |
| 100 users | same, `VUS=100` | Where you'd expect the first signs of strain if any exist | p95 < 1500ms, <2% failure |
| 150 users | same, `VUS=150` | Stretch target from the spec | Document actual numbers even if the bar isn't met — this tier is "test toward", not a hard launch blocker |

Run tiers back-to-back with a couple of minutes of cooldown between them so one tier's tail latency doesn't bleed into the next's baseline.

## What to specifically verify at each tier (beyond the k6 thresholds)

- **Login performance:** `auth/v1/token` latency — Supabase Auth is usually not the bottleneck, but confirm.
- **Game creation:** a single creator action; verify it stays fast even while the join/solve/submit load from other VUs is in flight (it shouldn't contend — different tables, no shared locks in the hot path).
- **Joining:** the `participants_unique_membership` unique index should make concurrent joins-to-the-same-game cheap; watch for `23505` collision-retry behavior in `join-game`'s logs if you script simultaneous joins from a cold start.
- **Waiting room updates:** open a real browser (not k6) against the same match while the load test's VUs join, and eyeball that the participant count/toasts keep up without visibly lagging.
- **Game start synchronization:** measure the spread between when `start-game` returns and when each polling/subscribed client observes `status = 'active'` — this is the closest proxy for "how synchronized does the countdown feel."
- **Realtime connection stability:** in the Supabase dashboard, watch the Realtime concurrent-connections graph during a real-browser-heavy tier (not k6, which doesn't open Realtime sockets).
- **Autosave load:** the `check_word_duration` trend in the k6 summary *is* this — it's the same RPC autosave's "word complete" path calls.
- **Leaderboard updates:** since leaderboard reads come from `participants` (already covered by roster polling), no separate load path is needed — but do watch that Postgres Changes fan-out doesn't lag under the write volume the k6 script generates.
- **Submission bursts:** the script's per-VU `sleep(Math.random() * 2)` staggers word-solving, but nothing staggers the final submit — intentionally, since a real match's timer expiring produces exactly this burst. `submit_game_duration`'s p95/p99 under the 70-user tier is the number that matters most.
- **Result calculation:** `recompute_ranks` runs once per submission inside `submit-game`; at high submission-burst concurrency, watch for lock contention on the `results` table (concurrent `rank()` recomputes over the same `game_id`) — if this shows up as latency at the 150-user tier, the mitigation is debouncing `recompute_ranks` calls (e.g., only recompute if >1s has passed since the last one for that game) rather than calling it unconditionally on every submit.
- **Database performance:** Supabase dashboard → Database → Query Performance, sorted by total time, after each tier.
- **Reconnection behavior:** manually kill and restore network on a couple of real browser sessions mid-load-test; confirm `useRealtimeGame`'s reconnect-triggered refetch and `useCrosswordPlay.reload()` still work with background write load in flight.

## After the run

Record actual p50/p95/p99 numbers per tier in this file (replace this section) rather than just "pass/fail" — the next person tuning this needs the numbers, not just a checkmark.
