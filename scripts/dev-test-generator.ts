import { generateCrossword } from '../src/utils/crosswordGenerator'
import type { DraftClue } from '../src/types/crossword'

function clue(direction: 'across' | 'down', text: string, answer: string, localId: string): DraftClue {
  return { localId, direction, clue: text, answer }
}

const drafts: DraftClue[] = [
  clue('across', 'Feline pet', 'CAT', 'a1'),
  clue('down', 'Canine pet', 'DOG', 'd1'),
  clue('across', 'Opposite of hot', 'COLD', 'a2'),
  clue('down', 'Frozen water', 'ICE', 'd2'),
  clue('across', 'Star of our solar system', 'SUN', 'a3'),
  clue('down', 'Not day', 'NIGHT', 'd3'),
  clue('across', 'Large body of salt water', 'OCEAN', 'a4'),
  clue('down', 'Tree fluid', 'SAP', 'd4'),
]

const result = generateCrossword(drafts)

if (!result.ok) {
  console.error('FAILED:', result.error)
  process.exit(1)
}

const { rows, cols, cellMask, solutionGrid, words } = result.crossword
console.log(`Grid: ${rows}x${cols}, words placed: ${words.length}/${drafts.length}`)

for (let r = 0; r < rows; r++) {
  let line = ''
  for (let c = 0; c < cols; c++) {
    line += cellMask[r][c] ? (solutionGrid[r][c] ?? '?') : '.'
  }
  console.log(line)
}

console.log('\nWords:')
for (const w of words) {
  console.log(`${w.number} ${w.direction.toUpperCase()} (${w.row},${w.col}) ${w.answer} — ${w.clue}`)
}

// Validate every placed cell's letter matches every word passing through it
let ok = true
for (const w of words) {
  for (let i = 0; i < w.answer.length; i++) {
    const r = w.direction === 'across' ? w.row : w.row + i
    const c = w.direction === 'across' ? w.col + i : w.col
    if (solutionGrid[r][c] !== w.answer[i]) {
      console.error(`MISMATCH at (${r},${c}) for word ${w.answer}: expected ${w.answer[i]}, grid has ${solutionGrid[r][c]}`)
      ok = false
    }
  }
}

if (words.length !== drafts.length) {
  console.error(`Only placed ${words.length} of ${drafts.length} words`)
  ok = false
}

console.log(ok ? '\nPASS' : '\nFAIL')
process.exit(ok ? 0 : 1)
