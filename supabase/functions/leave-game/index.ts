// POST /leave-game
// { gameId: string }
//
// Allows a non-creator participant to voluntarily leave a match while it is
// still in the waiting lobby ('waiting' status).
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface LeaveGameBody {
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

  let body: LeaveGameBody
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
    .select('id, status, creator_id')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) {
    return errorResponse('Unable to look up that game right now.', 500, gameError.message)
  }
  if (!game) {
    return errorResponse('Game not found.', 404)
  }

  if (user.id === game.creator_id) {
    return errorResponse("The host can't leave — cancel the match instead.", 400)
  }

  const { data: participant, error: participantError } = await admin
    .from('participants')
    .select('id')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (participantError || !participant) {
    return errorResponse("You haven't joined this match.", 404)
  }

  if (game.status !== 'waiting') {
    return errorResponse("You can't leave after the match has started.", 409)
  }

  const { error: deleteError } = await admin
    .from('participants')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', user.id)

  if (deleteError) {
    return errorResponse('Unable to leave the match right now.', 500, deleteError.message)
  }

  try {
    await admin.from('game_events').insert({
      game_id: gameId,
      user_id: user.id,
      event_type: 'participant_left',
      event_data: {},
    })
  } catch {
    // Best-effort: logging failure should not fail the leave action
  }

  return jsonResponse({ ok: true })
})
