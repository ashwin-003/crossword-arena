import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, Clock, ChevronRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { playAlert, playTick } from '@/lib/sound'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { MatchStartCountdown } from '@/components/game/MatchStartCountdown'
import { FullscreenInterruptedOverlay } from '@/components/game/FullscreenInterruptedOverlay'
import { SectionTabs } from '@/components/game/SectionTabs'
import { CrosswordGrid, type CrosswordGridHandle } from '@/components/crossword/CrosswordGrid'
import { CluesPanel } from '@/components/crossword/CluesPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useCompetitionMonitor } from '@/hooks/useCompetitionMonitor'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import { useGameParticipants } from '@/hooks/useGameParticipants'
import { useCrosswordPlay } from '@/hooks/useCrosswordPlay'
import {
  fetchGameByCode,
  fetchMyParticipant,
  fetchQuestionsPublic,
  fetchGameSections,
  fetchMySectionResults,
  submitSection,
  nudgeGameStateIfExpired,
  submitGame,
  touchLastSeen,
} from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { wordCells, cellKey } from '@/utils/crosswordPlay'
import type { GameRow, QuestionPublicRow, GameSectionRow } from '@/types/database'
import type { ClueEntry } from '@/types/crossword'

const MAX_INTERRUPTIONS = 3
const INTERRUPTION_GRACE_SECONDS = 30

export default function CompetitionPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    if (getUserRole() === 'mentor') {
      navigate(gameCode ? `/crossword/${gameCode}/live` : '/mentor', { replace: true })
    }
  }, [gameCode, navigate])

  // ── Core game state ────────────────────────────────────────────────────────
  const [gameId, setGameId] = useState<string | undefined>(undefined)
  const [initialGame, setInitialGame] = useState<GameRow | null | undefined>(undefined)
  const [allQuestions, setAllQuestions] = useState<QuestionPublicRow[]>([])
  const [questionsLoaded, setQuestionsLoaded] = useState(false)

  // ── Sections & sequential progression state ───────────────────────────────
  const [sections, setSections] = useState<GameSectionRow[]>([])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [submittedSectionIds, setSubmittedSectionIds] = useState<Set<string>>(new Set())
  const [unlockedSectionIds, setUnlockedSectionIds] = useState<Set<string>>(new Set())

  // ── Game flow & submission state ──────────────────────────────────────────
  const [interruptionCount, setInterruptionCount] = useState(0)
  const [graceSecondsLeft, setGraceSecondsLeft] = useState(INTERRUPTION_GRACE_SECONDS)
  const [submitSectionModalOpen, setSubmitSectionModalOpen] = useState(false)
  const [submitGameModalOpen, setSubmitGameModalOpen] = useState(false)
  const [submittingSection, setSubmittingSection] = useState(false)
  const [submittingGame, setSubmittingGame] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const gridRef = useRef<CrosswordGridHandle>(null)

  const { isFullscreen, supported: fullscreenSupported, enter } = useFullscreen()
  const [hasEnteredOnce, setHasEnteredOnce] = useState(false)
  const [countdownActive, setCountdownActive] = useState(false)
  const [countdownComplete, setCountdownComplete] = useState(false)

  // Global 60-minute match timer
  const [gameEndTime, setGameEndTime] = useState<string | null>(null)
  const [timerDisplay, setTimerDisplay] = useState('--:--')
  const [timerLevel, setTimerLevel] = useState<'normal' | 'warning-30s' | 'warning-10s' | 'expired'>('normal')

  // ── Auto fullscreen ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fullscreenSupported) {
      setHasEnteredOnce(true)
      if (!countdownComplete) setCountdownActive(true)
      return
    }
    if (isFullscreen) {
      setHasEnteredOnce(true)
      if (!countdownComplete) setCountdownActive(true)
      return
    }
    enter().then((ok) => {
      if (ok) {
        setHasEnteredOnce(true)
        if (!countdownComplete) setCountdownActive(true)
      }
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isFullscreen && !hasEnteredOnce) {
      setHasEnteredOnce(true)
      if (!countdownComplete) setCountdownActive(true)
    }
  }, [isFullscreen, hasEnteredOnce, countdownComplete])

  // ── Fetch game + sections + questions + previous section submissions ─────
  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    ;(async () => {
      const game = await fetchGameByCode(gameCode)
      if (cancelled) return
      setInitialGame(game)
      if (!game) return
      setGameId(game.id)

      let joinedAt: string | undefined
      if (profile?.id) {
        const myParticipant = await fetchMyParticipant(game.id, profile.id)
        joinedAt = myParticipant?.joined_at
      }
      if (cancelled) return

      const [secs, qs, mySecResults] = await Promise.all([
        fetchGameSections(game.id),
        fetchQuestionsPublic(game.id),
        fetchMySectionResults(game.id, joinedAt),
      ])
      if (cancelled) return
      setSections(secs)
      setAllQuestions(qs)
      setQuestionsLoaded(true)

      // Initialize sequential unlock state
      const submitted = new Set<string>()
      for (const sr of mySecResults) {
        submitted.add(sr.section_id)
      }
      setSubmittedSectionIds(submitted)

      if (secs.length > 0) {
        // Unlock all submitted sections + the first unsubmitted section
        const unlocked = new Set<string>()
        let firstUnsubmitted: GameSectionRow | null = null

        for (const s of secs) {
          if (submitted.has(s.id)) {
            unlocked.add(s.id)
          } else if (!firstUnsubmitted) {
            unlocked.add(s.id)
            firstUnsubmitted = s
          }
        }

        // If all submitted, unlock all
        if (unlocked.size === 0 && secs[0]) {
          unlocked.add(secs[0].id)
        }

        setUnlockedSectionIds(unlocked)

        // Set active section to the first unsubmitted one, or first section
        if (firstUnsubmitted) {
          setActiveSectionId(firstUnsubmitted.id)
        } else if (secs[0]) {
          setActiveSectionId(secs[0].id)
        }
      }
    })()
    return () => { cancelled = true }
  }, [gameCode])

  const { game } = useRealtimeGame(gameId)
  const effectiveGame = game ?? initialGame ?? null
  useGameParticipants(gameId, { announceJoins: false })

  const isActive = effectiveGame?.status === 'active'
  const isMultiSection = sections.length > 0

  // ── Set up global 60-minute match timer ───────────────────────────────────
  useEffect(() => {
    if (!countdownComplete || !effectiveGame) return
    if (effectiveGame.end_time) {
      setGameEndTime(effectiveGame.end_time)
    } else if (effectiveGame.time_limit_seconds) {
      setGameEndTime(new Date(Date.now() + effectiveGame.time_limit_seconds * 1000).toISOString())
    } else {
      // Default 60 minutes
      setGameEndTime(new Date(Date.now() + 3600 * 1000).toISOString())
    }
  }, [countdownComplete, effectiveGame])

  const gameIdRef = useRef(gameId)
  useEffect(() => { gameIdRef.current = gameId }, [gameId])
  const showToastRef = useRef(showToast)
  useEffect(() => { showToastRef.current = showToast }, [showToast])

  // ── Global Match Timer Ticker ─────────────────────────────────────────────
  const handleGameTimeoutRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!countdownComplete || !gameEndTime) return

    const tick = () => {
      const rem = Math.max(0, Math.ceil((new Date(gameEndTime).getTime() - Date.now()) / 1000))
      const m = Math.floor(rem / 60)
      const s = rem % 60
      setTimerDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
      setTimerLevel(
        rem <= 0 ? 'expired'
        : rem <= 10 ? 'warning-10s'
        : rem <= 30 ? 'warning-30s'
        : 'normal'
      )

      if (rem <= 0 && !hasSubmitted) {
        handleGameTimeoutRef.current()
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [countdownComplete, gameEndTime, hasSubmitted])

  // ── Active section questions and grid layout ───────────────────────────────
  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeSectionId) ?? null,
    [sections, activeSectionId]
  )

  const activeSectionIndex = useMemo(
    () => sections.findIndex((s) => s.id === activeSectionId),
    [sections, activeSectionId]
  )

  const isLastSection = isMultiSection && activeSectionIndex === sections.length - 1
  const isCurrentSectionSubmitted = activeSectionId ? submittedSectionIds.has(activeSectionId) : false

  const activeQuestions = useMemo((): QuestionPublicRow[] => {
    if (!isMultiSection) return allQuestions
    if (!activeSectionId) return []
    return allQuestions.filter((q) => q.section_id === activeSectionId)
  }, [isMultiSection, allQuestions, activeSectionId])

  const gridLayout = useMemo(() => {
    if (isMultiSection && activeSection) {
      return activeSection.grid_layout
    }
    return effectiveGame?.grid_layout ?? { rows: 0, cols: 0, cellMask: [] }
  }, [isMultiSection, activeSection, effectiveGame])

  // ── Final game submission ──────────────────────────────────────────────────
  const doSubmitGame = useCallback(async (isAuto = false) => {
    const gId = gameIdRef.current
    if (!gId || hasSubmitted) return
    setSubmittingGame(true)

    // Submit current section first if unsubmitted
    if (activeSectionId && !submittedSectionIds.has(activeSectionId)) {
      await submitSection(gId, activeSectionId, isAuto)
    }

    const result = await submitGame(gId)
    setSubmittingGame(false)
    setSubmitGameModalOpen(false)

    if (result.ok) {
      setHasSubmitted(true)
      showToastRef.current({
        variant: 'success',
        title: 'Match Submitted!',
        description: 'Your answers were submitted successfully.',
      })
      navigate(gameCode ? `/game/${gameCode}/results` : '/join-game', { replace: true })
    } else {
      showToastRef.current({ variant: 'danger', title: 'Unable to submit', description: result.error })
    }
  }, [hasSubmitted, activeSectionId, submittedSectionIds, gameCode, navigate])

  const doSubmitGameRef = useRef(doSubmitGame)
  useEffect(() => { doSubmitGameRef.current = doSubmitGame }, [doSubmitGame])

  handleGameTimeoutRef.current = () => {
    playAlert()
    showToastRef.current({
      variant: 'warning',
      title: "Time's up!",
      description: 'Match time expired. Submitting your answers automatically...',
    })
    doSubmitGameRef.current(true)
  }

  // ── Submit current section & unlock next ──────────────────────────────────
  const doSubmitSection = useCallback(async () => {
    const gId = gameIdRef.current
    if (!gId || !activeSectionId || submittedSectionIds.has(activeSectionId)) return

    setSubmittingSection(true)
    const result = await submitSection(gId, activeSectionId, false)
    setSubmittingSection(false)
    setSubmitSectionModalOpen(false)

    if (!result.ok) {
      showToastRef.current({ variant: 'danger', title: 'Unable to submit section', description: result.error })
      return
    }

    const newSubmitted = new Set(submittedSectionIds)
    newSubmitted.add(activeSectionId)
    setSubmittedSectionIds(newSubmitted)

    const currentIndex = sections.findIndex((s) => s.id === activeSectionId)
    const nextSection = sections[currentIndex + 1]

    if (nextSection) {
      const newUnlocked = new Set(unlockedSectionIds)
      newUnlocked.add(nextSection.id)
      setUnlockedSectionIds(newUnlocked)
      setActiveSectionId(nextSection.id)

      showToastRef.current({
        variant: 'success',
        title: `${activeSection?.name ?? 'Section'} Submitted!`,
        description: `${nextSection.name} is now unlocked.`,
      })
    } else {
      // Last section submitted -> finalize whole match!
      showToastRef.current({
        variant: 'success',
        title: 'All Sections Completed!',
        description: 'Finalizing your match result...',
      })
      await doSubmitGameRef.current()
    }
  }, [activeSectionId, submittedSectionIds, sections, unlockedSectionIds, activeSection?.name])

  // ── Section switching ──────────────────────────────────────────────────────
  const handleSelectSection = useCallback((sectionId: string) => {
    if (unlockedSectionIds.has(sectionId) || submittedSectionIds.has(sectionId)) {
      setActiveSectionId(sectionId)
    }
  }, [unlockedSectionIds, submittedSectionIds])

  // ── Countdown complete handler ─────────────────────────────────────────────
  const handleCountdownDone = useCallback(() => {
    setCountdownActive(false)
    setCountdownComplete(true)
  }, [])

  // ── Crossword play ─────────────────────────────────────────────────────────
  const play = useCrosswordPlay({
    gameId,
    userId: profile?.id,
    questions: activeQuestions,
    gridLayout,
    active: isActive && !hasSubmitted && countdownComplete && !isCurrentSectionSubmitted,
  })

  const handleSelectClue = useCallback((clue: ClueEntry) => {
    play.jumpToClue(clue)
    gridRef.current?.focus()
  }, [play])

  // ── Interruption / fullscreen enforcement ──────────────────────────────────
  useCompetitionMonitor({
    gameId,
    userId: profile?.id,
    active: isActive && !hasSubmitted && countdownComplete,
    isFullscreen,
    onInterruption: setInterruptionCount,
    onRestored: () => {},
  })

  useEffect(() => {
    if (!gameId || !isActive || hasSubmitted || !countdownComplete) return
    touchLastSeen(gameId, profile?.id)
    const interval = window.setInterval(() => {
      touchLastSeen(gameId, profile?.id)
      nudgeGameStateIfExpired(gameId)
    }, 20000)
    return () => window.clearInterval(interval)
  }, [gameId, isActive, hasSubmitted, countdownComplete, profile?.id])

  useEffect(() => {
    if (!gameId || !profile?.id || !effectiveGame) return
    let cancelled = false
    fetchMyParticipant(gameId, profile.id).then((participant) => {
      if (cancelled) return
      if (!participant && effectiveGame.creator_id !== profile.id) {
        showToastRef.current({
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
      if (participant) setInterruptionCount(participant.interruption_count)
    })
    return () => { cancelled = true }
  }, [gameId, profile?.id, effectiveGame, gameCode, navigate])

  const autoSubmitTriggeredRef = useRef(false)

  useEffect(() => {
    if (hasSubmitted || autoSubmitTriggeredRef.current) return
    if (interruptionCount < MAX_INTERRUPTIONS) return
    autoSubmitTriggeredRef.current = true
    showToastRef.current({
      variant: 'warning',
      title: 'Attempt limit reached',
      description: 'Your game has been submitted automatically.',
    })
    doSubmitGameRef.current()
  }, [interruptionCount, hasSubmitted])

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
      doSubmitGameRef.current()
    }, INTERRUPTION_GRACE_SECONDS * 1000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [isFullscreen, hasEnteredOnce, fullscreenSupported, hasSubmitted])

  useEffect(() => {
    if (effectiveGame?.status === 'ended' && gameCode) {
      navigate(`/game/${gameCode}/results`, { replace: true })
    }
    if (effectiveGame?.status === 'waiting' && gameCode) {
      navigate(`/game/${gameCode}/lobby`, { replace: true })
    }
  }, [effectiveGame?.status, gameCode, navigate])

  // ── Render guards ──────────────────────────────────────────────────────────
  if (initialGame === undefined || (gameId && !questionsLoaded)) {
    return <FullScreenSpinner />
  }

  if (initialGame === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4">
        <ErrorState
          title="Game Not Found"
          description={`No game exists with code "${gameCode?.toUpperCase()}".`}
          onRetry={() => navigate('/join-game')}
        />
      </div>
    )
  }

  if (!effectiveGame) return null

  // Before countdown has started: show tap-to-start screen if fullscreen needed user gesture
  if (fullscreenSupported && !hasEnteredOnce) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={async () => {
          const ok = await enter()
          if (ok) {
            setHasEnteredOnce(true)
            if (!countdownComplete) setCountdownActive(true)
          }
        }}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            const ok = await enter()
            if (ok) {
              setHasEnteredOnce(true)
              if (!countdownComplete) setCountdownActive(true)
            }
          }
        }}
        className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-bg bg-grid-pattern px-4 text-center select-none"
      >
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-accent-cyan animate-pulse">
            MATCH READY
          </span>
          <h1 className="font-heavy text-4xl uppercase tracking-tight text-outline text-text-primary sm:text-6xl">
            GAME READY
          </h1>
          <p className="mt-2 text-sm text-text-secondary">Click anywhere to begin</p>
        </div>
      </div>
    )
  }

  const interrupted = fullscreenSupported && hasEnteredOnce && countdownComplete && !isFullscreen

  const currentWordCells = new Set(
    play.currentClue ? wordCells(play.currentClue).map((c) => cellKey(c.row, c.col)) : []
  )

  return (
    <div className="min-h-screen bg-bg bg-grid-pattern pb-16">
      {countdownActive && <MatchStartCountdown onDone={handleCountdownDone} />}
      {interrupted && (
        <FullscreenInterruptedOverlay
          interruptionCount={interruptionCount}
          maxInterruptions={MAX_INTERRUPTIONS}
          graceSecondsLeft={graceSecondsLeft}
          locked={interruptionCount >= MAX_INTERRUPTIONS}
          onReturn={enter}
        />
      )}

      {/* Top Game Bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          {/* Row 1: Title + Global Timer + Main Action */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="font-heavy text-base uppercase tracking-wider text-outline text-text-primary sm:text-lg">
                CROSSWORD ARENA
              </span>
              {effectiveGame.title && (
                <span className="hidden truncate text-xs font-semibold text-text-muted sm:inline">
                  · {effectiveGame.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Overall 60-minute Match Timer */}
              <div
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-sm font-bold sm:px-3 sm:py-1.5 sm:text-base ${
                  timerLevel === 'warning-10s' || timerLevel === 'expired'
                    ? 'border-danger/60 bg-danger/10 text-danger animate-pulse'
                    : timerLevel === 'warning-30s'
                      ? 'border-warning/60 bg-warning/10 text-warning'
                      : 'border-border bg-surface-raised/70 text-text-primary'
                }`}
              >
                <Clock size={15} className={timerLevel === 'normal' ? 'text-accent-cyan' : ''} />
                <span>{timerDisplay}</span>
              </div>

              {/* Submit Final Game button */}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSubmitGameModalOpen(true)}
                disabled={hasSubmitted}
              >
                <Send size={14} />
                Submit Match
              </Button>
            </div>
          </div>

          {/* Row 2: Sequential Section Tabs */}
          {isMultiSection && countdownComplete && (
            <SectionTabs
              sections={sections}
              activeSectionId={activeSectionId}
              submittedSectionIds={submittedSectionIds}
              unlockedSectionIds={unlockedSectionIds}
              onSelect={handleSelectSection}
              disabled={hasSubmitted || interrupted}
            />
          )}
        </div>
      </header>

      {/* Main Playing Area */}
      <main className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-6 sm:px-6">

        {/* Current Clue Banner */}
        {play.currentClue && (
          <div className="mb-5 w-full max-w-2xl rounded-xl border border-accent-purple/30 bg-accent-purple/10 px-4 py-3 text-center shadow-sm">
            <span className="mr-2 font-display text-xs font-bold uppercase tracking-wider text-accent-cyan">
              {play.currentClue.number} {play.currentClue.direction.toUpperCase()}
            </span>
            <span className="text-sm font-medium text-text-primary">{play.currentClue.clue}</span>
          </div>
        )}

        {/* Section submitted read-only banner */}
        {isCurrentSectionSubmitted && (
          <div className="mb-5 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 size={18} />
              <span>{activeSection?.name ?? 'Section'} is submitted and locked.</span>
            </div>
            {!isLastSection && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const nextSec = sections[activeSectionIndex + 1]
                  if (nextSec && unlockedSectionIds.has(nextSec.id)) {
                    setActiveSectionId(nextSec.id)
                  }
                }}
              >
                Next Section
                <ChevronRight size={14} />
              </Button>
            )}
          </div>
        )}

        {/* Section Action Bar (Submit Section button) */}
        {isMultiSection && activeSection && !isCurrentSectionSubmitted && (
          <div className="mb-5 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-2.5 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-wider text-text-muted">
                Section {activeSectionIndex + 1} of {sections.length}:
              </span>
              <span className="font-display text-sm font-bold text-text-primary">
                {activeSection.name}
              </span>
            </div>

            <Button
              size="sm"
              variant="primary"
              onClick={() => setSubmitSectionModalOpen(true)}
              disabled={hasSubmitted || interrupted}
            >
              {isLastSection ? 'Submit & Finalize Match' : 'Submit Section'}
              <ChevronRight size={15} />
            </Button>
          </div>
        )}

        {/* Crossword Grid */}
        {(!isMultiSection || activeSectionId) && (
          <div className="flex w-full justify-center">
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
              disabled={hasSubmitted || interrupted || !countdownComplete || isCurrentSectionSubmitted}
            />
          </div>
        )}

        {/* Clues Panel */}
        {(!isMultiSection || activeSectionId) && (
          <div className="mt-8 w-full max-w-3xl">
            <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-lg backdrop-blur-sm sm:p-5">
              <CluesPanel
                clues={play.clues}
                currentClueId={play.currentClue?.id}
                correctness={play.correctness}
                onSelect={handleSelectClue}
              />
            </div>
          </div>
        )}
      </main>

      {/* ── Submit Section Confirmation Modal ── */}
      <Modal
        open={submitSectionModalOpen}
        onClose={() => setSubmitSectionModalOpen(false)}
        title={`Submit ${activeSection?.name ?? 'Section'}?`}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Are you sure you want to submit <strong className="text-text-primary">{activeSection?.name}</strong>?
            Once submitted, your answers for this section will be permanently locked and{' '}
            {isLastSection ? (
              <strong className="text-accent-cyan">your match will be finalized</strong>
            ) : (
              <strong className="text-accent-cyan">{sections[activeSectionIndex + 1]?.name} will unlock</strong>
            )}.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setSubmitSectionModalOpen(false)}
              disabled={submittingSection}
            >
              Keep Solving
            </Button>
            <Button
              variant="primary"
              onClick={doSubmitSection}
              loading={submittingSection}
            >
              {isLastSection ? 'Submit & Finish Match' : 'Yes, Submit Section'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Submit Entire Match Confirmation Modal ── */}
      <Modal
        open={submitGameModalOpen}
        onClose={() => setSubmitGameModalOpen(false)}
        title="Submit Entire Match?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Are you ready to submit your entire match? This will submit all sections with your current answers and finalize your score.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => setSubmitGameModalOpen(false)}
              disabled={submittingGame}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => doSubmitGame(false)}
              loading={submittingGame}
            >
              Submit Final Match
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
