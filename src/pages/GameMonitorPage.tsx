import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, UserX } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { ConnectionStatusBadge } from '@/components/game/ConnectionStatusBadge'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useRealtimeGame } from '@/hooks/useRealtimeGame'
import { useGameParticipants } from '@/hooks/useGameParticipants'
import { fetchGameByCode, disqualifyParticipant, fetchQuestionAnalytics, type QuestionAnalyticsRow } from '@/services/gameService'
import type { GameRow, ParticipantWithUser } from '@/types/database'

const MAX_INTERRUPTIONS = 3

export default function GameMonitorPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [gameId, setGameId] = useState<string | undefined>(undefined)
  const [initialGame, setInitialGame] = useState<GameRow | null | undefined>(undefined)
  const [target, setTarget] = useState<ParticipantWithUser | null>(null)
  const [removing, setRemoving] = useState(false)
  const [analytics, setAnalytics] = useState<QuestionAnalyticsRow[] | null>(null)

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    ;(async () => {
      const g = await fetchGameByCode(gameCode)
      if (cancelled) return
      setInitialGame(g)
      if (g) setGameId(g.id)
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode])

  const { game, connectionStatus } = useRealtimeGame(gameId)
  const effectiveGame = game ?? initialGame ?? null
  const { participants } = useGameParticipants(gameId)

  const isCreator = Boolean(profile?.id && effectiveGame?.creator_id === profile.id)

  useEffect(() => {
    if (effectiveGame && profile && !isCreator) {
      navigate(`/game/${gameCode}/competition`, { replace: true })
    }
  }, [effectiveGame, profile, isCreator, gameCode, navigate])

  useEffect(() => {
    if (!gameId || effectiveGame?.status !== 'ended') return
    fetchQuestionAnalytics(gameId).then(setAnalytics)
  }, [gameId, effectiveGame?.status])

  if (initialGame === undefined) {
    return <FullScreenSpinner label="Loading match…" />
  }
  if (!effectiveGame) {
    return (
      <PageShell className="flex items-center justify-center py-20">
        <ErrorState title="Game not found" onRetry={() => navigate('/lobby')} />
      </PageShell>
    )
  }
  if (!isCreator) {
    return <FullScreenSpinner label="Redirecting…" />
  }

  const sorted = participants
    .slice()
    .sort((a, b) => b.live_score - a.live_score || b.live_solved_count - a.live_solved_count)

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
    showToast({ variant: 'success', title: 'Player removed', description: `${target.user.name}'s game has been submitted and they've been removed.` })
  }

  return (
    <PageShell className="py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            to={`/game/${gameCode}/competition`}
            className="flex items-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-text-primary"
          >
            <ArrowLeft size={15} />
            Back to Match
          </Link>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>

        <div className="flex items-center gap-3">
          <ShieldAlert size={22} className="text-accent-purple" />
          <div>
            <h1 className="font-display text-xl font-extrabold uppercase tracking-tight text-text-primary sm:text-2xl">
              Match Monitor
            </h1>
            <p className="text-sm text-text-secondary">{effectiveGame.title} · Creator view</p>
          </div>
        </div>

        <Card>
          <CardBody className="flex flex-col gap-2.5 p-4">
            {sorted.length === 0 && <p className="py-6 text-center text-sm text-text-muted">No participants yet.</p>}
            {sorted.map((p) => {
              const isSubmitted = p.status === 'submitted'
              const isSelf = p.user_id === profile?.id
              const interruptionTone = p.interruption_count >= MAX_INTERRUPTIONS ? 'danger' : p.interruption_count > 0 ? 'warning' : 'neutral'
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised font-display text-xs font-bold text-text-secondary">
                      {p.user.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {p.user.name} {isSelf && <span className="text-text-muted">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-text-muted">{p.user.class}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-text-primary">{p.live_score} pts</span>
                    <Badge tone={isSubmitted ? 'success' : 'cyan'}>{isSubmitted ? 'Submitted' : 'Playing'}</Badge>
                    <Badge tone={interruptionTone}>
                      {p.interruption_count}/{MAX_INTERRUPTIONS} interrupts
                    </Badge>
                    {!isSubmitted && !isSelf && (
                      <Button variant="danger" size="sm" onClick={() => setTarget(p)}>
                        <UserX size={14} />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardBody>
        </Card>

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
            This immediately submits <strong className="text-text-primary">{target.user.name}</strong>'s game with their current
            progress ({target.live_score} pts) and they won't be able to continue playing. This can't be undone.
          </p>
        )}
      </Modal>
    </PageShell>
  )
}
