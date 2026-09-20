// POST /restart-game
// { gameId: string }
//
// Allows the creator of a finished or cancelled game to reset it in place
// back to 'waiting' status with the same game code and puzzle layout,
// wiping old answers, results, and participants so players can rejoin fresh.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface RestartGameBody {
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

  let body: RestartGameBody
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
    .select('id, creator_id, status')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)

  if (game.creator_id !== user.id) {
    return errorResponse('Only the creator can restart this match.', 403)
  }

  if (game.status !== 'ended' && game.status !== 'cancelled') {
    return errorResponse('Only a finished or cancelled match can be restarted.', 400)
  }

  // Wipe all prior play data for this match.
  const { error: answersError } = await admin.from('answers').delete().eq('game_id', gameId)
  if (answersError) {
    return errorResponse('Unable to clear answers.', 500, answersError.message)
  }

  const { error: resultsError } = await admin.from('results').delete().eq('game_id', gameId)
  if (resultsError) {
    return errorResponse('Unable to clear results.', 500, resultsError.message)
  }

  const { error: participantsError } = await admin.from('participants').delete().eq('game_id', gameId)
  if (participantsError) {
    return errorResponse('Unable to clear participants.', 500, participantsError.message)
  }

  // Reset the game row to 'waiting'.
  const { error: updateError } = await admin
    .from('games')
    .update({ status: 'waiting', start_time: null, end_time: null })
    .eq('id', gameId)
    .in('status', ['ended', 'cancelled'])

  if (updateError) {
    return errorResponse('Unable to reset match.', 500, updateError.message)
  }

  // Log the restart event.
  await admin.from('game_events').insert({
    game_id: gameId,
    user_id: user.id,
    event_type: 'game_started',
    event_data: { reason: 'restarted_by_creator' },
  })

  return jsonResponse({ ok: true })
})
