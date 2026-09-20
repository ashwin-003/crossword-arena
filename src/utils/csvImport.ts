import Papa from 'papaparse'
import type { ClueDirection } from '@/types/database'
import { isValidAnswer, normalizeAnswer } from '@/utils/answerFormat'

export interface ImportedClue {
  direction: ClueDirection
  clue: string
  answer: string
}

export interface CsvImportResult {
  rows: ImportedClue[]
  errors: string[]
}

function normalizeDirection(raw: string): ClueDirection | null {
  const v = raw.trim().toLowerCase()
  if (v === 'across' || v === 'a') return 'across'
  if (v === 'down' || v === 'd') return 'down'
  return null
}

/**
 * Parses a creator-uploaded CSV of clues. Expects a header row with
 * "direction", "clue", "answer" columns (case-insensitive, any order).
 * Invalid individual rows are skipped and reported rather than failing
 * the whole import, so one typo doesn't block 30 good rows.
 */
export function parseCluesCsv(csvText: string): CsvImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const rows: ImportedClue[] = []
  const errors: string[] = []

  if (parsed.errors.length > 0) {
    errors.push(`Could not parse the file: ${parsed.errors[0].message}`)
    return { rows, errors }
  }

  const data = parsed.data
  if (data.length === 0) {
    errors.push('No rows found in the file.')
    return { rows, errors }
  }

  const firstRow = data[0]
  if (!('direction' in firstRow) || !('clue' in firstRow) || !('answer' in firstRow)) {
    errors.push('The file must have "direction", "clue", and "answer" columns.')
    return { rows, errors }
  }

  data.forEach((row, index) => {
    const lineNumber = index + 2
    const rawDirection = row.direction ?? ''
    const rawClue = (row.clue ?? '').trim()
    const rawAnswer = (row.answer ?? '').trim()

    if (!rawDirection && !rawClue && !rawAnswer) return

    const direction = normalizeDirection(rawDirection)
    if (!direction) {
      errors.push(`Row ${lineNumber}: direction must be "across" or "down" (got "${rawDirection}").`)
      return
    }
    if (rawClue.length === 0) {
      errors.push(`Row ${lineNumber}: clue text is missing.`)
      return
    }
    if (!isValidAnswer(rawAnswer)) {
      errors.push(`Row ${lineNumber}: answer "${rawAnswer || '—'}" must be letters only, 2–20 characters.`)
      return
    }

    rows.push({ direction, clue: rawClue, answer: normalizeAnswer(rawAnswer) })
  })

  return { rows, errors }
}

export const CSV_TEMPLATE = 'direction,clue,answer\nacross,Capital of Tamil Nadu,CHENNAI\ndown,Opposite of hot,COLD\n'
