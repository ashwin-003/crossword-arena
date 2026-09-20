// POST /start-game
// { gameId: string }
//
// Only the game's creator may start it (ownership, not a privileged role —
// any player who created a match can start their own). Sets the
// server-authoritative start_time/end_time, flips status to 'active', and
// promotes every participant out of 'joined'. Clients learn about this via
// a Realtime Postgres Changes subscription on the `games` row — no manual
// broadcast fan-out needed.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface StartGameBody {
  gameId?: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: StartGameBody
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
    .select('id, creator_id, status, time_limit_seconds')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)
  if (game.creator_id !== user.id) {
    return errorResponse('Only the match creator can start this game.', 403)
  }
  if (game.status !== 'waiting') {
    return errorResponse(
      game.status === 'active' || game.status === 'starting' ? 'Game has already started.' : 'This game can no longer be started.',
      409
    )
  }

  const { count: questionCount } = await admin
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', gameId)

  if (!questionCount || questionCount < 1) {
    return errorResponse('This match has no crossword content and cannot be started.', 422)
  }

  const startTime = new Date()
  const endTime = new Date(startTime.getTime() + game.time_limit_seconds * 1000)

  const { error: updateError } = await admin
    .from('games')
    .update({ status: 'active', start_time: startTime.toISOString(), end_time: endTime.toISOString() })
    .eq('id', gameId)
    .eq('status', 'waiting') // guards against a double-start race

  if (updateError) {
    return errorResponse('Unable to start the game right now.', 500, updateError.message)
  }

  await admin.from('participants').update({ status: 'active' }).eq('game_id', gameId).neq('status', 'submitted')

  await admin.from('game_events').insert({ game_id: gameId, user_id: user.id, event_type: 'game_started', event_data: {} })

  return jsonResponse({ ok: true, startTime: startTime.toISOString(), endTime: endTime.toISOString() })
})
