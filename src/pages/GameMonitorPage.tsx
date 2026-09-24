import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ShieldAlert,
  ArrowLeft,
  UserX,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
  Layers,
} from 'lucide-react'
import clsx from 'clsx'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { ConnectionStatusBadge } from '@/components/game/ConnectionStatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchGameByCode,
  disqualifyParticipant,
  fetchQuestionAnalytics,
  fetchMentorLiveMonitoring,
  type QuestionAnalyticsRow,
} from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { formatDuration } from '@/utils/format'
import type { GameRow, StudentProgressItem, MentorLiveMonitoringData } from '@/types/database'

const MAX_INTERRUPTIONS = 3

export default function GameMonitorPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [initialGame, setInitialGame] = useState<GameRow | null | undefined>(undefined)
  const [gameId, setGameId] = useState<string | undefined>(undefined)
  const [monitoringData, setMonitoringData] = useState<MentorLiveMonitoringData | null>(null)
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<StudentProgressItem | null>(null)
  const [removing, setRemoving] = useState(false)
  const [analytics, setAnalytics] = useState<QuestionAnalyticsRow[]>([])

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    fetchGameByCode(gameCode).then((g) => {
      if (cancelled) return
      setInitialGame(g)
      if (g) setGameId(g.id)
    })
    return () => {
      cancelled = true
    }
  }, [gameCode])

  const { game, connectionStatus } = useRealtimeGame(gameId)
  const effectiveGame = game ?? initialGame ?? null

  const isCreator = Boolean(profile?.id && effectiveGame?.creator_id === profile.id)

  useEffect(() => {
    if (effectiveGame && profile && !isCreator) {
      navigate(getUserRole() === 'mentor' ? '/mentor' : '/join-game', { replace: true })
    }
  }, [effectiveGame, profile, isCreator, navigate])

  // ── Load live monitoring data ──────────────────────────────────────────────
  const loadMonitoring = useCallback(async () => {
    if (!gameId) return
    const data = await fetchMentorLiveMonitoring(gameId)
    if (data) {
      setMonitoringData(data)
    }
  }, [gameId])

  useEffect(() => {
    if (!gameId || !isCreator) return
    loadMonitoring()

    // Realtime subscriptions on participants and section_results to update live
    const channel = supabase
      .channel(`mentor_monitor:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` },
        () => loadMonitoring()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'section_results', filter: `game_id=eq.${gameId}` },
        () => loadMonitoring()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'results', filter: `game_id=eq.${gameId}` },
        () => loadMonitoring()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, isCreator, loadMonitoring])

  useEffect(() => {
    if (!gameId || effectiveGame?.status !== 'ended') return
    fetchQuestionAnalytics(gameId).then(setAnalytics)
  }, [gameId, effectiveGame?.status])

  const toggleStudentExpand = (userId: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const expandAll = () => {
    if (!monitoringData) return
    if (expandedStudents.size === monitoringData.students.length) {
      setExpandedStudents(new Set())
    } else {
      setExpandedStudents(new Set(monitoringData.students.map((s) => s.user_id)))
    }
  }

  async function handleConfirmRemove() {
    if (!gameId || !target) return
    setRemoving(true)
    const result = await disqualifyParticipant(gameId, target.user_id)
    setRemoving(false)
    setTarget(null)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to remove player', description: result.error })
      return
    }
    showToast({
      variant: 'success',
      title: 'Player removed',
      description: `${target.display_name}'s game has been submitted and they've been removed.`,
    })
    loadMonitoring()
  }

  if (initialGame === undefined) {
    return <FullScreenSpinner label="Loading match…" />
  }
  if (!effectiveGame) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Game not found" onRetry={() => navigate('/mentor')} />
      </PageShell>
    )
  }
  if (!isCreator) {
    return <FullScreenSpinner label="Redirecting…" />
  }

  const students = monitoringData?.students ?? []

  return (
    <PageShell className="py-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <Link
            to={`/crossword/${effectiveGame.game_code}/live`}
            className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={15} />
            Back to Spectator View
          </Link>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldAlert size={26} className="text-accent-purple" />
            <div>
              <h1 className="font-display text-xl font-extrabold uppercase tracking-tight text-text-primary sm:text-2xl">
                Student Live Monitor
              </h1>
              <p className="text-xs text-text-secondary">
                {effectiveGame.title} · Match Code: <span className="font-mono font-bold text-accent-cyan">{effectiveGame.game_code}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={expandAll}>
              <Layers size={14} />
              {expandedStudents.size === students.length && students.length > 0 ? 'Collapse All' : 'Expand All'}
            </Button>
          </div>
        </div>

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Total Enrolled</p>
            <p className="mt-1 font-mono text-2xl font-extrabold text-text-primary">{students.length}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">In Progress</p>
            <p className="mt-1 font-mono text-2xl font-extrabold text-accent-cyan">
              {students.filter((s) => s.game_status !== 'submitted').length}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Completed</p>
            <p className="mt-1 font-mono text-2xl font-extrabold text-success">
              {students.filter((s) => s.game_status === 'submitted').length}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Max Score</p>
            <p className="mt-1 font-mono text-2xl font-extrabold text-warning">
              {monitoringData?.total_questions ?? 60} Marks
            </p>
          </Card>
        </div>

        {/* ── Student-Wise Live Progress Roster ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 pb-3">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-text-secondary">
              Student Progress ({students.length}) · Ordered by Batch Number
            </h2>
            <span className="text-xs text-text-muted">Live sync active</span>
          </CardHeader>

          <CardBody className="flex flex-col gap-3 p-4">
            {students.length === 0 && (
              <p className="py-8 text-center text-sm text-text-muted">
                No students have joined this match yet.
              </p>
            )}

            {students.map((student) => {
              const isExpanded = expandedStudents.has(student.user_id)
              const isSubmitted = student.game_status === 'submitted'
              const interruptionTone =
                student.interruption_count >= MAX_INTERRUPTIONS
                  ? 'danger'
                  : student.interruption_count > 0
                    ? 'warning'
                    : 'neutral'

              return (
                <div
                  key={student.user_id}
                  className="rounded-xl border border-border bg-surface/60 transition hover:border-border-strong overflow-hidden"
                >
                  {/* Student Main Row */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStudentExpand(student.user_id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') toggleStudentExpand(student.user_id)
                    }}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 cursor-pointer select-none"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised border border-border font-mono text-xs font-bold text-accent-cyan">
                        {student.batch_number ? student.batch_number.slice(-3) : 'ST'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-text-primary">
                            {student.batch_number ? `Student ${student.batch_number}` : student.display_name}
                          </p>
                          {student.batch_number && (
                            <span className="font-mono text-xs text-text-muted">({student.batch_number})</span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary">
                          <span className="font-semibold text-text-primary">{student.current_section_name}</span> ·{' '}
                          {student.completed_sections_count}/{student.total_sections} completed
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Score Badge */}
                      <div className="text-right">
                        <p className="font-mono text-sm font-extrabold text-text-primary">
                          {student.total_score} <span className="text-xs font-normal text-text-secondary">/ {student.max_score} Marks</span>
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {student.correct_answers} correct · {student.wrong_answers} wrong
                        </p>
                      </div>

                      <Badge tone={isSubmitted ? 'success' : 'cyan'}>
                        {isSubmitted ? 'Submitted' : student.current_section_status}
                      </Badge>

                      <Badge tone={interruptionTone}>
                        {student.interruption_count}/{MAX_INTERRUPTIONS} interrupts
                      </Badge>

                      {!isSubmitted && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setTarget(student)
                          }}
                        >
                          <UserX size={13} />
                          Remove
                        </Button>
                      )}

                      <span className="text-text-muted pl-1">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Section Breakdown & Details */}
                  {isExpanded && (
                    <div className="border-t border-border/80 bg-surface-raised/40 p-4 animate-fade-in">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
                        <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5 text-center">
                          <p className="text-[10px] uppercase font-bold text-text-muted">Correct</p>
                          <p className="font-mono text-base font-bold text-success flex items-center justify-center gap-1">
                            <CheckCircle2 size={13} />
                            {student.correct_answers}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5 text-center">
                          <p className="text-[10px] uppercase font-bold text-text-muted">Wrong</p>
                          <p className="font-mono text-base font-bold text-danger flex items-center justify-center gap-1">
                            <XCircle size={13} />
                            {student.wrong_answers}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5 text-center">
                          <p className="text-[10px] uppercase font-bold text-text-muted">Unanswered</p>
                          <p className="font-mono text-base font-bold text-text-muted flex items-center justify-center gap-1">
                            <HelpCircle size={13} />
                            {student.unanswered_questions}
                          </p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-surface/50 p-2.5 text-center">
                          <p className="text-[10px] uppercase font-bold text-text-muted">Completion Time</p>
                          <p className="font-mono text-base font-bold text-text-primary flex items-center justify-center gap-1">
                            <Clock size={13} />
                            {student.completion_time_seconds ? formatDuration(student.completion_time_seconds) : 'In Match'}
                          </p>
                        </div>
                      </div>

                      {/* Section by Section Progress */}
                      <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                        Section Breakdown
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {student.section_breakdown.map((sec, idx) => (
                          <div
                            key={sec.section_id}
                            className={clsx(
                              'flex items-center justify-between rounded-lg border px-3 py-2 text-xs',
                              sec.status === 'Submitted'
                                ? 'border-success/30 bg-success/5 text-text-primary'
                                : sec.status === 'In Progress'
                                  ? 'border-accent-purple/40 bg-accent-purple/10 text-text-primary'
                                  : 'border-border bg-surface/40 text-text-muted'
                            )}
                          >
                            <div>
                              <span className="font-bold">
                                Section {idx + 1}: {sec.name}
                              </span>
                              <span className="ml-1.5 opacity-70">({sec.status})</span>
                            </div>
                            <div className="font-mono font-bold">
                              {sec.status === 'Submitted' ? `${sec.score} / ${sec.total_questions} Marks` : '—'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </CardBody>
        </Card>

        {/* ── Question Analytics ── */}
        {analytics && analytics.length > 0 && (
          <Card>
            <CardBody className="flex flex-col gap-3 p-4">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-text-secondary">
                Question Difficulty
              </h2>
              <div className="flex flex-col gap-2">
                {analytics
                  .slice()
                  .sort(
                    (a, b) =>
                      (a.attempts > 0 ? a.correct_count / a.attempts : 0) -
                      (b.attempts > 0 ? b.correct_count / b.attempts : 0)
                  )
                  .map((q) => {
                    const pct = q.attempts > 0 ? Math.round((q.correct_count / q.attempts) * 100) : 0
                    return (
                      <div key={q.question_id} className="flex flex-col gap-1 rounded-lg border border-border bg-surface/60 px-3 py-2">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate text-text-secondary">
                            <span className="font-semibold text-text-primary">
                              {q.number} {q.direction.toUpperCase()}
                            </span>{' '}
                            · {q.clue}
                          </span>
                          <span className="shrink-0 font-mono font-bold text-text-primary">{pct}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
                          <div
                            className={`h-full rounded-full ${pct < 40 ? 'bg-danger' : pct < 70 ? 'bg-warning' : 'bg-success'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {/* ── Removal Modal ── */}
      <Modal
        open={Boolean(target)}
        onClose={() => (removing ? null : setTarget(null))}
        title="Remove this player?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmRemove} loading={removing}>
              Remove Player
            </Button>
          </>
        }
      >
        {target && (
          <p>
            This immediately submits <strong className="text-text-primary">{target.display_name}</strong>'s game with their current
            progress ({target.total_score} Marks) and they won't be able to continue playing. This can't be undone.
          </p>
        )}
      </Modal>
    </PageShell>
  )
}
