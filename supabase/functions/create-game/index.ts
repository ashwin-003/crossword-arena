// POST /create-game
// { title: string, timeLimitSeconds: number, clues: { direction: 'across'|'down', clue: string, answer: string }[] }
//
// The client's Grid Preview is a UX convenience only — this function is the
// authority. It independently regenerates the crossword from the raw
// clue/answer list (see _shared/crosswordGenerator.ts) so a tampered
// client-side layout can never be persisted, then atomically creates the
// game and its questions (the creator is host only, never a participant).
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { generateCrossword, type DraftClueInput } from '../_shared/crosswordGenerator.ts'
import { generateGameCode } from '../_shared/gameCode.ts'

interface ClueInput {
  direction?: 'across' | 'down'
  clue?: string
  answer?: string
}

interface CreateGameBody {
  title?: string
  timeLimitSeconds?: number
  clues?: ClueInput[]
}

const MAX_CLUES = 40
const MIN_TIME_LIMIT = 60
const MAX_TIME_LIMIT = 10800

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  const { user } = await requireUser(req)
  if (!user) return errorResponse('Authentication required.', 401)

  let body: CreateGameBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const title = (body.title ?? '').trim()
  const timeLimitSeconds = Number(body.timeLimitSeconds)
  const rawClues = Array.isArray(body.clues) ? body.clues : []

  if (title.length < 1 || title.length > 120) {
    return errorResponse('Match title is required (up to 120 characters).', 422)
  }
  if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds < MIN_TIME_LIMIT || timeLimitSeconds > MAX_TIME_LIMIT) {
    return errorResponse(`Time limit must be between ${MIN_TIME_LIMIT} and ${MAX_TIME_LIMIT} seconds.`, 422)
  }
  if (rawClues.length === 0) {
    return errorResponse('Add at least one across or down clue.', 422)
  }
  if (rawClues.length > MAX_CLUES) {
    return errorResponse(`A match can have at most ${MAX_CLUES} clues.`, 422)
  }
  for (const c of rawClues) {
    if (c.direction !== 'across' && c.direction !== 'down') {
      return errorResponse('Every clue needs a direction of "across" or "down".', 422)
    }
    if (!c.clue || c.clue.trim().length === 0) {
      return errorResponse('Every clue needs clue text.', 422)
    }
    if (!c.answer || c.answer.trim().length === 0) {
      return errorResponse('Every clue needs an answer.', 422)
    }
  }

  const draftClues: DraftClueInput[] = rawClues.map((c, i) => ({
    localId: `${i}`,
    direction: c.direction as 'across' | 'down',
    clue: c.clue!.trim(),
    answer: c.answer!.trim(),
  }))

  const generation = generateCrossword(draftClues)
  if (!generation.ok) {
    return errorResponse(generation.error.message, 422, generation.error.conflictingAnswers)
  }

  const { rows, cols, cellMask, words } = generation.crossword
  const admin = getAdminClient()

  // Server-generated, unique, indexed game code with collision retry.
  let gameId: string | null = null
  let gameCode = ''
  let lastError: string | null = null

  for (let attempt = 0; attempt < 8 && !gameId; attempt++) {
    gameCode = generateGameCode()
    const { data, error } = await admin
      .from('games')
      .insert({
        game_code: gameCode,
        title,
        creator_id: user.id,
        time_limit_seconds: timeLimitSeconds,
        status: 'waiting',
        grid_rows: rows,
        grid_cols: cols,
        grid_layout: { rows, cols, cellMask },
      })
      .select('id')
      .single()

    if (!error && data) {
      gameId = data.id as string
    } else if (error?.code === '23505') {
      // game_code collision — retry with a freshly generated code
      continue
    } else {
      lastError = error?.message ?? 'Unknown error creating game.'
      break
    }
  }

  if (!gameId) {
    return errorResponse('Unable to create the game right now. Please try again.', 500, lastError)
  }

  const questionRows = words.map((w) => ({
    game_id: gameId,
    direction: w.direction,
    clue: w.clue,
    answer: w.answer,
    row_index: w.row,
    col_index: w.col,
    number: w.number,
  }))

  const { error: questionsError } = await admin.from('questions').insert(questionRows)
  if (questionsError) {
    // Roll back the orphaned game row so a half-created match never sits in `waiting`.
    await admin.from('games').delete().eq('id', gameId)
    return errorResponse('Unable to save the crossword. Please try again.', 500, questionsError.message)
  }

  return jsonResponse({ ok: true, gameId, gameCode, rows, cols, wordCount: words.length })
})
