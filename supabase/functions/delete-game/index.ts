// POST /delete-game
// { gameId: string }
//
// Allows a creator to permanently delete a game they created.
// Cascades to questions, participants, answers, results, and game_events via FK constraints.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface DeleteGameBody {
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

  let body: DeleteGameBody
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
    .select('id, creator_id')
    .eq('id', gameId)
    .maybeSingle()

  if (gameError) return errorResponse('Unable to look up this game.', 500, gameError.message)
  if (!game) return errorResponse('Game not found.', 404)

  if (game.creator_id !== user.id) {
    return errorResponse('Only the creator can delete this game.', 403)
  }

  const { error: deleteError } = await admin
    .from('games')
    .delete()
    .eq('id', gameId)

  if (deleteError) {
    return errorResponse('Unable to delete game.', 500, deleteError.message)
  }

  return jsonResponse({ ok: true })
})
