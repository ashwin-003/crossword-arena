import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: { gameId?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const { gameId } = body
  if (!gameId) return errorResponse('gameId is required.', 422)

  const admin = getAdminClient()

  // 1. Verify that the student has actually submitted the game
  const { data: participant, error: pErr } = await admin
    .from('participants')
    .select('status')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (pErr || !participant) {
    return errorResponse('Not a participant of this game.', 403)
  }

  if (participant.status !== 'submitted') {
    return errorResponse('Submit your game before viewing the answer review.', 403)
  }

  // 2. Fetch all questions for this game
  const { data: rawQuestions, error: qErr } = await admin
    .from('questions')
    .select('id, number, direction, clue, answer, game_sections(name, position)')
    .eq('game_id', gameId)

  if (qErr) {
    return errorResponse('Failed to fetch questions.', 500)
  }

  const questions = (rawQuestions || []).sort((a, b) => {
    const posA = a.game_sections?.position ?? 0;
    const posB = b.game_sections?.position ?? 0;
    if (posA !== posB) return posA - posB;
    if (a.number !== b.number) return a.number - b.number;
    return a.direction.localeCompare(b.direction);
  });

  // 3. Fetch all answers for this user in this game
  const { data: answers, error: aErr } = await admin
    .from('answers')
    .select('question_id, answer, is_correct')
    .eq('game_id', gameId)
    .eq('user_id', user.id)

  if (aErr) {
    return errorResponse('Failed to fetch answers.', 500)
  }

  const answerMap = new Map()
  for (const a of (answers || [])) {
    answerMap.set(a.question_id, a)
  }

  // 4. Map them to the ReviewRow expected by AnswerReviewModal
  const reviewRows = questions.map(q => {
    const a = answerMap.get(q.id)
    return {
      question_id: q.id,
      number: q.number,
      direction: q.direction,
      clue: q.clue,
      correct_answer: q.answer,
      my_answer: a?.answer || '',
      is_correct: a?.is_correct ?? null,
      section_name: q.game_sections?.name || 'Unknown Section'
    }
  })

  return jsonResponse(reviewRows)
})
