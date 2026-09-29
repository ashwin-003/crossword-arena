import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

interface RecordViolationBody {
  gameId?: string
  reason?: string
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

  let body: RecordViolationBody = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const { gameId, reason = 'screen_left' } = body
  if (!gameId) return errorResponse('gameId is required.', 422)

  const admin = getAdminClient()

  const { data: participant, error: partError } = await admin
    .from('participants')
    .select('id, interruption_count, status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (partError || !participant) {
    return errorResponse('Participant not found.', 404)
  }

  if (participant.status === 'submitted') {
    return jsonResponse({
      ok: true,
      interruptionCount: participant.interruption_count ?? 3,
      isSubmitted: true,
    })
  }

  const newCount = (participant.interruption_count ?? 0) + 1

  await admin
    .from('participants')
    .update({ interruption_count: newCount })
    .eq('id', participant.id)

  try {
    await admin.from('game_events').insert({
      game_id: gameId,
      user_id: user.id,
      event_type: 'anti_malpractice_violation',
      event_data: {
        count: newCount,
        reason,
        timestamp: new Date().toISOString(),
      },
    })
  } catch {
    // best-effort event logging
  }

  return jsonResponse({
    ok: true,
    interruptionCount: newCount,
    shouldSubmit: newCount >= 3,
  })
})
