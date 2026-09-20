import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { playFanfare } from '@/lib/sound'
import { Trophy, ListOrdered, Home, History as HistoryIcon, ListChecks } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { ResultStat } from '@/components/results/ResultStat'
import { FullLeaderboardModal } from '@/components/leaderboard/FullLeaderboardModal'
import { AnswerReviewModal } from '@/components/results/AnswerReviewModal'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import { fetchGameByCode, fetchMyResult, fetchResults } from '@/services/gameService'
import { formatDuration } from '@/utils/format'
import type { GameRow, ResultRow, ResultWithUser } from '@/types/database'

export default function ResultsPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [game, setGame] = useState<GameRow | null | undefined>(undefined)
  const [myResult, setMyResult] = useState<ResultRow | null>(null)
  const [allResults, setAllResults] = useState<ResultWithUser[]>([])
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const { game: liveGame } = useRealtimeGame(game?.id)

  // When the match is restarted by the host, send players back to the lobby
  useEffect(() => {
    if (liveGame?.status === 'waiting' && gameCode) {
      navigate(`/game/${gameCode}/lobby`, { replace: true })
    }
  }, [liveGame?.status, gameCode, navigate])

  useEffect(() => {
    if (!gameCode || !profile) return
    let cancelled = false

    async function load() {
      const g = await fetchGameByCode(gameCode!)
      if (cancelled) return
      setGame(g)
      if (!g) return

      if (profile && g.creator_id === profile.id) {
        navigate(`/crossword/${gameCode}/live`, { replace: true })
        return
      }

      const [mine, all] = await Promise.all([fetchMyResult(g.id, profile!.id), fetchResults(g.id)])
      if (cancelled) return
      setMyResult(mine)
      setAllResults(all)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [gameCode, profile, attempts, navigate])

  const isCreator = Boolean(game && profile && game.creator_id === profile.id)

  useEffect(() => {
    if (isCreator && gameCode) {
      navigate(`/crossword/${gameCode}/live`, { replace: true })
    }
  }, [isCreator, gameCode, navigate])

  // Results are finalized by submit-game / update-game-state; if we land
  // here a beat before that write lands, retry briefly instead of
  // showing a dead end.
  useEffect(() => {
    if (isCreator) return
    if (game && !myResult && attempts < 5) {
      const t = window.setTimeout(() => setAttempts((a) => a + 1), 1000)
      return () => window.clearTimeout(t)
    }
  }, [game, myResult, attempts, isCreator])

  const fanfarePlayedRef = useRef(false)
  useEffect(() => {
    if (myResult && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true
      playFanfare()
    }
  }, [myResult])

  if (game === undefined) return <FullScreenSpinner label="Loading results…" />
  if (isCreator) {
    return <FullScreenSpinner label="Redirecting host to spectator view…" />
  }
  if (!game) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Game not found" onRetry={() => navigate('/lobby')} />
      </PageShell>
    )
  }
  if (!myResult) {
    return <FullScreenSpinner label="Calculating your result…" />
  }

  const leaderboardEntries = allResults.map((r) => ({
    userId: r.user_id,
    name: r.user.name,
    score: r.score,
    solvedCount: r.solved_count,
    rank: r.rank ?? 0,
  }))

  return (
    <PageShell className="flex justify-center py-10">
      <div className="w-full max-w-xl animate-fade-in-up">
        <Card>
          <CardBody className="flex flex-col items-center gap-6 py-10 text-center">
            <div className="flex flex-col items-center gap-1">
              <Trophy size={30} className="text-warning" />
              <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Match Complete</p>
              <h1 className="font-heavy text-5xl uppercase text-outline text-gradient-brand">
                {myResult.rank ? `#${myResult.rank}` : '—'}
              </h1>
            </div>

            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Your Result</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-text-primary">
                {myResult.score.toLocaleString()} <span className="text-lg text-text-secondary">Points</span>
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <ResultStat label="Solved" value={`${myResult.solved_count}/${myResult.total_questions}`} />
              <ResultStat label="Accuracy" value={`${myResult.accuracy}%`} />
              <ResultStat label="Time" value={formatDuration(myResult.completion_time_seconds)} />
              <ResultStat label="Players" value={String(allResults.length)} />
            </div>

            {myResult.auto_submitted && (
              <p className="text-xs text-text-muted">Automatically submitted when time expired.</p>
            )}

            <div className="w-full border-t border-border pt-3 text-xs text-text-muted">
              <p>{game.title}</p>
              <p className="font-mono">{game.game_code}</p>
            </div>

            <Button variant="secondary" fullWidth onClick={() => setShowReview(true)}>
              <ListChecks size={15} />
              Answer Review
            </Button>

            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Button variant="secondary" fullWidth onClick={() => setShowLeaderboard(true)}>
                <ListOrdered size={15} />
                View Leaderboard
              </Button>
              <LinkButton to="/history" variant="secondary" fullWidth>
                <HistoryIcon size={15} />
                View History
              </LinkButton>
            </div>
            <LinkButton to="/lobby" fullWidth>
              <Home size={15} />
              Back to Lobby
            </LinkButton>
          </CardBody>
        </Card>

        {allResults.length > 0 && (
          <Card className="mt-6">
            <CardBody className="flex flex-col items-center gap-5 py-8 text-center">
              <div className="flex flex-col items-center gap-1">
                <Trophy size={26} className="text-warning" />
                <h2 className="font-heavy text-2xl uppercase text-outline text-text-primary">Congratulations!</h2>
                <p className="text-sm text-text-secondary">Top 3 finishers of this match</p>
              </div>
              <div className="flex w-full flex-col gap-2.5">
                {allResults.slice(0, 3).map((r, i) => (
                  <div
                    key={r.user_id}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg border-2 px-3 py-2.5',
                      i === 0
                        ? 'border-warning/60 bg-warning/10'
                        : i === 1
                          ? 'border-text-secondary/40 bg-surface-raised'
                          : 'border-[#cd7f32]/50 bg-[#cd7f32]/10'
                    )}
                  >
                    <span className="text-xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                    <span className="flex-1 truncate text-left font-display text-sm font-bold text-text-primary">{r.user.name}</span>
                    <span className="font-mono text-sm font-bold text-text-primary">{r.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <FullLeaderboardModal
        open={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        entries={leaderboardEntries}
        currentUserId={profile?.id}
      />
      <AnswerReviewModal open={showReview} onClose={() => setShowReview(false)} gameId={game.id} />
    </PageShell>
  )
}
