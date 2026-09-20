import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Grid3x3 as GridIcon, Trophy, Send, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button, buttonClasses } from '@/components/ui/Button'
import { playAlert, playTick } from '@/lib/sound'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { CompetitionGate } from '@/components/game/CompetitionGate'
import { MatchStartCountdown } from '@/components/game/MatchStartCountdown'
import { FullscreenInterruptedOverlay } from '@/components/game/FullscreenInterruptedOverlay'
import { MatchHud } from '@/components/game/MatchHud'
import { SubmitDialog } from '@/components/game/SubmitDialog'
import { CrosswordGrid, type CrosswordGridHandle } from '@/components/crossword/CrosswordGrid'
import { CluesPanel } from '@/components/crossword/CluesPanel'
import { LiveLeaderboard, type LeaderboardEntry } from '@/components/leaderboard/LiveLeaderboard'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useCompetitionMonitor } from '@/hooks/useCompetitionMonitor'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import { useGameParticipants } from '@/hooks/useGameParticipants'
import { useGameTimer } from '@/hooks/useGameTimer'
import { useCrosswordPlay } from '@/hooks/useCrosswordPlay'
import { fetchGameByCode, fetchMyParticipant, fetchQuestionsPublic, logGameEvent, nudgeGameStateIfExpired, submitGame, touchLastSeen } from '@/services/gameService'
import { wordCells, cellKey } from '@/utils/crosswordPlay'
import type { GameRow, QuestionPublicRow } from '@/types/database'
import type { ClueEntry } from '@/types/crossword'

type MobileTab = 'play' | 'stats'

const MAX_INTERRUPTIONS = 3
const INTERRUPTION_GRACE_SECONDS = 30

export default function CompetitionPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [gameId, setGameId] = useState<string | undefined>(undefined)
  const [initialGame, setInitialGame] = useState<GameRow | null | undefined>(undefined)
  const [questions, setQuestions] = useState<QuestionPublicRow[]>([])
  const [questionsLoaded, setQuestionsLoaded] = useState(false)
  const [interruptionCount, setInterruptionCount] = useState(0)
  const [graceSecondsLeft, setGraceSecondsLeft] = useState(INTERRUPTION_GRACE_SECONDS)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('play')
  const gridRef = useRef<CrosswordGridHandle>(null)

  const { isFullscreen, supported: fullscreenSupported, enter } = useFullscreen()
  const [entering, setEntering] = useState(false)
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false)

  // Resolve gameCode -> gameId once.
  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    ;(async () => {
      const game = await fetchGameByCode(gameCode)
      if (cancelled) return
      setInitialGame(game)
      if (game) setGameId(game.id)
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode])

  const { game, connectionStatus } = useRealtimeGame(gameId)
  const effectiveGame = game ?? initialGame ?? null
  const { participants } = useGameParticipants(gameId, { announceJoins: false })

  useEffect(() => {
    if (!gameId) return
    fetchQuestionsPublic(gameId).then((qs) => {
      setQuestions(qs)
      setQuestionsLoaded(true)
    })
  }, [gameId])

  const isActive = effectiveGame?.status === 'active'

  const gridLayout = useMemo(
    () => effectiveGame?.grid_layout ?? { rows: 0, cols: 0, cellMask: [] },
    [effectiveGame]
  )

  const play = useCrosswordPlay({
    gameId,
    userId: profile?.id,
    questions,
    gridLayout,
    active: isActive && !hasSubmitted,
  })

  const handleSelectClue = useCallback(
    (clue: ClueEntry) => {
      play.jumpToClue(clue)
      gridRef.current?.focus()
    },
    [play]
  )

  const doSubmit = useCallback(async () => {
    if (!gameId || hasSubmitted) return
    setSubmitting(true)
    const result = await submitGame(gameId)
    setSubmitting(false)
    setSubmitOpen(false)
    if (result.ok) {
      setHasSubmitted(true)
      navigate(`/game/${gameCode}/results`, { replace: true })
    } else {
      showToast({ variant: 'danger', title: 'Unable to submit', description: result.error })
    }
  }, [gameId, hasSubmitted, gameCode, navigate, showToast])

  // Keep refs to the latest submit/toast functions so the timer effects
  // below don't need them as dependencies (which would restart the
  // countdown every time doSubmit's identity changes).
  const doSubmitRef = useRef(doSubmit)
  useEffect(() => {
    doSubmitRef.current = doSubmit
  }, [doSubmit])
  const showToastRef = useRef(showToast)
  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  const handleExpire = useCallback(() => {
    if (!gameId || hasSubmitted) return
    showToast({ variant: 'warning', title: "Time's Up", description: 'Your answers have been submitted automatically.' })
    nudgeGameStateIfExpired(gameId)
  }, [gameId, hasSubmitted, showToast])

  const timer = useGameTimer(effectiveGame?.end_time, handleExpire)

  useCompetitionMonitor({
    gameId,
    userId: profile?.id,
    active: isActive && !hasSubmitted,
    isFullscreen,
    onInterruption: setInterruptionCount,
    onRestored: () => {},
  })

  // Heartbeat: mark presence every 20s while actively playing, and
  // opportunistically ask the server to sweep for anyone else who's gone
  // stale (closed their tab). This is how a closed-tab player eventually
  // gets caught even with no per-player backend timer.
  useEffect(() => {
    if (!gameId || !isActive || hasSubmitted) return
    touchLastSeen(gameId)
    const interval = window.setInterval(() => {
      touchLastSeen(gameId)
      nudgeGameStateIfExpired(gameId)
    }, 20000)
    return () => window.clearInterval(interval)
  }, [gameId, isActive, hasSubmitted])

  const [showIntro, setShowIntro] = useState(false)
  const introDecidedRef = useRef(false)
  useEffect(() => {
    if (introDecidedRef.current) return
    if (!isActive || !hasEnteredOnce || !effectiveGame) return
    introDecidedRef.current = true
    const elapsed = effectiveGame.time_limit_seconds - timer.remainingSeconds
    if (elapsed >= 0 && elapsed < 5) {
      setShowIntro(true)
    }
  }, [isActive, hasEnteredOnce, effectiveGame, timer.remainingSeconds])

  // Hydrate real state from the server on every mount instead of trusting
  // fresh local state. Without this, closing the tab and reopening always
  // showed 0 interruptions and hasSubmitted=false, even if the player had
  // already used up attempts or already finished.
  useEffect(() => {
    if (!gameId || !profile?.id || !effectiveGame) return
    let cancelled = false
    fetchMyParticipant(gameId, profile.id).then((participant) => {
      if (cancelled) return
      if (!participant && effectiveGame.creator_id !== profile.id) {
        showToast({
          variant: 'danger',
          title: 'Not in this match',
          description: 'You are not registered as a participant for this match.',
        })
        navigate(`/game/${gameCode}/lobby`, { replace: true })
        return
      }
      if (participant?.status === 'submitted') {
        setHasSubmitted(true)
        navigate(`/game/${gameCode}/results`, { replace: true })
        return
      }
      if (participant) {
        setInterruptionCount(participant.interruption_count)
      }
    })
    return () => {
      cancelled = true
    }
  }, [gameId, profile?.id, effectiveGame, gameCode, navigate, showToast])

  const autoSubmitTriggeredRef = useRef(false)

  // Cap 1: 3 total interruptions (fullscreen exits) across the whole match.
  // Fires the moment the cap is reached — whether that happened just now
  // or was already true on the server from a previous session.
  useEffect(() => {
    if (hasSubmitted || autoSubmitTriggeredRef.current) return
    if (interruptionCount < MAX_INTERRUPTIONS) return
    autoSubmitTriggeredRef.current = true
    showToastRef.current({
      variant: 'warning',
      title: 'Attempt limit reached',
      description: 'Your game has been submitted automatically.',
    })
    doSubmitRef.current()
  }, [interruptionCount, hasSubmitted])

  // Cap 2: a 30-second grace window per interruption. Leaving fullscreen
  // starts a countdown; if they haven't returned by the time it hits zero,
  // their game is auto-submitted immediately — even on the first offense.
  useEffect(() => {
    const isInterrupted = fullscreenSupported && hasEnteredOnce && !isFullscreen

    if (!isInterrupted || hasSubmitted) {
      setGraceSecondsLeft(INTERRUPTION_GRACE_SECONDS)
      return
    }

    playAlert()
    setGraceSecondsLeft(INTERRUPTION_GRACE_SECONDS)
    const deadline = Date.now() + INTERRUPTION_GRACE_SECONDS * 1000
    let lastTickSecond = -1

    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setGraceSecondsLeft(remaining)
      if (remaining <= 10 && remaining !== lastTickSecond) {
        lastTickSecond = remaining
        playTick()
      }
    }, 250)

    const timeout = window.setTimeout(() => {
      if (autoSubmitTriggeredRef.current) return
      autoSubmitTriggeredRef.current = true
      showToastRef.current({
        variant: 'danger',
        title: "Time's up",
        description: "You didn't return to fullscreen in time — your game has been submitted automatically.",
      })
      doSubmitRef.current()
    }, INTERRUPTION_GRACE_SECONDS * 1000)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [isFullscreen, hasEnteredOnce, fullscreenSupported, hasSubmitted])

  // Reconcile local progress with the server once a dropped connection
  // comes back, rather than trusting whatever was cached while offline.
  const previousConnectionRef = useRef(connectionStatus)
  useEffect(() => {
    if (previousConnectionRef.current === 'reconnecting' && connectionStatus === 'connected') {
      play.reload()
      showToast({ variant: 'success', title: 'Reconnected', description: 'Connection restored.' })
      if (gameId && profile?.id) logGameEvent(gameId, profile.id, 'reconnected')
    }
    previousConnectionRef.current = connectionStatus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus])

  // React to server-driven status transitions (redirect once the game ends).
  useEffect(() => {
    if (effectiveGame?.status === 'ended') {
      navigate(`/game/${gameCode}/results`, { replace: true })
    }
    if (effectiveGame?.status === 'waiting') {
      navigate(`/game/${gameCode}/lobby`, { replace: true })
    }
  }, [effectiveGame?.status, gameCode, navigate])

  async function handleEnterFullscreen() {
    setEntering(true)
    const ok = await enter()
    setEntering(false)
    if (ok) setHasEnteredOnce(true)
  }

  if (initialGame === undefined || !questionsLoaded) {
    return <FullScreenSpinner label="Loading competition…" />
  }
  if (!effectiveGame) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <ErrorState title="Game not found" onRetry={() => navigate('/lobby')} />
      </div>
    )
  }

  // Never yet entered fullscreen this session: show the one-time gate.
  if (fullscreenSupported && !isFullscreen && !hasEnteredOnce) {
    return <CompetitionGate onEnter={handleEnterFullscreen} entering={entering} />
  }

  // Was in fullscreen and exited mid-match: pause interaction and start the
  // grace countdown. The timer keeps running regardless.
  const interrupted = fullscreenSupported && hasEnteredOnce && !isFullscreen

  const leaderboardEntries: LeaderboardEntry[] = participants
    .slice()
    .sort((a, b) => b.live_score - a.live_score || b.live_solved_count - a.live_solved_count)
    .map((p) => ({ userId: p.user_id, name: p.user.name, score: p.live_score, solvedCount: p.live_solved_count }))

  const myRankIndex = leaderboardEntries.findIndex((e) => e.userId === profile?.id)
  const myScore = myRankIndex >= 0 ? leaderboardEntries[myRankIndex].score : 0

  const currentWordCells = new Set(
    play.currentClue ? wordCells(play.currentClue).map((c) => cellKey(c.row, c.col)) : []
  )

  return (
    <div className="min-h-screen bg-bg bg-grid-pattern pb-24 xl:pb-8">
      {showIntro && <MatchStartCountdown onDone={() => setShowIntro(false)} />}
      {interrupted && (
        <FullscreenInterruptedOverlay
          interruptionCount={interruptionCount}
          maxInterruptions={MAX_INTERRUPTIONS}
          graceSecondsLeft={graceSecondsLeft}
          locked={interruptionCount >= MAX_INTERRUPTIONS}
          onReturn={handleEnterFullscreen}
        />
      )}

      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-[100rem] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate font-display text-sm font-extrabold uppercase tracking-wide text-text-primary sm:text-base">
              {effectiveGame.title}
            </h1>
            <Badge tone="danger" pulse>
              Live
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-lg font-bold text-text-primary sm:inline">{timer.formatted}</span>
            {effectiveGame.creator_id === profile?.id && (
              <Link
                to={`/game/${gameCode}/monitor`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: 'secondary', size: 'sm' })}
              >
                <ShieldAlert size={14} />
                Monitor
              </Link>
            )}
            <Button size="sm" variant="primary" onClick={() => setSubmitOpen(true)} disabled={hasSubmitted}>
              <Send size={14} />
              Submit Game
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6">
        {/* Mobile tab switcher */}
        <div className="mb-4 flex gap-2 xl:hidden">
          <TabButton icon={GridIcon} label="Play" active={mobileTab === 'play'} onClick={() => setMobileTab('play')} />
          <TabButton icon={Trophy} label="Stats" active={mobileTab === 'stats'} onClick={() => setMobileTab('stats')} />
        </div>

        <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[18rem_1fr_20rem] xl:items-start">
          <div className={mobileTab === 'play' ? 'order-2 block xl:order-none' : 'hidden xl:order-none xl:block'}>
            <div className="rounded-2xl border border-border bg-surface/90 p-4">
              <CluesPanel clues={play.clues} currentClueId={play.currentClue?.id} correctness={play.correctness} onSelect={handleSelectClue} />
            </div>
          </div>

          <div className={mobileTab === 'play' ? 'order-1 flex justify-center xl:order-none' : 'hidden justify-center xl:order-none xl:flex'}>
            <div className="flex w-full max-w-full flex-col items-center gap-3">
              {play.currentClue && (
                <p
                  className="max-w-md select-none text-center text-sm text-text-secondary"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span className="mr-1.5 font-semibold text-text-primary">
                    {play.currentClue.number} {play.currentClue.direction.toUpperCase()}
                  </span>
                  {play.currentClue.clue}
                </p>
              )}
              <CrosswordGrid
                ref={gridRef}
                gridLayout={gridLayout}
                grid={play.grid}
                numberAt={play.numberAt}
                cellToClues={play.cellToClues}
                correctness={play.correctness}
                selected={play.selected}
                direction={play.direction}
                currentWordCells={currentWordCells}
                onSelect={play.selectCell}
                onLetter={play.setLetter}
                onBackspace={play.handleBackspace}
                onArrow={play.moveSelection}
                onTab={(shift) => play.jumpRelative(shift ? -1 : 1)}
                onEnter={() => play.jumpRelative(1)}
                disabled={hasSubmitted || interrupted || showIntro}
              />
            </div>
          </div>

          <div className={mobileTab === 'stats' ? 'order-3 mt-4 block xl:order-none xl:mt-0' : 'hidden xl:order-none xl:block'}>
            <div className="flex flex-col gap-4">
              <MatchHud
                timerFormatted={timer.formatted}
                timerLevel={timer.level}
                score={myScore}
                rank={myRankIndex >= 0 ? myRankIndex + 1 : null}
                totalParticipants={leaderboardEntries.length}
                solvedCount={play.solvedCount}
                totalQuestions={play.totalQuestions}
                participantCount={participants.length}
                connectionStatus={connectionStatus}
                saveStatus={play.saveStatus}
              />
              <LiveLeaderboard entries={leaderboardEntries} currentUserId={profile?.id} />
            </div>
          </div>
        </div>
      </div>

      <SubmitDialog open={submitOpen} onCancel={() => setSubmitOpen(false)} onConfirm={doSubmit} submitting={submitting} />
    </div>
  )
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof GridIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
        active ? 'border-accent-purple bg-accent-purple/15 text-accent-purple' : 'border-border-strong text-text-secondary'
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
