import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import clsx from 'clsx'
import { playFanfare } from '@/lib/sound'
import { Trophy, Home, ListChecks, Medal, CheckCircle2, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LinkButton } from '@/components/ui/LinkButton'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { ResultStat } from '@/components/results/ResultStat'
import { AnswerReviewModal } from '@/components/results/AnswerReviewModal'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import {
  fetchGameByCode,
  fetchMyResult,
  fetchResults,
  fetchGameSections,
  fetchMySectionResults,
} from '@/services/gameService'
import { formatDuration } from '@/utils/format'
import type { GameRow, ResultRow, ResultWithUser, GameSectionRow, SectionResultRow } from '@/types/database'
import { getUserRole } from '@/services/authService'

function rankMedal(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

export default function ResultsPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [game, setGame] = useState<GameRow | null | undefined>(undefined)
  const [myResult, setMyResult] = useState<ResultRow | null>(null)
  const [allResults, setAllResults] = useState<ResultWithUser[]>([])
  const [sections, setSections] = useState<GameSectionRow[]>([])
  const [mySectionResults, setMySectionResults] = useState<SectionResultRow[]>([])
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const isMentor = getUserRole() === 'mentor'
  const { game: liveGame } = useRealtimeGame(game?.id)

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

      const [mine, all, secs, mySecs] = await Promise.all([
        fetchMyResult(g.id, profile!.id),
        fetchResults(g.id),
        fetchGameSections(g.id),
        fetchMySectionResults(g.id),
      ])
      if (cancelled) return
      setMyResult(mine)
      setAllResults(all)
      setSections(secs)
      setMySectionResults(mySecs)
    }

    load()
    return () => { cancelled = true }
  }, [gameCode, profile, attempts, navigate])

  const isCreator = Boolean(game && profile && game.creator_id === profile.id)

  useEffect(() => {
    if (isCreator && gameCode) {
      navigate(`/crossword/${gameCode}/live`, { replace: true })
    }
  }, [isCreator, gameCode, navigate])

  useEffect(() => {
    if (isCreator) return
    if (game && !myResult && attempts < 5) {
      const t = window.setTimeout(() => setAttempts((a) => a + 1), 1000)
      return () => window.clearTimeout(t)
    }
  }, [game, myResult, attempts, isCreator])

  const effectiveGameStatus = liveGame?.status ?? game?.status

  const fanfarePlayedRef = useRef(false)
  useEffect(() => {
    if (myResult && effectiveGameStatus !== 'active' && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true
      playFanfare()
    }
  }, [myResult, effectiveGameStatus])

  if (game === undefined) return <FullScreenSpinner label="Loading results..." />
  if (isCreator) return <FullScreenSpinner label="Redirecting host to spectator view..." />
  if (!game) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Game not found" onRetry={() => navigate('/mentor')} />
      </PageShell>
    )
  }
  if (!myResult) return <FullScreenSpinner label="Calculating your result..." />

  if (effectiveGameStatus === 'active') {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <div className="w-full max-w-md animate-fade-in-up text-center flex flex-col items-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-success/10 border-4 border-success/30">
            <CheckCircle2 size={48} className="text-success" />
          </div>
          <h1 className="font-heavy text-4xl uppercase tracking-tight text-text-primary mb-3">
            Submission Complete
          </h1>
          <p className="text-text-secondary text-lg mb-8">
            Your answers have been saved successfully.
          </p>
          
          <Card className="w-full p-8 border-accent-cyan/30 bg-surface-raised shadow-lg shadow-accent-cyan/5">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="animate-spin text-accent-cyan" />
              <p className="font-display text-sm font-semibold uppercase tracking-widest text-accent-cyan">
                Waiting for other students to complete the competition...
              </p>
              <p className="text-sm text-text-muted mt-2">
                Final results will be available once all students have submitted.
              </p>
            </div>
          </Card>
        </div>
      </PageShell>
    )
  }

  const myRank = myResult.rank ?? 0
  const medal = rankMedal(myRank)
  const isMultiSection = sections.length > 0

  // Top 3 Leaderboard
  const top3Results = allResults.slice(0, 3)

  return (
    <PageShell className="flex justify-center py-10">
      <div className="w-full max-w-xl animate-fade-in-up flex flex-col gap-6">

        {/* ── My Result Card ── */}
        <Card>
          <CardBody className="flex flex-col items-center gap-6 py-10 text-center">
            <div className="flex flex-col items-center gap-1">
              <Trophy size={32} className="text-warning animate-bounce" />
              <p className="mt-2 font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
                Match Complete
              </p>
              <h1 className="font-heavy text-5xl uppercase text-outline text-gradient-brand">
                {medal ?? (myRank ? `#${myRank}` : '—')}
              </h1>
              {medal && (
                <p className="font-display text-lg font-bold uppercase tracking-wider text-text-primary">
                  Rank #{myRank}
                </p>
              )}
            </div>

            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Final Score</p>
              <p className="mt-1 font-display text-3xl font-extrabold text-text-primary">
                {myResult.score} <span className="text-xl text-text-secondary">/ {myResult.total_questions} Marks</span>
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <ResultStat label="Solved" value={`${myResult.solved_count}/${myResult.total_questions}`} />
              <ResultStat label="Accuracy" value={`${myResult.accuracy}%`} />
              <ResultStat label="Time" value={formatDuration(myResult.completion_time_seconds)} />
              <ResultStat label="Rank" value={myRank ? `#${myRank}` : '—'} />
            </div>

            {myResult.auto_submitted && (
              <p className="text-xs text-text-muted">Automatically submitted when time expired.</p>
            )}

            <div className="w-full border-t border-border pt-3 text-xs text-text-muted">
              <p className="font-semibold text-text-secondary">{game.title}</p>
              <p className="font-mono">{game.game_code}</p>
            </div>

            <Button variant="secondary" fullWidth onClick={() => setShowReview(true)}>
              <ListChecks size={15} />
              Answer Review
            </Button>

            <div className="flex w-full flex-col gap-3 sm:flex-row">
              {isMentor && (
                <Button variant="secondary" fullWidth onClick={() => setShowFullLeaderboard((v) => !v)}>
                  <Medal size={15} />
                  {showFullLeaderboard ? 'Hide' : 'Full'} Standings
                </Button>
              )}
              <LinkButton to={isMentor ? '/mentor' : '/join-game'} fullWidth>
                <Home size={15} />
                {isMentor ? 'Back to Dashboard' : 'Back to Join Match'}
              </LinkButton>
            </div>
          </CardBody>
        </Card>

        {/* ── Per-section breakdown ── */}
        {isMultiSection && mySectionResults.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                Section Breakdown
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              {sections.map((sec, idx) => {
                const sr = mySectionResults.find((r) => r.section_id === sec.id)
                return (
                  <div
                    key={sec.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3"
                  >
                    <div>
                      <p className="font-display text-sm font-bold uppercase tracking-wide text-text-primary">
                        Section {idx + 1}: {sec.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {sr ? `${sr.solved_count}/${sr.total_questions} questions solved` : 'Not attempted'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-bold text-text-primary">
                        {sr ? `${sr.score} / ${sr.total_questions} Marks` : '0 Marks'}
                      </p>
                      <p className="text-xs text-text-muted">
                        {sr ? formatDuration(sr.completion_time_seconds) : '—'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        )}

        {/* ── Top 3 Leaderboard (Students & Mentors) ── */}
        {top3Results.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                <Trophy size={16} className="text-warning" />
                Top 3 Leaderboard
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-2.5 p-3">
              {top3Results.map((r, i) => {
                const pos = r.rank ?? (i + 1)
                const m = rankMedal(pos)
                const isSelf = r.user_id === profile?.id

                return (
                  <div
                    key={r.user_id}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 transition',
                      pos === 1 ? 'border-warning/60 bg-warning/10' :
                      pos === 2 ? 'border-text-secondary/40 bg-surface-raised' :
                      pos === 3 ? 'border-[#cd7f32]/50 bg-[#cd7f32]/10' :
                      'border-border bg-surface/40'
                    )}
                  >
                    {/* Medal / Rank */}
                    <span className="w-8 shrink-0 text-center text-xl font-bold">
                      {m ?? `#${pos}`}
                    </span>

                    {/* Name / Batch */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {r.user.name}
                        {isSelf && <span className="ml-1.5 text-xs font-bold text-accent-cyan">(You)</span>}
                      </p>
                      {r.user.class && r.user.class !== r.user.name && (
                        <p className="text-xs text-text-muted">{r.user.class}</p>
                      )}
                    </div>

                    {/* Score + time */}
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-text-primary">
                        {r.score} <span className="text-xs font-normal text-text-secondary">Marks</span>
                      </p>
                      <p className="font-mono text-xs text-text-muted">
                        {formatDuration(r.completion_time_seconds)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        )}

        {/* ── Full Leaderboard (Mentors only) ── */}
        {isMentor && showFullLeaderboard && allResults.length > 0 && (
          <Card>
            <CardHeader>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                <Medal size={16} className="text-accent-purple" />
                Complete Standings ({allResults.length} Students)
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 p-3">
              {allResults.map((r, i) => {
                const pos = r.rank ?? (i + 1)
                const m = rankMedal(pos)
                const isSelf = r.user_id === profile?.id

                return (
                  <div
                    key={r.user_id}
                    className={clsx(
                      'flex items-center gap-3 rounded-xl border px-3 py-2 transition',
                      pos <= 3 ? 'border-accent-purple/30 bg-accent-purple/5' :
                      isSelf ? 'border-accent-cyan/40 bg-accent-cyan/5' :
                      'border-border bg-surface/40'
                    )}
                  >
                    <span className="w-8 shrink-0 text-center text-xs font-mono font-bold text-text-muted">
                      {m ?? `#${pos}`}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {r.user.name}
                        {isSelf && <span className="ml-1.5 text-xs text-accent-cyan">(You)</span>}
                      </p>
                      {r.user.class && r.user.class !== r.user.name && (
                        <p className="text-xs text-text-muted">{r.user.class}</p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold text-text-primary">
                        {r.score} <span className="text-xs font-normal text-text-secondary">Marks</span>
                      </p>
                      <p className="font-mono text-xs text-text-muted">
                        {formatDuration(r.completion_time_seconds)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        )}

      </div>

      <AnswerReviewModal open={showReview} onClose={() => setShowReview(false)} gameId={game.id} />
    </PageShell>
  )
}
