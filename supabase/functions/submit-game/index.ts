// POST /submit-game
// { gameId: string }
//
// The only path by which a player's own result is finalized on demand.
// Idempotent: submitting twice (double-click, retry after a flaky network)
// just returns the same already-finalized result rather than erroring or
// re-scoring.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { finalizeParticipantResult } from '../_shared/finalizeResult.ts'

interface SubmitGameBody {
  gameId?: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: SubmitGameBody
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
    .select('id, status, start_time, end_time, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)

  const { data: participant, error: participantError } = await admin
    .from('participants')
    .select('id, status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (participantError || !participant) {
    return errorResponse('You are not a participant of this game.', 403)
  }

  // Idempotent short-circuit: already finalized, hand back the stored result.
  if (participant.status === 'submitted') {
    const { data: existingResult } = await admin
      .from('results')
      .select('score, completion_time_seconds, solved_count, total_questions, accuracy, rank, auto_submitted')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (existingResult) {
      return jsonResponse({ ok: true, result: existingResult, alreadySubmitted: true })
    }
  }

  if (game.status !== 'active' && game.status !== 'ended') {
    return errorResponse('This game is not currently active.', 409)
  }

  const startedAt = game.start_time ? new Date(game.start_time).getTime() : Date.now()
  const rawCompletionSeconds = (Date.now() - startedAt) / 1000
  const completionTimeSeconds = Math.min(rawCompletionSeconds, game.time_limit_seconds)

  const finalized = await finalizeParticipantResult(admin, gameId, user.id, {
    autoSubmitted: false,
    completionTimeSeconds,
  })

  await admin.from('game_events').insert({ game_id: gameId, user_id: user.id, event_type: 'submitted', event_data: {} })

  await admin.rpc('recompute_ranks', { p_game_id: gameId })

  // If everyone has now submitted, close out the match early rather than
  // waiting for the timer to formally expire.
  const [{ count: participantCount }, { count: resultCount }] = await Promise.all([
    admin.from('participants').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
    admin.from('results').select('id', { count: 'exact', head: true }).eq('game_id', gameId),
  ])

  if (game.status === 'active' && participantCount !== null && resultCount !== null && resultCount >= participantCount) {
    await admin.from('games').update({ status: 'ended' }).eq('id', gameId).eq('status', 'active')
    await admin.from('game_events').insert({ game_id: gameId, user_id: null, event_type: 'game_ended', event_data: { reason: 'all_submitted' } })
  }

  const { data: finalResult } = await admin
    .from('results')
    .select('score, completion_time_seconds, solved_count, total_questions, accuracy, rank, auto_submitted')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  return jsonResponse({ ok: true, result: finalResult ?? finalized })
})
