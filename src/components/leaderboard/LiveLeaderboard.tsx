import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Trophy, ListOrdered } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { FullLeaderboardModal } from './FullLeaderboardModal'

export interface LeaderboardEntry {
  userId: string
  name: string
  score: number
  solvedCount: number
}

export function LiveLeaderboard({ entries, currentUserId }: { entries: LeaderboardEntry[]; currentUserId?: string }) {
  const [showFull, setShowFull] = useState(false)

  const ranked = useMemo(
    () => entries.map((e, i) => ({ ...e, rank: i + 1 })),
    [entries]
  )
  const top5 = ranked.slice(0, 5)
  const selfEntry = ranked.find((e) => e.userId === currentUserId)
  const selfInTop5 = selfEntry ? selfEntry.rank <= 5 : true

  return (
    <>
      <Card>
        <CardHeader className="flex items-center gap-2">
          <Trophy size={15} className="text-accent-cyan" />
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-text-primary">Live Leaderboard</h3>
        </CardHeader>
        <CardBody className="flex flex-col gap-1.5 py-4">
          {top5.map((entry) => (
            <LeaderboardRow key={entry.userId} entry={entry} isCurrentUser={entry.userId === currentUserId} />
          ))}
          {!selfInTop5 && selfEntry && (
            <>
              <div className="my-1 flex justify-center text-text-muted">⋯</div>
              <LeaderboardRow entry={selfEntry} isCurrentUser />
            </>
          )}
          {ranked.length === 0 && <p className="py-2 text-center text-sm text-text-muted">No scores yet</p>}

          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowFull(true)}>
            <ListOrdered size={14} />
            View Full Leaderboard
          </Button>
        </CardBody>
      </Card>

      <FullLeaderboardModal open={showFull} onClose={() => setShowFull(false)} entries={ranked} currentUserId={currentUserId} />
    </>
  )
}

function LeaderboardRow({ entry, isCurrentUser }: { entry: LeaderboardEntry & { rank: number }; isCurrentUser: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-lg border-2 px-2.5 py-2 text-sm transition-colors',
        isCurrentUser
          ? 'border-accent-purple/50 bg-accent-purple/15'
          : entry.rank === 1
            ? 'border-warning/50 bg-warning/10'
            : 'border-transparent hover:border-border-strong hover:bg-surface-hover'
      )}
    >
      <span
        className={clsx(
          'w-6 shrink-0 text-center font-mono text-xs font-bold',
          entry.rank === 1 && 'text-warning',
          entry.rank === 2 && 'text-text-secondary',
          entry.rank === 3 && 'text-accent-purple',
          entry.rank > 3 && 'text-text-muted'
        )}
      >
        {String(entry.rank).padStart(2, '0')}
      </span>
      <span className="flex-1 truncate font-medium text-text-primary">
        {isCurrentUser ? 'You' : entry.name}
      </span>
      <span className="shrink-0 font-mono text-xs text-text-muted">{entry.solvedCount} solved</span>
      <span className="w-14 shrink-0 text-right font-mono font-bold text-text-primary">{entry.score.toLocaleString()}</span>
    </div>
  )
}
