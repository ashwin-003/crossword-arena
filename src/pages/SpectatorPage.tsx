import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { playFanfare } from '@/lib/sound'
import { Trophy, Users, Radio, ArrowLeft, Square, RotateCcw } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { ErrorState } from '@/components/ui/ErrorState'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useGameTimer } from '@/hooks/useGameTimer'
import { fetchGameByCode, fetchSpectatorSnapshot, stopGame, restartGame } from '@/services/gameService'
import type { SpectatorSnapshot } from '@/types/database'

const POLL_INTERVAL_MS = 2500

const STATUS_LABEL: Record<SpectatorSnapshot['status'], string> = {
  waiting: 'Waiting for Players',
  starting: 'Starting…',
  active: 'Live',
  ended: 'Match Complete',
  cancelled: 'Cancelled',
}

export default function SpectatorPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [snapshot, setSnapshot] = useState<SpectatorSnapshot | null | undefined>(undefined)
  const [resolvedGameId, setResolvedGameId] = useState<string | null>(null)
  const [resolvedCreatorId, setResolvedCreatorId] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false

    fetchGameByCode(gameCode).then((g) => {
      if (!cancelled && g) {
        setResolvedGameId(g.id)
        setResolvedCreatorId(g.creator_id)
      }
    })

    async function poll() {
      const data = await fetchSpectatorSnapshot(gameCode!)
      if (!cancelled) setSnapshot(data)
    }
    poll()
    const interval = window.setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [gameCode])

  const fanfarePlayedRef = useRef(false)
  useEffect(() => {
    if (snapshot?.status === 'ended' && !fanfarePlayedRef.current) {
      fanfarePlayedRef.current = true
      playFanfare()
    }
  }, [snapshot?.status])

  const timer = useGameTimer(snapshot?.status === 'active' ? snapshot.end_time : null)

  const isCreator = profile?.id && (profile.id === snapshot?.creator_id || profile.id === resolvedCreatorId)
  const canStop = Boolean(
    isCreator &&
    snapshot &&
    (snapshot.status === 'waiting' || snapshot.status === 'starting' || snapshot.status === 'active')
  )
  const canRestart = Boolean(
    isCreator &&
    snapshot &&
    (snapshot.status === 'ended' || snapshot.status === 'cancelled')
  )

  async function handleStop() {
    const targetId = snapshot?.game_id ?? resolvedGameId
    if (!targetId) return
    const confirmed = window.confirm('End this match now? This will finalize results for all players and cannot be undone.')
    if (!confirmed) return

    setStopping(true)
    const result = await stopGame(targetId)
    setStopping(false)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to stop match', description: result.error })
      return
    }
    showToast({
      variant: 'success',
      title: result.data?.status === 'cancelled' ? 'Match cancelled' : 'Match ended by host',
    })
    const refreshed = await fetchSpectatorSnapshot(gameCode!)
    if (refreshed) setSnapshot(refreshed)
  }

  async function handleRestart() {
    const targetId = snapshot?.game_id ?? resolvedGameId
    if (!targetId) return
    const confirmed = window.confirm(
      'Restart this match? All current scores and progress will be cleared. Players can rejoin with the same code.'
    )
    if (!confirmed) return

    setRestarting(true)
    const result = await restartGame(targetId)
    setRestarting(false)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to restart match', description: result.error })
      return
    }
    showToast({
      variant: 'success',
      title: 'Match restarted',
      description: 'The lobby has been reset for new players to join.',
    })
    navigate(`/game/${gameCode}/lobby`)
  }

  if (snapshot === undefined) return <FullScreenSpinner label="Loading match…" />
  if (!snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <ErrorState title="Invalid game code" description="No match found for this code." />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg bg-grid-pattern px-6 py-8 sm:px-12 sm:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Logo className="scale-110 sm:scale-125" />
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={snapshot.status === 'active' ? 'danger' : 'neutral'} pulse={snapshot.status === 'active'}>
              <Radio size={12} />
              {STATUS_LABEL[snapshot.status]}
            </Badge>

            {canStop && (
              <Button size="sm" variant="danger" onClick={handleStop} loading={stopping}>
                <Square size={13} className="fill-current" />
                {snapshot.status === 'active' ? 'Stop Match' : 'Cancel Match'}
              </Button>
            )}

            {canRestart && (
              <Button size="sm" variant="primary" onClick={handleRestart} loading={restarting}>
                <RotateCcw size={13} />
                Restart Match
              </Button>
            )}

            {isCreator && (
              <Link
                to={`/game/${gameCode}/monitor`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent-purple/50 bg-accent-purple/10 px-3 py-1.5 text-xs font-semibold text-accent-purple transition hover:bg-accent-purple/20"
              >
                <Users size={13} />
                Student Monitor
              </Link>
            )}

            <Link
              to={isCreator ? '/mentor' : '/join-game'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition hover:border-accent-cyan/50 hover:text-accent-cyan"
            >
              <ArrowLeft size={13} />
              {isCreator ? 'Dashboard' : 'Exit'}
            </Link>
          </div>
        </div>

        <div className="text-center">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-text-muted">{snapshot.game_code}</p>
          <h1 className="mt-2 font-heavy text-4xl uppercase tracking-tight text-outline text-text-primary sm:text-6xl">
            {snapshot.title}
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Card className="p-6 text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Time Remaining</p>
            <p className="mt-2 font-mono text-4xl font-extrabold text-text-primary sm:text-5xl">
              {snapshot.status === 'active' ? timer.formatted : '—'}
            </p>
          </Card>
          <Card className="p-6 text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
              <Users size={12} className="mr-1 inline" />
              Participants
            </p>
            <p className="mt-2 font-mono text-4xl font-extrabold text-text-primary sm:text-5xl">{snapshot.participant_count}</p>
          </Card>
          <Card className="p-6 text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Status</p>
            <p className="mt-2 font-heavy text-2xl uppercase text-outline text-text-primary sm:text-3xl">
              {STATUS_LABEL[snapshot.status]}
            </p>
          </Card>
        </div>

        {snapshot.status === 'ended' && snapshot.leaderboard.length > 0 && (
          <div className="rounded-2xl border-2 border-warning/50 bg-warning/5 p-6 text-center sm:p-8">
            <h2 className="font-heavy text-3xl uppercase text-outline text-warning sm:text-4xl">Congratulations!</h2>
            <p className="mt-1 text-sm text-text-secondary">Top 3 finishers of this match</p>
            <div className="mx-auto mt-5 flex max-w-xl flex-col gap-2.5">
              {snapshot.leaderboard.slice(0, 3).map((entry, i) => (
                <div
                  key={`${entry.rank}-${entry.name}`}
                  className={`flex items-center gap-3 rounded-lg border-2 px-4 py-3 ${
                    i === 0
                      ? 'border-warning/60 bg-warning/10'
                      : i === 1
                        ? 'border-text-secondary/40 bg-surface-raised'
                        : 'border-[#cd7f32]/50 bg-[#cd7f32]/10'
                  }`}
                >
                  <span className="text-2xl">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span className="flex-1 truncate text-left font-display text-lg font-bold text-text-primary">{entry.name}</span>
                  <span className="font-mono text-lg font-extrabold text-text-primary">{entry.score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Card className="flex-1 p-6 sm:p-8">
          <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-text-secondary">
            <Trophy size={16} className="text-accent-cyan" />
            Live Leaderboard
          </h2>
          <div className="flex flex-col gap-2">
            {snapshot.leaderboard.map((entry) => (
              <div
                key={`${entry.rank}-${entry.name}`}
                className="flex items-center gap-4 rounded-xl border border-white/5 bg-surface-raised/40 px-4 py-3 transition-colors duration-200 hover:border-white/15 hover:bg-white/[0.06]"
              >
                <span
                  className={`w-10 shrink-0 text-center font-mono text-xl font-extrabold ${
                    entry.rank === 1 ? 'text-warning' : entry.rank <= 3 ? 'text-accent-purple' : 'text-text-muted'
                  }`}
                >
                  {entry.rank}
                </span>
                <span className="flex-1 truncate font-display text-lg font-semibold text-text-primary">{entry.name}</span>
                <span className="font-mono text-sm text-text-muted">{entry.solved_count} solved</span>
                <span className="w-20 shrink-0 text-right font-mono text-xl font-extrabold text-text-primary">{entry.score}</span>
              </div>
            ))}
            {snapshot.leaderboard.length === 0 && (
              <p className="py-8 text-center text-text-muted">No scores yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
