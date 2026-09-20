// ============================================================================
// Server-side port of src/utils/crosswordGenerator.ts.
//
// Deno Edge Functions are a separate deployment unit from the Vite/React
// app and cannot import across that boundary, so this is intentionally a
// duplicate rather than a shared package — keep the two in sync by hand if
// the placement algorithm changes. This copy is what the create-game
// function actually trusts: it independently regenerates the grid from the
// raw clue/answer list the client submitted rather than trusting a
// client-computed layout, so a tampered "preview" can never be persisted.
// ============================================================================

export type ClueDirection = 'across' | 'down'

export interface DraftClueInput {
  localId: string
  direction: ClueDirection
  clue: string
  answer: string
}

export interface PlacedWord {
  localId: string
  direction: ClueDirection
  clue: string
  answer: string
  row: number
  col: number
  number: number
}

export interface GeneratedCrossword {
  rows: number
  cols: number
  cellMask: boolean[][]
  solutionGrid: (string | null)[][]
  words: PlacedWord[]
}

export type CrosswordGenerationResult =
  | { ok: true; crossword: GeneratedCrossword }
  | { ok: false; error: { message: string; conflictingAnswers?: string[] } }

const MAX_GRID_DIMENSION = 26

function normalizeAnswer(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

interface Occupant {
  letter: string
  across?: PlacedWord
  down?: PlacedWord
}

export function generateCrossword(draftClues: DraftClueInput[]): CrosswordGenerationResult {
  const entries = draftClues
    .map((d) => ({ ...d, answer: normalizeAnswer(d.answer) }))
    .filter((d) => d.clue.trim().length > 0 || d.answer.length > 0)

  if (entries.length === 0) {
    return { ok: false, error: { message: 'Add at least one across or down clue before generating the grid.' } }
  }

  const invalid = entries.filter((d) => d.answer.length < 2 || d.answer.length > 20 || d.clue.trim().length === 0)
  if (invalid.length > 0) {
    return {
      ok: false,
      error: {
        message: 'Every clue needs text and an answer between 2 and 20 letters.',
        conflictingAnswers: invalid.map((d) => d.answer || '(empty)'),
      },
    }
  }

  const grid = new Map<string, Occupant>()
  const placed: PlacedWord[] = []

  function key(r: number, c: number) {
    return `${r},${c}`
  }

  function boundsOf(words: PlacedWord[]) {
    let minR = Infinity,
      minC = Infinity,
      maxR = -Infinity,
      maxC = -Infinity
    for (const w of words) {
      const endR = w.direction === 'down' ? w.row + w.answer.length - 1 : w.row
      const endC = w.direction === 'across' ? w.col + w.answer.length - 1 : w.col
      minR = Math.min(minR, w.row)
      minC = Math.min(minC, w.col)
      maxR = Math.max(maxR, endR)
      maxC = Math.max(maxC, endC)
    }
    return { minR, minC, maxR, maxC }
  }

  function canPlace(direction: ClueDirection, answer: string, row: number, col: number): boolean {
    for (let i = 0; i < answer.length; i++) {
      const r = direction === 'across' ? row : row + i
      const c = direction === 'across' ? col + i : col
      const occ = grid.get(key(r, c))

      if (occ) {
        if (occ.letter !== answer[i]) return false
        if (direction === 'across' && occ.across) return false
        if (direction === 'down' && occ.down) return false
      } else {
        const perpA = direction === 'across' ? grid.get(key(r - 1, c)) : grid.get(key(r, c - 1))
        const perpB = direction === 'across' ? grid.get(key(r + 1, c)) : grid.get(key(r, c + 1))
        if (perpA || perpB) return false
      }
    }

    const beforeR = direction === 'across' ? row : row - 1
    const beforeC = direction === 'across' ? col - 1 : col
    const afterR = direction === 'across' ? row : row + answer.length
    const afterC = direction === 'across' ? col + answer.length : col
    if (grid.has(key(beforeR, beforeC))) return false
    if (grid.has(key(afterR, afterC))) return false

    return true
  }

  function commit(entry: DraftClueInput, direction: ClueDirection, answer: string, row: number, col: number) {
    const word: PlacedWord = { localId: entry.localId, direction, clue: entry.clue.trim(), answer, row, col, number: 0 }
    for (let i = 0; i < answer.length; i++) {
      const r = direction === 'across' ? row : row + i
      const c = direction === 'across' ? col + i : col
      const existing = grid.get(key(r, c)) ?? { letter: answer[i] }
      existing.letter = answer[i]
      if (direction === 'across') existing.across = word
      else existing.down = word
      grid.set(key(r, c), existing)
    }
    placed.push(word)
  }

  function withinMaxSize(row: number, col: number, direction: ClueDirection, length: number): boolean {
    const allWords = [...placed, { direction, row, col, answer: 'x'.repeat(length) } as PlacedWord]
    const { minR, minC, maxR, maxC } = boundsOf(allWords)
    return maxR - minR + 1 <= MAX_GRID_DIMENSION && maxC - minC + 1 <= MAX_GRID_DIMENSION
  }

  const sortedByLength = [...entries].sort((a, b) => b.answer.length - a.answer.length)
  const first = sortedByLength[0]
  commit(first, first.direction, first.answer, 0, 0)
  const remaining = sortedByLength.slice(1)

  let progressed = true
  while (remaining.length > 0 && progressed) {
    progressed = false

    for (let idx = 0; idx < remaining.length; idx++) {
      const entry = remaining[idx]
      const opposite = entry.direction === 'across' ? 'down' : 'across'
      const candidates = placed.filter((w) => w.direction === opposite)

      let bestPlacement: { row: number; col: number; score: number } | null = null

      for (const target of candidates) {
        for (let ti = 0; ti < target.answer.length; ti++) {
          for (let ei = 0; ei < entry.answer.length; ei++) {
            if (target.answer[ti] !== entry.answer[ei]) continue

            let placeRow: number
            let placeCol: number
            if (entry.direction === 'across') {
              placeRow = target.row + ti
              placeCol = target.col - ei
            } else {
              placeRow = target.row - ei
              placeCol = target.col + ti
            }

            if (!withinMaxSize(placeRow, placeCol, entry.direction, entry.answer.length)) continue
            if (!canPlace(entry.direction, entry.answer, placeRow, placeCol)) continue

            let intersections = 0
            for (let i = 0; i < entry.answer.length; i++) {
              const r = entry.direction === 'across' ? placeRow : placeRow + i
              const c = entry.direction === 'across' ? placeCol + i : placeCol
              if (grid.has(key(r, c))) intersections++
            }
            const score = intersections
            if (!bestPlacement || score > bestPlacement.score) {
              bestPlacement = { row: placeRow, col: placeCol, score }
            }
          }
        }
      }

      if (bestPlacement) {
        commit(entry, entry.direction, entry.answer, bestPlacement.row, bestPlacement.col)
        remaining.splice(idx, 1)
        progressed = true
        break
      }
    }
  }

  for (const entry of remaining) {
    const { maxR, minC } = boundsOf(placed)
    let row = maxR + 2
    let col = Math.max(minC, 0)
    let placedOk = false

    for (let attempt = 0; attempt < 200 && !placedOk; attempt++) {
      if (withinMaxSize(row, col, entry.direction, entry.answer.length) && canPlace(entry.direction, entry.answer, row, col)) {
        commit(entry, entry.direction, entry.answer, row, col)
        placedOk = true
        break
      }
      col += 1
      if (col - minC > MAX_GRID_DIMENSION) {
        col = Math.max(minC, 0)
        row += 2
      }
    }

    if (!placedOk) {
      return {
        ok: false,
        error: {
          message: 'Unable to generate a valid crossword. Please modify one or more answers.',
          conflictingAnswers: [entry.answer],
        },
      }
    }
  }

  const { minR, minC, maxR, maxC } = boundsOf(placed)
  const rows = maxR - minR + 1
  const cols = maxC - minC + 1

  if (rows > MAX_GRID_DIMENSION || cols > MAX_GRID_DIMENSION) {
    return {
      ok: false,
      error: { message: 'Unable to generate a valid crossword. The combined answers produce too large a grid.' },
    }
  }

  for (const w of placed) {
    w.row -= minR
    w.col -= minC
  }

  const cellMask: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))
  const solutionGrid: (string | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null))

  for (const w of placed) {
    for (let i = 0; i < w.answer.length; i++) {
      const r = w.direction === 'across' ? w.row : w.row + i
      const c = w.direction === 'across' ? w.col + i : w.col
      cellMask[r][c] = true
      solutionGrid[r][c] = w.answer[i]
    }
  }

  let nextNumber = 1
  const numberAt: Record<string, number> = {}
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!cellMask[r][c]) continue
      const startsAcross = (c === 0 || !cellMask[r][c - 1]) && c + 1 < cols && cellMask[r][c + 1]
      const startsDown = (r === 0 || !cellMask[r - 1][c]) && r + 1 < rows && cellMask[r + 1][c]
      if (startsAcross || startsDown) {
        numberAt[`${r},${c}`] = nextNumber
        nextNumber += 1
      }
    }
  }

  for (const w of placed) {
    w.number = numberAt[`${w.row},${w.col}`] ?? 0
  }

  placed.sort((a, b) => a.number - b.number || (a.direction > b.direction ? 1 : -1))

  return { ok: true, crossword: { rows, cols, cellMask, solutionGrid, words: placed } }
}
