import type { GeneratedCrossword } from '@/types/crossword'

/** Read-only preview of a freshly generated grid — shown to the creator
 * only, before the game exists. Answers are visible here on purpose (it's
 * the creator's own answer key); the live in-game grid never does this. */
export function GridPreview({ crossword }: { crossword: GeneratedCrossword }) {
  const { rows, cols, cellMask, solutionGrid, words } = crossword

  const numberAt = new Map<string, number>()
  for (const w of words) numberAt.set(`${w.row},${w.col}`, w.number)

  const across = words.filter((w) => w.direction === 'across')
  const down = words.filter((w) => w.direction === 'down')

  const cellSize = cols > 16 ? 26 : cols > 11 ? 32 : 38

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex flex-col items-center gap-3">
        <div
          className="inline-grid gap-px rounded-lg border border-border-strong bg-border-strong p-px shadow-inner"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize}px)` }}
        >
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              const filled = cellMask[r][c]
              const number = numberAt.get(`${r},${c}`)
              return (
                <div
                  key={`${r}-${c}`}
                  className={filled ? 'relative flex items-center justify-center bg-surface-raised text-text-primary' : 'bg-bg'}
                  style={{ width: cellSize, height: cellSize }}
                >
                  {number !== undefined && (
                    <span className="absolute left-0.5 top-0 text-[8px] font-bold text-accent-cyan">{number}</span>
                  )}
                  {filled && (
                    <span className="font-mono text-sm font-semibold">{solutionGrid[r][c]}</span>
                  )}
                </div>
              )
            })
          )}
        </div>
        <p className="text-xs text-text-muted">
          {rows} × {cols} grid · {words.length} {words.length === 1 ? 'entry' : 'entries'}
        </p>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2">
        <ClueColumn title="Across" words={across} />
        <ClueColumn title="Down" words={down} />
      </div>
    </div>
  )
}

function ClueColumn({ title, words }: { title: string; words: GeneratedCrossword['words'] }) {
  return (
    <div>
      <h4 className="mb-2 font-display text-xs font-bold uppercase tracking-widest text-text-secondary">{title}</h4>
      <ul className="flex flex-col gap-1.5">
        {words.map((w) => (
          <li key={w.localId} className="text-sm text-text-secondary">
            <span className="mr-1.5 font-semibold text-text-primary">{w.number}.</span>
            {w.clue} <span className="text-xs text-text-muted">({w.answer.length})</span>
          </li>
        ))}
        {words.length === 0 && <li className="text-sm text-text-muted">None</li>}
      </ul>
    </div>
  )
}
