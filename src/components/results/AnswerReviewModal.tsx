import { useEffect, useState, Fragment } from 'react'
import { Check, X } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { fetchMyReview, type ReviewRow } from '@/services/gameService'

export function AnswerReviewModal({ open, onClose, gameId }: { open: boolean; onClose: () => void; gameId: string }) {
  const [rows, setRows] = useState<ReviewRow[] | null>(null)

  useEffect(() => {
    if (!open) return
    setRows(null)
    fetchMyReview(gameId).then(setRows)
  }, [open, gameId])

  return (
    <Modal open={open} onClose={onClose} title="Answer Review">
      {rows === null && <Spinner label="Loading review…" />}
      {rows && rows.length === 0 && <p className="py-4 text-center text-sm text-text-muted">No review available.</p>}
      {rows && rows.length > 0 && (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {rows.map((r, i) => {
            const showHeader = i === 0 || r.section_name !== rows[i - 1].section_name
            return (
              <Fragment key={r.question_id}>
                {showHeader && (
                  <h3 className="mt-3 font-semibold text-text-primary first:mt-0">
                    {r.section_name}
                  </h3>
                )}
                <div
                  className={clsx(
                    'rounded-lg border px-3 py-2 text-sm',
                    r.is_correct === true
                      ? 'border-success/30 bg-success/5'
                      : r.is_correct === false
                        ? 'border-danger/30 bg-danger/5'
                        : 'border-border bg-surface/40'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-text-secondary">
                      <span className="mr-1.5 font-semibold text-text-primary">
                        {r.number} {r.direction.toUpperCase()}
                      </span>
                      {r.clue}
                    </p>
                    {r.is_correct === true && <Check size={16} className="mt-0.5 shrink-0 text-success" />}
                    {r.is_correct === false && <X size={16} className="mt-0.5 shrink-0 text-danger" />}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs">
                    <span className={r.is_correct === true ? 'text-success' : r.is_correct === false ? 'text-danger' : 'text-text-muted'}>
                      Your answer: {r.my_answer || '—'}
                    </span>
                    {r.is_correct !== true && <span className="text-text-secondary">Correct: {r.correct_answer}</span>}
                  </div>
                </div>
              </Fragment>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
