import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/LinkButton'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { ResultStat } from '@/components/results/ResultStat'
import { useAuth } from '@/contexts/AuthContext'
import { fetchGameByCode, fetchMyResult, fetchResults } from '@/services/gameService'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { GameRow, ResultRow, ResultWithUser } from '@/types/database'

export default function GameHistoryDetailPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [game, setGame] = useState<GameRow | null | undefined>(undefined)
  const [myResult, setMyResult] = useState<ResultRow | null>(null)
  const [allResults, setAllResults] = useState<ResultWithUser[]>([])

  useEffect(() => {
    if (!gameCode || !profile) return
    ;(async () => {
      const g = await fetchGameByCode(gameCode)
      setGame(g)
      if (!g) return
      const [mine, all] = await Promise.all([fetchMyResult(g.id, profile.id), fetchResults(g.id)])
      setMyResult(mine)
      setAllResults(all)
    })()
  }, [gameCode, profile])

  if (game === undefined) return <FullScreenSpinner label="Loading match…" />
  if (!game || !myResult) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Match not found in your history" onRetry={() => navigate('/history')} />
      </PageShell>
    )
  }

  return (
    <PageShell className="flex justify-center py-10">
      <div className="w-full max-w-2xl animate-fade-in-up">
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="mb-4 flex items-center gap-1.5 text-sm text-text-secondary transition hover:text-text-primary"
        >
          <ArrowLeft size={15} />
          Back to History
        </button>

        <Card>
          <CardHeader className="text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">{formatDateTime(myResult.created_at)}</p>
            <h1 className="mt-1 font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">{game.title}</h1>
            <p className="mt-1 font-mono text-xs text-text-muted">{game.game_code}</p>
          </CardHeader>
          <CardBody className="flex flex-col items-center gap-6 py-8">
            <div className="flex items-center gap-2">
              <Trophy size={20} className="text-warning" />
              <span className="font-display text-3xl font-extrabold text-gradient-brand">
                {myResult.rank ? `#${myResult.rank}` : '—'}
              </span>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <ResultStat label="Marks" value={`${myResult.score} / ${myResult.total_questions}`} />
              <ResultStat label="Solved" value={`${myResult.solved_count}/${myResult.total_questions}`} />
              <ResultStat label="Accuracy" value={`${myResult.accuracy}%`} />
              <ResultStat label="Time" value={formatDuration(myResult.completion_time_seconds)} />
            </div>

            <div className="w-full border-t border-border pt-5">
              <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-widest text-text-secondary">Final Standings</h2>
              <div className="flex flex-col gap-1">
                {allResults.map((r) => (
                  <div
                    key={r.id}
                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm ${
                      r.user_id === profile?.id ? 'bg-accent-purple/15 ring-1 ring-accent-purple/40' : ''
                    }`}
                  >
                    <span className="w-7 shrink-0 text-center font-mono text-xs font-bold text-text-muted">{r.rank}</span>
                    <span className="flex-1 truncate font-medium text-text-primary">
                      {r.user_id === profile?.id ? 'You' : r.user.name}
                    </span>
                    <span className="font-mono font-bold text-text-primary">{r.score} Marks</span>
                  </div>
                ))}
              </div>
            </div>

            <LinkButton to="/history" fullWidth>
              Back to History
            </LinkButton>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  )
}
