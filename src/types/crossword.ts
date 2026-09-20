import type { ClueDirection } from './database'

/** A single clue+answer pair as authored in the Create Game builder (local state only). */
export interface DraftClue {
  /** Stable client-side id so React lists and validation errors can reference a row. */
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
  /** true = playable cell, false = blocked cell */
  cellMask: boolean[][]
  /** Letter occupying each playable cell, for local preview/validation only — never sent as-is to other players. */
  solutionGrid: (string | null)[][]
  words: PlacedWord[]
}

export interface CrosswordGenerationError {
  message: string
  conflictingAnswers?: string[]
}

export type CrosswordGenerationResult =
  | { ok: true; crossword: GeneratedCrossword }
  | { ok: false; error: CrosswordGenerationError }

/** Client-side play state for a single cell in the live game grid. */
export interface CellPosition {
  row: number
  col: number
}

export interface ClueEntry {
  id: string
  direction: ClueDirection
  clue: string
  number: number
  row: number
  col: number
  length: number
}
