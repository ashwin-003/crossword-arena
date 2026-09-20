// POST /stop-game
// { gameId: string }
//
// Allows the match creator to stop or cancel their game at any time:
//  - If 'waiting' or 'starting': cancels the match.
//  - If 'active': ends early, auto-submits any active participants with their
//    current progress and elapsed time, recomputes ranks, and marks the game 'ended'.
//  - If already 'ended' or 'cancelled': idempotent no-op.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'

interface StopGameBody {
  gameId?: string
}

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: StopGameBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const gameId = body.gameId
  if (!gameId) return errorResponse('gameId is required.', 422)

  const admin = getAdminClient()

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, creator_id, status, start_time, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)

  if (game.creator_id !== user.id) {
    return errorResponse('Only the creator can stop this match.', 403)
  }

  if (game.status === 'waiting' || game.status === 'starting') {
    const { error: cancelError } = await admin
      .from('games')
      .update({ status: 'cancelled' })
      .eq('id', gameId)
      .eq('status', game.status)

    if (cancelError) {
      return errorResponse('Unable to cancel game.', 500, cancelError.message)
    }

    await admin.from('game_events').insert({
      game_id: gameId,
      user_id: user.id,
      event_type: 'game_ended',
      event_data: { reason: 'cancelled_by_creator' },
    })

    return jsonResponse({ ok: true, status: 'cancelled' })
  }

  if (game.status === 'active') {
    const startTimeMs = game.start_time ? new Date(game.start_time).getTime() : Date.now()
    const elapsedSeconds = Math.min(
      game.time_limit_seconds,
      Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000))
    )

    const { data: pendingParticipants } = await admin
      .from('participants')
      .select('user_id')
      .eq('game_id', gameId)
      .neq('status', 'submitted')

    for (const p of pendingParticipants ?? []) {
      try {
        await finalizeParticipantResult(admin, gameId, p.user_id, {
          autoSubmitted: true,
          completionTimeSeconds: elapsedSeconds,
        })
      } catch {
        // Best-effort: one bad row shouldn't abort the rest
        continue
      }
    }

    await admin.rpc('recompute_ranks', { p_game_id: gameId })

    const { error: endError } = await admin
      .from('games')
      .update({ status: 'ended' })
      .eq('id', gameId)
      .eq('status', 'active')

    if (endError) {
      return errorResponse('Unable to end game.', 500, endError.message)
    }

    await admin.from('game_events').insert({
      game_id: gameId,
      user_id: user.id,
      event_type: 'game_ended',
      event_data: { reason: 'stopped_by_creator' },
    })

    return jsonResponse({ ok: true, status: 'ended' })
  }

  // Already ended or cancelled
  return jsonResponse({ ok: true, status: game.status })
})
