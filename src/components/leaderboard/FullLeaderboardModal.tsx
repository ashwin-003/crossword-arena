import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import type { LeaderboardEntry } from './LiveLeaderboard'

export function FullLeaderboardModal({
  open,
  onClose,
  entries,
  currentUserId,
}: {
  open: boolean
  onClose: () => void
  entries: (LeaderboardEntry & { rank: number })[]
  currentUserId?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title="Full Leaderboard">
      <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
        {entries.map((entry) => (
          <div
            key={entry.userId}
            className={clsx(
              'flex items-center gap-3 rounded-lg border-2 px-2.5 py-2 text-sm',
              entry.userId === currentUserId
                ? 'border-accent-purple/50 bg-accent-purple/15'
                : entry.rank === 1
                  ? 'border-warning/50 bg-warning/10'
                  : 'border-transparent'
            )}
          >
            <span className="w-7 shrink-0 text-center font-mono text-xs font-bold text-text-muted">{entry.rank}</span>
            <span className="flex-1 truncate font-medium text-text-primary">
              {entry.userId === currentUserId ? 'You' : entry.name}
            </span>
            <span className="shrink-0 font-mono text-xs text-text-muted">{entry.solvedCount} solved</span>
            <span className="w-14 shrink-0 text-right font-mono font-bold text-text-primary">{entry.score.toLocaleString()}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="py-4 text-center text-sm text-text-muted">No scores yet</p>}
      </div>
    </Modal>
  )
}
