import { Plus, Trash2 } from 'lucide-react'
import type { DraftClue } from '@/types/crossword'
import type { ClueDirection } from '@/types/database'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export function QuestionBuilderSection({
  direction,
  clues,
  onAdd,
  onRemove,
  onUpdate,
}: {
  direction: ClueDirection
  clues: DraftClue[]
  onAdd: () => void
  onRemove: (localId: string) => void
  onUpdate: (localId: string, patch: Partial<Pick<DraftClue, 'clue' | 'answer'>>) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">{direction}</h3>
        <span className="text-xs text-text-muted">{clues.length} {clues.length === 1 ? 'entry' : 'entries'}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {clues.map((c, i) => (
          <div key={c.localId} className="flex items-start gap-2 rounded-xl border border-white/10 bg-surface/60 p-3 backdrop-blur-xl transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.04]">
            <span className="mt-2.5 w-5 shrink-0 text-center text-xs font-semibold text-text-muted">{i + 1}</span>
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem]">
              <Input
                aria-label={`${direction} clue ${i + 1}`}
                placeholder="Clue"
                value={c.clue}
                onChange={(e) => onUpdate(c.localId, { clue: e.target.value })}
                maxLength={300}
              />
              <Input
                aria-label={`${direction} answer ${i + 1}`}
                placeholder="ANSWER"
                value={c.answer}
                onChange={(e) => onUpdate(c.localId, { answer: e.target.value.toUpperCase() })}
                maxLength={20}
                className="font-mono uppercase tracking-widest"
              />
            </div>
            <button
              type="button"
              onClick={() => onRemove(c.localId)}
              disabled={clues.length <= 1}
              aria-label={`Remove ${direction} entry ${i + 1}`}
              className="mt-2 shrink-0 rounded-md p-1.5 text-text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <Button type="button" variant="secondary" size="sm" onClick={onAdd} className="self-start">
        <Plus size={14} />
        Add Question
      </Button>
    </div>
  )
}
