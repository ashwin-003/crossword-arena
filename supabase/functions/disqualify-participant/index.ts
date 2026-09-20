// POST /disqualify-participant
// { gameId: string, targetUserId: string }
//
// Creator-only: force-finalizes a participant's result immediately with
// whatever progress they have (reuses finalizeParticipantResult, the same
// helper submit-game and update-game-state use, so scoring never drifts
// between the three paths). Idempotent — disqualifying an already-submitted
// participant just logs the event without re-scoring.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'

interface DisqualifyBody {
  gameId?: string
  targetUserId?: string
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

  let body: DisqualifyBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { gameId, targetUserId } = body
  if (!gameId || !targetUserId) return errorResponse('gameId and targetUserId are required.', 422)

  const admin = getAdminClient()

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, status, creator_id, start_time, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)
  if (game.creator_id !== user.id) return errorResponse('Only the match creator can remove a participant.', 403)

  const { data: participant, error: participantError } = await admin
    .from('participants')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (participantError || !participant) return errorResponse('That player is not part of this match.', 404)

  if (game.status === 'waiting') {
    const { error: banError } = await admin
      .from('removed_participants')
      .upsert({ game_id: game.id, user_id: targetUserId })

    if (banError) {
      return errorResponse('Unable to mark participant as removed.', 500, banError.message)
    }

    const { error: deleteError } = await admin
      .from('participants')
      .delete()
      .eq('id', participant.id)

    if (deleteError) {
      return errorResponse('Unable to remove participant from lobby.', 500, deleteError.message)
    }

    try {
      await admin.from('game_events').insert({
        game_id: gameId,
        user_id: targetUserId,
        event_type: 'removed_from_lobby',
        event_data: { by: user.id },
      })
    } catch {
      // Best-effort
    }

    return jsonResponse({ ok: true })
  }

  if (game.status !== 'active') return errorResponse('This game is not currently active.', 409)

  if (participant.status !== 'submitted') {
    const startedAt = game.start_time ? new Date(game.start_time).getTime() : Date.now()
    const completionTimeSeconds = Math.min((Date.now() - startedAt) / 1000, game.time_limit_seconds)

    await finalizeParticipantResult(admin, gameId, targetUserId, {
      autoSubmitted: true,
      completionTimeSeconds,
    })

    await admin.rpc('recompute_ranks', { p_game_id: gameId })
  }

  await admin.from('game_events').insert({
    game_id: gameId,
    user_id: targetUserId,
    event_type: 'disqualified',
    event_data: { by: user.id },
  })

  // If everyone has now submitted (including this forced one), close the
  // match out early rather than waiting for the timer.
  const [{ count: participantCount }, { count: resultCount }] = await Promise.all([
    admin.from('participants').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
    admin.from('results').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
  ])

  if (participantCount !== null && resultCount !== null && resultCount >= participantCount) {
    await admin.from('games').update({ status: 'ended' }).eq('id', gameId).eq('status', 'active')
    await admin.from('game_events').insert({ game_id: gameId, user_id: null, event_type: 'game_ended', event_data: { reason: 'all_submitted' } })
  }

  return jsonResponse({ ok: true })
})
