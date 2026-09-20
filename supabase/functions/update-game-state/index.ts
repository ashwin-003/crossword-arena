// POST /update-game-state
// { gameId?: string }
//
// Sweeps any 'active' game whose server-authoritative end_time has passed:
// auto-submits every participant who hasn't manually submitted (scoring
// whatever they had saved), recomputes ranks, and closes the game out.
//
// This has two callers by design (see docs/ARCHITECTURE.md): a player's own
// client calls it with their gameId the instant its local countdown reaches
// zero (a cheap, idempotent nudge — no per-player backend timer loop is
// ever created), and it can additionally be wired to a scheduled pg_cron +
// pg_net job with no gameId (sweep everything overdue) so a match still
// ends on time even if every last participant's tab is closed.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'

interface UpdateGameStateBody {
  gameId?: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: UpdateGameStateBody = {}
  try {
    body = req.body ? await req.json() : {}
  } catch {
    body = {}
  }

  const admin = getAdminClient()
  const nowIso = new Date().toISOString()

  let query = admin.from('games').select('id, end_time, time_limit_seconds').eq('status', 'active').lte('end_time', nowIso)
  if (body.gameId) query = query.eq('id', body.gameId)

  const { data: overdueGames, error: overdueError } = await query
  if (overdueError) return errorResponse('Unable to sweep game state.', 500, overdueError.message)

  const endedGameIds: string[] = []

  for (const game of overdueGames ?? []) {
    const { data: pendingParticipants } = await admin
      .from('participants')
      .select('user_id')
      .eq('game_id', game.id)
      .neq('status', 'submitted')

    for (const p of pendingParticipants ?? []) {
      try {
        await finalizeParticipantResult(admin, game.id, p.user_id, {
          autoSubmitted: true,
          completionTimeSeconds: game.time_limit_seconds,
        })
      } catch {
        // Best-effort: one bad row shouldn't block the rest of the sweep.
        continue
      }
    }

    await admin.rpc('recompute_ranks', { p_game_id: game.id })
    await admin.from('games').update({ status: 'ended' }).eq('id', game.id).eq('status', 'active')
    await admin.from('game_events').insert({ game_id: game.id, user_id: null, event_type: 'game_ended', event_data: { reason: 'timer_expired' } })

    endedGameIds.push(game.id)
  }

  // Separately, catch players who closed their tab entirely (a fullscreen-
  // exit event never fires for a real tab close) rather than waiting for
  // the whole match to time out: any non-submitted participant in a still-
  // active game whose heartbeat has gone stale gets finalized on their
  // own, without ending the match for everyone else.
  const STALE_SECONDS = 90
  const staleThresholdIso = new Date(Date.now() - STALE_SECONDS * 1000).toISOString()

  let activeGamesQuery = admin.from('games').select('id, start_time, time_limit_seconds').eq('status', 'active')
  if (body.gameId) activeGamesQuery = activeGamesQuery.eq('id', body.gameId)
  const { data: activeGames } = await activeGamesQuery

  for (const game of activeGames ?? []) {
    const { data: staleParticipants } = await admin
      .from('participants')
      .select('user_id')
      .eq('game_id', game.id)
      .neq('status', 'submitted')
      .lt('last_seen_at', staleThresholdIso)

    for (const p of staleParticipants ?? []) {
      const startedAt = game.start_time ? new Date(game.start_time).getTime() : Date.now()
      const completionTimeSeconds = Math.min((Date.now() - startedAt) / 1000, game.time_limit_seconds)
      try {
        await finalizeParticipantResult(admin, game.id, p.user_id, {
          autoSubmitted: true,
          completionTimeSeconds,
        })
        await admin.rpc('recompute_ranks', { p_game_id: game.id })
        await admin.from('game_events').insert({
          game_id: game.id,
          user_id: p.user_id,
          event_type: 'auto_submitted_inactive',
          event_data: { reason: 'heartbeat_stale', staleSeconds: STALE_SECONDS },
        })
      } catch {
        continue
      }
    }
  }

  return jsonResponse({ ok: true, endedGames: endedGameIds })
})
