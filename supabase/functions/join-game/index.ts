// POST /join-game
// { gameCode: string }
//
// Validates the code, checks the game exists and its status, prevents
// duplicate participation, and restores an existing participant record if
// the caller already joined (rather than erroring or duplicating).
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface JoinGameBody {
  gameCode?: string
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

  let body: JoinGameBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const gameCode = (body.gameCode ?? '').trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(gameCode)) {
    return errorResponse('Invalid game code.', 422)
  }

  const admin = getAdminClient()

  const { data: game, error: gameError } = await admin
    .from('games')
    .select('id, status, title, creator_id')
    .eq('game_code', gameCode)
    .maybeSingle()

  if (gameError) {
    return errorResponse('Unable to look up that game right now.', 500, gameError.message)
  }
  if (!game) {
    return errorResponse('Invalid game code.', 404)
  }

  if (game.creator_id === user.id) {
    // Creator is host/spectator only — do not create a participant row
    return jsonResponse({ ok: true, gameId: game.id, status: game.status, alreadyJoined: true })
  }

  const { data: removed } = await admin
    .from('removed_participants')
    .select('user_id')
    .eq('game_id', game.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (removed) {
    return errorResponse('You were removed from this match by the host and cannot rejoin.', 403)
  }

  const { data: existingParticipant } = await admin
    .from('participants')
    .select('id')
    .eq('game_id', game.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingParticipant) {
    return jsonResponse({ ok: true, gameId: game.id, status: game.status, alreadyJoined: true })
  }

  if (game.status === 'cancelled') {
    return errorResponse('This game was cancelled.', 409)
  }
  if (game.status === 'ended') {
    return errorResponse('Game has ended.', 409)
  }
  if (game.status === 'active' || game.status === 'starting') {
    return errorResponse('Game has already started.', 409)
  }

  const { error: insertError } = await admin
    .from('participants')
    .insert({ game_id: game.id, user_id: user.id, status: 'joined' })

  if (insertError) {
    if (insertError.code === '23505') {
      // Raced with a duplicate join — treat as success (already a member).
      return jsonResponse({ ok: true, gameId: game.id, status: game.status, alreadyJoined: true })
    }
    return errorResponse('You are already participating in this game.', 409, insertError.message)
  }

  return jsonResponse({ ok: true, gameId: game.id, status: game.status, alreadyJoined: false })
})
