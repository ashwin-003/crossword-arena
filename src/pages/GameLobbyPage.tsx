import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Check, Crown, Users, Loader2, Shield, Ban, LogOut, UserX } from 'lucide-react'
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
import { useGameParticipants } from '@/hooks/useGameParticipants'
import { useClipboard } from '@/hooks/useClipboard'
import { fetchGameByCode, joinGameByCode, startGame, cancelGame, leaveGame, disqualifyParticipant } from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import type { ParticipantWithUser } from '@/types/database'

export default function GameLobbyPage() {
  const { gameCode } = useParams<{ gameCode: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { showToast } = useToast()
  const { copied, copy } = useClipboard()

  const [joinState, setJoinState] = useState<'joining' | 'joined' | 'error'>('joining')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | undefined>(undefined)
  const [starting, setStarting] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [participantToRemove, setParticipantToRemove] = useState<ParticipantWithUser | null>(null)
  const [removingParticipant, setRemovingParticipant] = useState(false)
  const hadMeRef = useRef(false)
  const userInitiatedLeaveRef = useRef(false)

  useEffect(() => {
    if (!gameCode) return
    let cancelled = false
    ;(async () => {
      // Look up game first to check if user is the creator
      const gameRow = await fetchGameByCode(gameCode)
      if (cancelled) return
      if (!gameRow) {
        setJoinError('Invalid game code or match not found.')
        setJoinState('error')
        return
      }

      setGameId(gameRow.id)

      // Creator is host and spectator/monitor only — do not register as player
      if (profile?.id && gameRow.creator_id === profile.id) {
        setJoinState('joined')
        return
      }

      // Mentors do NOT join games using Game Codes or participate as players
      if (getUserRole() === 'mentor') {
        setJoinError('Mentors cannot join games as participants.')
        setJoinState('error')
        return
      }

      // Participants join as players
      const result = await joinGameByCode(gameCode)
      if (cancelled) return
      if (!result.ok || !result.data) {
        setJoinError(result.error ?? 'Unable to join this match.')
        setJoinState('error')
        return
      }
      setJoinState('joined')
    })()
    return () => {
      cancelled = true
    }
  }, [gameCode, profile?.id])

  const { game, connectionStatus } = useRealtimeGame(gameId)
  const { participants } = useGameParticipants(gameId, { announceJoins: true, currentUserId: profile?.id })

  const isCreator = game?.creator_id === profile?.id

  useEffect(() => {
    if (!game?.status || !gameCode) return

    if (isCreator) {
      if (game.status === 'active' || game.status === 'ended') {
        navigate(`/crossword/${gameCode}/live`, { replace: true })
      }
    } else {
      if (game.status === 'active') {
        try {
          if (typeof document.documentElement.requestFullscreen === 'function') {
            document.documentElement.requestFullscreen().catch(() => {})
          }
        } catch {}
        navigate(`/game/${gameCode}/competition`, { replace: true })
      } else if (game.status === 'ended') {
        navigate(`/game/${gameCode}/results`, { replace: true })
      }
    }
  }, [game?.status, gameCode, navigate, isCreator])

  // Removed-player detection: if the participant was in the lobby and then
  // disappeared while still waiting (and didn't initiate leave themselves),
  // notify them and navigate to dashboard.
  useEffect(() => {
    if (!profile?.id || isCreator || game?.status !== 'waiting') return
    const hasMe = participants.some((p) => p.user_id === profile.id)
    if (hasMe) {
      hadMeRef.current = true
      return
    }

    if (hadMeRef.current && !userInitiatedLeaveRef.current) {
      hadMeRef.current = false
      showToast({
        variant: 'danger',
        title: 'Removed from Match',
        description: 'You were removed from this match by the host.',
      })
      navigate('/join-game', { replace: true })
    }
  }, [participants, profile?.id, isCreator, game?.status, showToast, navigate])

  if (joinState === 'joining') {
    return <FullScreenSpinner label="Joining match…" />
  }

  if (joinState === 'error') {
    const fallbackPath = getUserRole() === 'mentor' ? '/mentor' : '/join-game'
    return (
      <PageShell className="flex items-center justify-center py-20">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <ErrorState title="Couldn't join this match" description={joinError ?? undefined} onRetry={() => navigate(fallbackPath)} />
          <Button variant="ghost" size="sm" onClick={() => navigate(fallbackPath)}>
            {getUserRole() === 'mentor' ? 'Back to Dashboard' : 'Back to Join Game'}
          </Button>
        </div>
      </PageShell>
    )
  }

  async function handleStart() {
    if (!gameId) return
    setStarting(true)
    const result = await startGame(gameId)
    setStarting(false)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to start match', description: result.error })
      return
    }
    showToast({ variant: 'success', title: 'Match started! Loading live monitor…' })
    navigate(`/crossword/${gameCode}/live`, { replace: true })
  }

  async function handleCancel() {
    if (!gameId) return
    setCancelling(true)
    const result = await cancelGame(gameId)
    setCancelling(false)
    setShowCancelConfirm(false)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to cancel match', description: result.error })
      return
    }
    showToast({ variant: 'info', title: 'Match cancelled' })
    navigate(isCreator ? '/mentor' : '/join-game', { replace: true })
  }

  async function handleLeave() {
    if (!gameId) return
    userInitiatedLeaveRef.current = true
    setLeaving(true)
    const result = await leaveGame(gameId)
    setLeaving(false)
    setShowLeaveConfirm(false)
    if (!result.ok) {
      userInitiatedLeaveRef.current = false
      showToast({ variant: 'danger', title: 'Unable to leave match', description: result.error })
      return
    }
    showToast({ variant: 'success', title: 'You left the match' })
    navigate('/join-game', { replace: true })
  }

  async function handleConfirmRemoveParticipant() {
    if (!gameId || !participantToRemove) return
    setRemovingParticipant(true)
    const target = participantToRemove
    const result = await disqualifyParticipant(gameId, target.user_id)
    setRemovingParticipant(false)
    setParticipantToRemove(null)
    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to remove player', description: result.error })
      return
    }
    showToast({ variant: 'success', title: `Removed ${target.user?.name ?? 'player'}` })
  }

  return (
    <PageShell className="flex justify-center py-10">
      <div className="w-full max-w-2xl animate-fade-in-up">
        <div className="mb-6 flex items-center justify-between">
          <Badge tone={isCreator ? 'cyan' : 'warning'} pulse>
            {isCreator ? 'Match Lobby' : 'WAITING FOR MENTOR'}
          </Badge>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>

        <Card>
          <CardHeader className="text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
              {isCreator ? 'Match Ready' : 'Game'}
            </p>
            <h1 className="mt-1 font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
              {game?.title ?? '—'}
            </h1>
            {!isCreator && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="font-display text-xs font-bold uppercase tracking-wider text-text-muted">
                  Status:
                </span>
                <Badge tone="warning" pulse>
                  WAITING TO START
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardBody className="flex flex-col items-center gap-6 py-8">
            <div className="flex flex-col items-center gap-2">
              <span className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Game Code</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-4xl font-extrabold tracking-[0.3em] text-gradient-brand">{gameCode}</span>
                <button
                  type="button"
                  onClick={() => copy(gameCode ?? '')}
                  aria-label="Copy game code"
                  className="rounded-lg border border-border-strong p-2.5 text-text-secondary transition hover:border-accent-cyan/50 hover:text-accent-cyan"
                >
                  {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {isCreator && (
              <div className="flex w-full items-center gap-3 rounded-xl border border-accent-purple/40 bg-accent-purple/10 p-3.5 text-left">
                <Shield size={20} className="shrink-0 text-accent-purple" />
                <div className="text-xs">
                  <p className="font-display font-bold uppercase tracking-wider text-accent-purple">Host / Spectator Mode</p>
                  <p className="text-text-secondary">You are the match host. You will monitor the live competition and leaderboard without solving.</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-text-secondary">
              <Users size={16} />
              <span className="font-display text-sm font-bold uppercase tracking-wide">
                {participants.length} {participants.length === 1 ? 'Player' : 'Players'} Joined
              </span>
            </div>

            <div className="flex w-full flex-col gap-2 rounded-xl border border-white/10 bg-surface/60 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset] p-3 transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.06]">
              {participants.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">
                  Waiting for players to join with code <span className="font-mono font-bold text-accent-cyan">{gameCode}</span>…
                </p>
              ) : (
                participants.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-raised font-display text-xs font-bold text-text-secondary">
                        {p.user?.name ? p.user.name.charAt(0).toUpperCase() : '?'}
                      </span>
                      <span className="text-sm font-medium text-text-primary">{p.user?.name ?? 'Player'}</span>
                      <span className="text-xs text-text-muted">{p.user?.class ?? ''}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.user_id === game?.creator_id && (
                        <Badge tone="purple">
                          <Crown size={11} />
                          Creator
                        </Badge>
                      )}
                      {isCreator && p.user_id !== game?.creator_id && (
                        <button
                          type="button"
                          onClick={() => setParticipantToRemove(p)}
                          title={`Remove ${p.user?.name ?? 'player'}`}
                          aria-label={`Remove ${p.user?.name ?? 'player'}`}
                          className="rounded p-1 text-text-muted transition hover:bg-danger/10 hover:text-danger"
                        >
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {isCreator ? (
              <div className="flex w-full flex-col gap-2.5">
                <Button type="button" size="lg" onClick={handleStart} loading={starting} fullWidth>
                  Start Match
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={starting}
                  fullWidth
                  className="text-danger hover:bg-danger/10"
                >
                  <Ban size={14} />
                  Cancel Match
                </Button>
              </div>
            ) : (
              <div className="flex w-full flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Loader2 size={16} className="animate-spin text-accent-cyan" />
                  <span className="text-sm font-medium text-text-primary">Waiting for mentor to start the match…</span>
                </div>
                <p className="text-center text-xs text-text-muted">
                  You will automatically enter the crossword competition screen as soon as the mentor starts.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLeaveConfirm(true)}
                  disabled={leaving}
                  fullWidth
                  className="mt-1 text-danger hover:bg-danger/10"
                >
                  <LogOut size={14} />
                  Leave Match
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={showCancelConfirm}
        onClose={() => (cancelling ? null : setShowCancelConfirm(false))}
        title="Cancel this match?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCancelConfirm(false)} disabled={cancelling}>
              Keep Match
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={cancelling}>
              Cancel Match
            </Button>
          </>
        }
      >
        <p>This cancels the match for everyone who joined. This can't be undone, and you'll need to create a new match to try again.</p>
      </Modal>

      <Modal
        open={showLeaveConfirm}
        onClose={() => (leaving ? null : setShowLeaveConfirm(false))}
        title="Leave this match?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLeaveConfirm(false)} disabled={leaving}>
              Stay
            </Button>
            <Button variant="danger" onClick={handleLeave} loading={leaving}>
              Leave Match
            </Button>
          </>
        }
      >
        <p>You can rejoin later with the game code if the host hasn't started it yet.</p>
      </Modal>

      <Modal
        open={Boolean(participantToRemove)}
        onClose={() => (removingParticipant ? null : setParticipantToRemove(null))}
        title={`Remove ${participantToRemove?.user?.name ?? 'player'} from this match?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setParticipantToRemove(null)} disabled={removingParticipant}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmRemoveParticipant} loading={removingParticipant}>
              Remove
            </Button>
          </>
        }
      >
        <p>
          This removes <strong className="text-text-primary">{participantToRemove?.user?.name ?? 'this player'}</strong> from the lobby. They can rejoin with the game code if the match hasn't started yet.
        </p>
      </Modal>
    </PageShell>
  )
}
