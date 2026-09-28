// POST /create-game
// New format (multi-section):
//   { title: string, sections: { name: string, clues: ClueInput[] }[] }
// Legacy format (single-section, backward compat):
//   { title: string, timeLimitSeconds: number, clues: ClueInput[] }
//
// No per-section time limits. Elapsed time is tracked server-side as each
// student works through sections; it is used only for leaderboard tie-breaking.
// The client's Grid Preview is a UX convenience only — this function is the
// authority. It independently regenerates the crossword from the raw
// clue/answer list so a tampered client-side layout can never be persisted,
// then atomically creates the game, its sections, and their questions.
// The creator is host only, never a participant.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient, requireUser } from '../_shared/supabaseAdmin.ts'
import { generateCrossword, type DraftClueInput } from '../_shared/crosswordGenerator.ts'
import { generateGameCode } from '../_shared/gameCode.ts'

interface ClueInput {
  direction?: 'across' | 'down'
  clue?: string
  answer?: string
}

interface GridWordInput {
  direction?: 'across' | 'down'
  clue?: string
  answer?: string
  row?: number
  col?: number
  number?: number
}

interface GridInput {
  rows?: number
  cols?: number
  cellMask?: boolean[][]
  words?: GridWordInput[]
}

interface SectionInput {
  name?: string
  clues?: ClueInput[]
  timeLimitSeconds?: number
  grid?: GridInput
}

interface CreateGameBody {
  title?: string
  // Multi-section format
  sections?: SectionInput[]
  // Legacy single-section format
  timeLimitSeconds?: number
  clues?: ClueInput[]
}

const MAX_CLUES_PER_SECTION = 40
const MAX_SECTIONS = 20

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

function validateClues(clues: ClueInput[], sectionLabel: string): string | null {
  if (clues.length === 0) return `${sectionLabel}: Add at least one clue.`
  if (clues.length > MAX_CLUES_PER_SECTION)
    return `${sectionLabel}: A section can have at most ${MAX_CLUES_PER_SECTION} clues.`
  for (const c of clues) {
    if (c.direction !== 'across' && c.direction !== 'down')
      return `${sectionLabel}: Every clue needs a direction of "across" or "down".`
    if (!c.clue || c.clue.trim().length === 0)
      return `${sectionLabel}: Every clue needs clue text.`
    if (!c.answer || c.answer.trim().length === 0)
      return `${sectionLabel}: Every clue needs an answer.`
  }
  return null
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
  if (title.length < 1 || title.length > 120) {
    return errorResponse('Match title is required (up to 120 characters).', 422)
  }

  // Normalize to sections[] regardless of input format
  type NormalizedSection = { name: string; timeLimitSeconds: number; clues: ClueInput[]; grid?: GridInput }
  let sections: NormalizedSection[]

  if (Array.isArray(body.sections) && body.sections.length > 0) {
    // Multi-section format
    if (body.sections.length > MAX_SECTIONS) {
      return errorResponse(`A game can have at most ${MAX_SECTIONS} sections.`, 422)
    }
    sections = body.sections.map((s, i) => ({
      name: (s.name ?? `Section ${String.fromCharCode(65 + i)}`).trim(),
      timeLimitSeconds:
        typeof s.timeLimitSeconds === 'number' && Number.isFinite(s.timeLimitSeconds)
          ? Math.round(s.timeLimitSeconds)
          : 600,
      clues: Array.isArray(s.clues) ? s.clues : [],
      grid: s.grid,
    }))
  } else if (Array.isArray(body.clues) && body.clues.length > 0) {
    // Legacy single-section format
    sections = [{
      name: 'Section A',
      timeLimitSeconds:
        typeof body.timeLimitSeconds === 'number' && Number.isFinite(body.timeLimitSeconds)
          ? Math.round(body.timeLimitSeconds)
          : 600,
      clues: body.clues,
    }]
  } else {
    return errorResponse('Add at least one section with clues.', 422)
  }

  // Validate each section
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    const label = `Section "${s.name}"`
    if (s.name.length < 1 || s.name.length > 80) {
      return errorResponse(`${label}: Section name is required (up to 80 characters).`, 422)
    }
    if (s.timeLimitSeconds < 10) {
      return errorResponse(`${label}: Time limit must be at least 10 seconds.`, 422)
    }
    const clueError = validateClues(s.clues, label)
    if (clueError) return errorResponse(clueError, 422)
  }

  // Generate crossword grid for each section
  interface GeneratedSection {
    name: string
    timeLimitSeconds: number
    rows: number
    cols: number
    cellMask: boolean[][]
    words: {
      direction: 'across' | 'down'
      clue: string
      answer: string
      row: number
      col: number
      number: number
    }[]
  }

  const generated: GeneratedSection[] = []

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]

    // If the mentor already previewed and generated a grid, reuse that exact grid directly (no second generation)
    if (
      s.grid &&
      typeof s.grid.rows === 'number' &&
      typeof s.grid.cols === 'number' &&
      Array.isArray(s.grid.cellMask) &&
      Array.isArray(s.grid.words) &&
      s.grid.words.length > 0
    ) {
      generated.push({
        name: s.name,
        timeLimitSeconds: s.timeLimitSeconds,
        rows: s.grid.rows,
        cols: s.grid.cols,
        cellMask: s.grid.cellMask,
        words: s.grid.words.map((w) => ({
          direction: (w.direction === 'down' ? 'down' : 'across') as 'across' | 'down',
          clue: (w.clue ?? '').trim(),
          answer: (w.answer ?? '').toUpperCase().replace(/[^A-Z]/g, ''),
          row: typeof w.row === 'number' ? w.row : 0,
          col: typeof w.col === 'number' ? w.col : 0,
          number: typeof w.number === 'number' ? w.number : 1,
        })),
      })
      continue
    }

    const draftClues: DraftClueInput[] = s.clues.map((c, j) => ({
      localId: `s${i}-${j}`,
      direction: c.direction as 'across' | 'down',
      clue: c.clue!.trim(),
      answer: c.answer!.trim(),
    }))

    const generation = generateCrossword(draftClues)
    if (!generation.ok) {
      return errorResponse(
        `Section "${s.name}": ${generation.error.message}`,
        422,
        generation.error.conflictingAnswers
      )
    }

    generated.push({
      name: s.name,
      timeLimitSeconds: s.timeLimitSeconds,
      rows: generation.crossword.rows,
      cols: generation.crossword.cols,
      cellMask: generation.crossword.cellMask,
      words: generation.crossword.words,
    })
  }

  const admin = getAdminClient()

  // Insert game row with collision-retry on game_code
  let gameId: string | null = null
  let gameCode = ''
  let lastError: string | null = null

  // Use the first section's grid for the legacy games.grid_layout (backward compat)
  const firstSection = generated[0]

  for (let attempt = 0; attempt < 8 && !gameId; attempt++) {
    gameCode = generateGameCode()
    const { data, error } = await admin
      .from('games')
      .insert({
        game_code: gameCode,
        title,
        creator_id: user.id,
        // Default match duration is 60 minutes (3600 seconds)
        time_limit_seconds: 3600,
        status: 'waiting',
        grid_rows: firstSection.rows,
        grid_cols: firstSection.cols,
        grid_layout: { rows: firstSection.rows, cols: firstSection.cols, cellMask: firstSection.cellMask },
      })
      .select('id')
      .single()

    if (!error && data) {
      gameId = data.id as string
    } else if (error?.code === '23505') {
      continue
    } else {
      lastError = error?.message ?? 'Unknown error creating game.'
      break
    }
  }

  if (!gameId) {
    return errorResponse('Unable to create the game right now. Please try again.', 500, lastError)
  }

  // Insert sections and their questions
  let totalWordCount = 0

  for (let i = 0; i < generated.length; i++) {
    const s = generated[i]

    const { data: sectionData, error: sectionError } = await admin
      .from('game_sections')
      .insert({
        game_id: gameId,
        name: s.name,
        position: i,
        time_limit_seconds: s.timeLimitSeconds,
        grid_rows: s.rows,
        grid_cols: s.cols,
        grid_layout: { rows: s.rows, cols: s.cols, cellMask: s.cellMask },
      })
      .select('id')
      .single()

    if (sectionError || !sectionData) {
      await admin.from('games').delete().eq('id', gameId)
      return errorResponse('Unable to save sections. Please try again.', 500, sectionError?.message)
    }

    const sectionId = sectionData.id as string

    const questionRows = s.words.map((w) => ({
      game_id: gameId,
      section_id: sectionId,
      direction: w.direction,
      clue: w.clue,
      answer: w.answer,
      row_index: w.row,
      col_index: w.col,
      number: w.number,
    }))

    const { error: questionsError } = await admin.from('questions').insert(questionRows)
    if (questionsError) {
      await admin.from('games').delete().eq('id', gameId)
      return errorResponse('Unable to save crossword questions. Please try again.', 500, questionsError.message)
    }

    totalWordCount += s.words.length
  }

  return jsonResponse({
    ok: true,
    gameId,
    gameCode,
    sectionCount: generated.length,
    totalWordCount,
    rows: firstSection.rows,
    cols: firstSection.cols,
  })
})
