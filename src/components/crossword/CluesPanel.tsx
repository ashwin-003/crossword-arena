import clsx from 'clsx'
import type { ClueEntry } from '@/types/crossword'

export function CluesPanel({
  clues,
  currentClueId,
  correctness: _correctness,
  onSelect,
}: {
  clues: ClueEntry[]
  currentClueId: string | undefined
  correctness?: Map<string, boolean>
  onSelect: (clue: ClueEntry) => void
}) {
  const across = clues.filter((c) => c.direction === 'across')
  const down = clues.filter((c) => c.direction === 'down')

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <ClueList title="Across" items={across} currentClueId={currentClueId} onSelect={onSelect} />
      <ClueList title="Down" items={down} currentClueId={currentClueId} onSelect={onSelect} />
    </div>
  )
}

function ClueList({
  title,
  items,
  currentClueId,
  onSelect,
}: {
  title: string
  items: ClueEntry[]
  currentClueId: string | undefined
  onSelect: (clue: ClueEntry) => void
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-raised/40 p-4 transition-colors duration-200">
      <h3 className="mb-3 border-b border-border pb-2 font-display text-sm font-bold uppercase tracking-widest text-accent-cyan">
        {title}
      </h3>
      <ul className="flex flex-col gap-1 pr-1">
        {items.map((clue) => {
          const isActive = clue.id === currentClueId
          return (
            <li key={clue.id}>
              <button
                type="button"
                onClick={() => onSelect(clue)}
                onContextMenu={(e) => e.preventDefault()}
                className={clsx(
                  'flex w-full select-none items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-accent-purple/25 text-text-primary ring-1 ring-accent-purple/50'
                    : 'text-text-secondary hover:bg-white/[0.06] hover:text-text-primary'
                )}
              >
                <span className="w-6 shrink-0 font-mono text-xs font-bold text-text-muted">{clue.number}.</span>
                <span className="flex-1 leading-snug">{clue.clue}</span>
              </button>
            </li>
          )
        })}
        {items.length === 0 && <li className="px-2.5 py-1.5 text-sm text-text-muted">None</li>}
      </ul>
    </div>
  )
}
