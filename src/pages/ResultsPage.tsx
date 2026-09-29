import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
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
  fetchQuestionsPublic,
} from '@/services/gameService'
import { formatDuration } from '@/utils/format'
import type { GameRow, ResultRow, ResultWithUser, GameSectionRow, SectionResultRow, QuestionPublicRow } from '@/types/database'
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
  const location = useLocation()
  const { profile } = useAuth()

  const navigationResult = (location.state as { result?: ResultRow } | undefined)?.result ?? null

  const [game, setGame] = useState<GameRow | null | undefined>(undefined)
  const [myResult, setMyResult] = useState<ResultRow | null>(navigationResult)
  const [allResults, setAllResults] = useState<ResultWithUser[]>([])
  const [sections, setSections] = useState<GameSectionRow[]>([])
  const [mySectionResults, setMySectionResults] = useState<SectionResultRow[]>([])
  const [questions, setQuestions] = useState<QuestionPublicRow[]>([])
  const [showReview, setShowReview] = useState(false)
  const [attempts, setAttempts] = useState(0)

  const isMentor = getUserRole() === 'mentor'
  const { game: liveGame } = useRealtimeGame(game?.id)

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'result'>('leaderboard')

  // Derive the effective game status from realtime data (most current) or initial fetch
  const effectiveGameStatus = liveGame?.status ?? game?.status

  useEffect(() => {
    if (liveGame?.status === 'waiting' && gameCode) {
      navigate(`/game/${gameCode}/lobby`, { replace: true })
    }
  }, [liveGame?.status, gameCode, navigate])

  // Active poll while match is active so that as soon as the mentor clicks "Stop Match",
  // the student leaves the waiting screen immediately (within 1.2s) even if websocket drops.
  useEffect(() => {
    if (effectiveGameStatus !== 'active' || !gameCode) return
    const interval = window.setInterval(async () => {
      const g = await fetchGameByCode(gameCode)
      if (g && g.status !== 'active') {
        setGame(g)
      }
    }, 1200)
    return () => window.clearInterval(interval)
  }, [effectiveGameStatus, gameCode])

  // When the host ends the game, trigger data re-fetch so all final rankings and results are loaded.
  const prevStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = effectiveGameStatus
    if (effectiveGameStatus === 'ended' && prev !== 'ended') {
      setAttempts((a) => a + 1)
    }
  }, [effectiveGameStatus])

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

      const [mine, all, secs, mySecs, qs] = await Promise.all([
        fetchMyResult(g.id, profile!.id),
        fetchResults(g.id),
        fetchGameSections(g.id),
        fetchMySectionResults(g.id, g.start_time ?? undefined, profile!.id),
        fetchQuestionsPublic(g.id),
      ])
      if (cancelled) return
      if (mine) setMyResult(mine)
      setAllResults(all)
      setSections(secs)
      setMySectionResults(mySecs)
      setQuestions(qs)
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

  // Retry fetching result if it's not available yet (race condition with backend).
  useEffect(() => {
    if (isCreator) return
    if (game && !myResult && attempts < 10) {
      const t = window.setTimeout(() => setAttempts((a) => a + 1), 1000)
      return () => window.clearTimeout(t)
    }
  }, [game, myResult, attempts, isCreator])

  // Dynamic question count preservation (13 vs 14 fix)
  const sectionQuestionCountMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const q of questions) {
      if (q.section_id) {
        map.set(q.section_id, (map.get(q.section_id) || 0) + 1)
      }
    }
    return map
  }, [questions])

  const effectiveUserId = profile?.id ?? myResult?.user_id
  const selfInResults = useMemo(() => {
    return allResults.find((r) => r.user_id === effectiveUserId)
  }, [allResults, effectiveUserId])

  // Safely fallback to self in allResults if myResult is still being written
  const displayResult = myResult ?? (selfInResults ? {
    id: selfInResults.id,
    game_id: selfInResults.game_id,
    user_id: selfInResults.user_id,
    score: selfInResults.score,
    completion_time_seconds: selfInResults.completion_time_seconds,
    solved_count: selfInResults.solved_count,
    total_questions: selfInResults.total_questions,
    accuracy: selfInResults.accuracy,
    rank: selfInResults.rank,
    auto_submitted: selfInResults.auto_submitted ?? false,
    created_at: selfInResults.created_at ?? new Date().toISOString(),
  } : null)

  const totalGameQuestions = questions.length > 0 ? questions.length : (displayResult?.total_questions ?? 0)
  const effectiveTotalQuestions = totalGameQuestions > 0 ? totalGameQuestions : (displayResult?.total_questions ?? 0)
  const effectiveAccuracy = useMemo(() => {
    if (!displayResult) return 0
    if (effectiveTotalQuestions > 0) {
      return Number(((displayResult.solved_count / effectiveTotalQuestions) * 100).toFixed(2))
    }
    return displayResult.accuracy
  }, [displayResult, effectiveTotalQuestions])

  const myRank = selfInResults?.rank ?? displayResult?.rank ?? 0
  const medal = rankMedal(myRank)
  const isMultiSection = sections.length > 0

  // Authoritative Top 3 Leaderboard — exactly the top 3 rows from ranking
  const top3Results = allResults.slice(0, 3)

  const fanfarePlayedRef = useRef(false)
  useEffect(() => {
    // Only play fanfare once the game is actually ended (not while still active/waiting)
    if (displayResult && effectiveGameStatus !== 'active' && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true
      playFanfare()
    }
  }, [displayResult, effectiveGameStatus])

  if (game === undefined) return <FullScreenSpinner label="Loading match..." />
  if (isCreator) return <FullScreenSpinner label="Redirecting host to spectator view..." />
  if (!game) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Game not found" onRetry={() => navigate('/mentor')} />
      </PageShell>
    )
  }

  // ── Student has submitted, game is still active → show waiting screen ──────
  // When the host ends the game, effectiveGameStatus changes to 'ended'.
  // The student automatically transitions to the Leaderboard.
  if (effectiveGameStatus === 'active') {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg bg-grid-pattern px-4 text-center">
        <div className="flex flex-col items-center gap-6 animate-fade-in-up">
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 size={48} className="text-success" />
            <h1 className="font-heavy text-3xl uppercase tracking-tight text-outline text-text-primary sm:text-4xl">
              Submission Complete
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Your answers have been submitted successfully.
            </p>
          </div>

          <div className="rounded-2xl border border-accent-cyan/30 bg-surface/80 px-8 py-6 backdrop-blur-sm flex flex-col items-center gap-3 max-w-sm w-full shadow-lg shadow-accent-cyan/5">
            <Loader2 size={28} className="animate-spin text-accent-cyan" />
            <p className="font-display text-sm font-semibold uppercase tracking-widest text-accent-cyan">
              Waiting for other students to complete...
            </p>
            <p className="text-xs text-text-muted">
              Results and leaderboard will appear automatically once the host ends the match.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // If match has ended and results are still loading for the very first time, show brief spinner
  if (!displayResult && allResults.length === 0 && attempts < 5) {
    return <FullScreenSpinner label="Loading final leaderboard..." />
  }

  // ── Final Match Ended Screen (Leaderboard + Final Result) ──────────────────
  return (
    <PageShell className="flex justify-center py-10">
      <div className="w-full max-w-xl animate-fade-in-up flex flex-col gap-6">

        {/* ── View Switcher: Leaderboard vs My Result ── */}
        <div className="flex w-full rounded-xl border border-border bg-surface/80 p-1.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-display text-xs font-bold uppercase tracking-wider transition',
              activeTab === 'leaderboard'
                ? 'bg-gradient-to-r from-accent-purple to-accent-cyan text-white shadow-md'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Trophy size={15} />
            Leaderboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('result')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-display text-xs font-bold uppercase tracking-wider transition',
              activeTab === 'result'
                ? 'bg-gradient-to-r from-accent-purple to-accent-cyan text-white shadow-md'
                : 'text-text-muted hover:text-text-primary'
            )}
          >
            <Medal size={15} />
            My Result
          </button>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ── TAB 1: LEADERBOARD VIEW (DEFAULT ON MATCH END) ─────────────────── */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'leaderboard' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Top 3 Finishers Podium */}
            {top3Results.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                    <Trophy size={18} className="text-warning" />
                    Top 3 Leaderboard
                  </h2>
                </CardHeader>
                <CardBody className="flex flex-col gap-2.5 p-4">
                  {top3Results.map((r, i) => {
                    const pos = r.rank ?? (i + 1)
                    const m = rankMedal(pos)
                    const isSelf = r.user_id === effectiveUserId

                    return (
                      <div
                        key={r.user_id}
                        className={clsx(
                          'flex items-center gap-3 rounded-xl border-2 px-3.5 py-3 transition',
                          pos === 1 ? 'border-warning/60 bg-warning/10' :
                          pos === 2 ? 'border-text-secondary/40 bg-surface-raised' :
                          pos === 3 ? 'border-[#cd7f32]/50 bg-[#cd7f32]/10' :
                          'border-border bg-surface/40'
                        )}
                      >
                        <span className="w-8 shrink-0 text-center text-2xl font-bold">
                          {m ?? `#${pos}`}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-text-primary">
                            {r.user.name}
                            {isSelf && <span className="ml-1.5 text-xs font-bold text-accent-cyan">(You)</span>}
                          </p>
                          {r.user.class && r.user.class !== r.user.name && (
                            <p className="text-xs text-text-muted">{r.user.class}</p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="font-mono text-base font-bold text-text-primary">
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

            {/* Complete Standings (All Students) */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary flex items-center gap-2">
                  <Medal size={16} className="text-accent-purple" />
                  Complete Standings ({allResults.length} {allResults.length === 1 ? 'Player' : 'Players'})
                </h2>
                {myRank > 0 && (
                  <span className="font-mono text-xs font-bold text-accent-cyan">
                    Your Rank: #{myRank}
                  </span>
                )}
              </CardHeader>
              <CardBody className="flex flex-col gap-2 p-3">
                {allResults.length === 0 ? (
                  <p className="py-6 text-center text-sm text-text-muted">Loading standings...</p>
                ) : (
                  allResults.map((r, i) => {
                    const pos = r.rank ?? (i + 1)
                    const m = rankMedal(pos)
                    const isSelf = r.user_id === effectiveUserId

                    return (
                      <div
                        key={r.user_id}
                        className={clsx(
                          'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                          pos <= 3 ? 'border-accent-purple/30 bg-accent-purple/5' :
                          isSelf ? 'border-accent-cyan/50 bg-accent-cyan/10' :
                          'border-border bg-surface/40'
                        )}
                      >
                        <span className="w-8 shrink-0 text-center text-xs font-mono font-bold text-text-muted">
                          {m ?? `#${pos}`}
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {r.user.name}
                            {isSelf && <span className="ml-1.5 text-xs font-bold text-accent-cyan">(You)</span>}
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
                  })
                )}
              </CardBody>
            </Card>

            {/* Quick Actions from Leaderboard */}
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Button variant="primary" fullWidth onClick={() => setActiveTab('result')}>
                <Medal size={15} />
                View My Result
              </Button>
              <LinkButton to={isMentor ? '/mentor' : '/join-game'} fullWidth>
                <Home size={15} />
                {isMentor ? 'Back to Dashboard' : 'Back to Join Match'}
              </LinkButton>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ── TAB 2: MY FINAL RESULT VIEW ────────────────────────────────────── */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'result' && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {displayResult ? (
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
                      {displayResult.score} <span className="text-xl text-text-secondary">/ {effectiveTotalQuestions} Marks</span>
                    </p>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
                    <ResultStat label="Solved" value={`${displayResult.solved_count}/${effectiveTotalQuestions}`} />
                    <ResultStat label="Accuracy" value={`${effectiveAccuracy}%`} />
                    <ResultStat label="Time" value={formatDuration(displayResult.completion_time_seconds)} />
                    <ResultStat label="Rank" value={myRank ? `#${myRank}` : '—'} />
                  </div>

                  {displayResult.auto_submitted && (
                    <p className="text-xs text-text-muted">Automatically submitted when match ended.</p>
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
                    <Button variant="secondary" fullWidth onClick={() => setActiveTab('leaderboard')}>
                      <Trophy size={15} />
                      View Leaderboard
                    </Button>
                    <LinkButton to={isMentor ? '/mentor' : '/join-game'} fullWidth>
                      <Home size={15} />
                      {isMentor ? 'Back to Dashboard' : 'Back to Join Match'}
                    </LinkButton>
                  </div>
                </CardBody>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <Loader2 size={32} className="animate-spin text-accent-cyan mx-auto mb-3" />
                <p className="font-display text-sm font-semibold uppercase text-text-muted">
                  Calculating your result...
                </p>
              </Card>
            )}

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
                    const secTotal = sectionQuestionCountMap.get(sec.id) ?? sr?.total_questions ?? 0
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
                            {sr ? `${sr.solved_count}/${secTotal || sr.total_questions} questions solved` : 'Not attempted'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold text-text-primary">
                            {sr ? `${sr.score} / ${secTotal || sr.total_questions} Marks` : '0 Marks'}
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
          </div>
        )}

      </div>

      <AnswerReviewModal open={showReview} onClose={() => setShowReview(false)} gameId={game.id} />
    </PageShell>
  )
}

