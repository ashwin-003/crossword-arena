import type { QuestionPublicRow, GridLayout } from '@/types/database'
import type { CellPosition, ClueEntry } from '@/types/crossword'

export function toClueEntry(q: QuestionPublicRow): ClueEntry {
  return {
    id: q.id,
    direction: q.direction,
    clue: q.clue,
    number: q.number,
    row: q.row_index,
    col: q.col_index,
    length: q.answer_length,
  }
}

export function wordCells(clue: ClueEntry): CellPosition[] {
  return Array.from({ length: clue.length }, (_, i) => ({
    row: clue.direction === 'across' ? clue.row : clue.row + i,
    col: clue.direction === 'across' ? clue.col + i : clue.col,
  }))
}

export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export interface GridIndex {
  cellToClues: Map<string, { across?: ClueEntry; down?: ClueEntry }>
  numberAt: Map<string, number>
}

export function buildGridIndex(clues: ClueEntry[]): GridIndex {
  const cellToClues = new Map<string, { across?: ClueEntry; down?: ClueEntry }>()
  const numberAt = new Map<string, number>()

  for (const clue of clues) {
    numberAt.set(cellKey(clue.row, clue.col), clue.number)
    for (const cell of wordCells(clue)) {
      const key = cellKey(cell.row, cell.col)
      const existing = cellToClues.get(key) ?? {}
      if (clue.direction === 'across') existing.across = clue
      else existing.down = clue
      cellToClues.set(key, existing)
    }
  }

  return { cellToClues, numberAt }
}

export function isWordComplete(grid: Map<string, string>, clue: ClueEntry): boolean {
  return wordCells(clue).every((c) => (grid.get(cellKey(c.row, c.col)) ?? '').length === 1)
}

export function wordText(grid: Map<string, string>, clue: ClueEntry): string {
  return wordCells(clue)
    .map((c) => grid.get(cellKey(c.row, c.col)) ?? '')
    .join('')
}

export function emptyGridFromLayout(layout: Pick<GridLayout, 'rows' | 'cols'>): Map<string, string> {
  const grid = new Map<string, string>()
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      grid.set(cellKey(r, c), '')
    }
  }
  return grid
}
