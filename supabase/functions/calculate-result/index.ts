// POST /calculate-result
// { gameId: string }
//
// The actual per-player scoring snapshot happens inside finalizeParticipantResult
// (shared by submit-game and update-game-state) the moment a player submits
// or the timer sweeps them. This endpoint exists for the recompute-ranks
// half of "calculate final result": it re-runs the rank() window function
// across every result in a game. Restricted to the game's creator — useful
// if results ever need to be recomputed after a manual data fix, without
// giving any client the ability to write a score or rank directly.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface CalculateResultBody {
  gameId?: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: CalculateResultBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const gameId = body.gameId
  if (!gameId) return errorResponse('gameId is required.', 422)

  const admin = getAdminClient()

  const { data: game, error: gameError } = await admin.from('games').select('id, creator_id').eq('id', gameId).maybeSingle()
  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)
  if (game.creator_id !== user.id) {
    return errorResponse('Only the match creator can trigger a recalculation.', 403)
  }

  const { error: rpcError } = await admin.rpc('recompute_ranks', { p_game_id: gameId })
  if (rpcError) return errorResponse('Unable to recalculate results.', 500, rpcError.message)

  const { data: results } = await admin
    .from('results')
    .select('user_id, score, rank, completion_time_seconds, solved_count, accuracy')
    .eq('game_id', gameId)
    .order('rank', { ascending: true })

  return jsonResponse({ ok: true, results: results ?? [] })
})
