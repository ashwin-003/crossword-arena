import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { History as HistoryIcon, ChevronRight, Trash2, Swords, Loader2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  fetchMyHistory,
  fetchMyCreatedGames,
  deleteGame,
  type HistoryEntry,
  type CreatedGameEntry,
} from '@/services/gameService'
import { formatDate, formatDuration } from '@/utils/format'

const STATUS_TONE: Record<string, 'cyan' | 'purple' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  waiting: 'warning',
  starting: 'purple',
  active: 'danger',
  ended: 'success',
  cancelled: 'neutral',
}

export default function HistoryPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [createdGames, setCreatedGames] = useState<CreatedGameEntry[] | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      fetchMyHistory(profile.id),
      fetchMyCreatedGames(profile.id),
    ]).then(([hist, created]) => {
      setEntries(hist)
      setCreatedGames(created)
    })
  }, [profile])

  async function handleDeleteGame(e: React.MouseEvent, gameId: string, title: string) {
    e.preventDefault()
    e.stopPropagation()

    const confirmed = window.confirm(
      `Delete the match "${title}"? This cannot be undone and will delete all player scores and history for this match.`
    )
    if (!confirmed) return

    setDeletingId(gameId)
    const result = await deleteGame(gameId)
    setDeletingId(null)

    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to delete match', description: result.error })
      return
    }

    showToast({ variant: 'success', title: 'Match deleted successfully' })
    setCreatedGames((prev) => (prev ? prev.filter((g) => g.id !== gameId) : []))
  }

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
          Match History
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Matches you've played and matches you've created.</p>
      </div>

      {/* Section 1: Matches Played */}
      <section className="mb-12">
        <h2 className="mb-4 font-display text-base font-bold uppercase tracking-wider text-text-primary sm:text-lg">
          Matches You've Played
        </h2>

        {entries === null && <Spinner label="Loading played history…" />}

        {entries !== null && entries.length === 0 && (
          <EmptyState
            icon={HistoryIcon}
            title="No Matches Played Yet"
            description="Join a match with a 6-digit code to see your player results here."
          />
        )}

        {entries !== null && entries.length > 0 && (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <Link key={entry.id} to={`/game/${entry.game.game_code}/history`}>
                <Card className="transition hover:border-accent-cyan/40">
                  <CardBody className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-text-primary">
                        {entry.game.title}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {formatDate(entry.created_at)} · {entry.game.game_code}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      <div className="hidden text-right sm:block">
                        <p className="font-mono font-bold text-text-primary">{entry.score.toLocaleString()} pts</p>
                        <p className="text-xs text-text-muted">
                          {entry.solved_count}/{entry.total_questions} · {formatDuration(entry.completion_time_seconds)}
                        </p>
                      </div>
                      {entry.rank && <Badge tone={entry.rank === 1 ? 'warning' : 'neutral'}>#{entry.rank}</Badge>}
                      <ChevronRight size={16} className="text-text-muted" />
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Games Created */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-bold uppercase tracking-wider text-text-primary sm:text-lg">
            Games You've Created
          </h2>
          <Link
            to="/create-game"
            className="text-xs font-semibold text-accent-cyan hover:underline"
          >
            + Create New Match
          </Link>
        </div>

        {createdGames === null && <Spinner label="Loading created games…" />}

        {createdGames !== null && createdGames.length === 0 && (
          <EmptyState
            icon={Swords}
            title="No Created Matches"
            description="Matches you build and host will appear here so you can monitor or delete them."
          />
        )}

        {createdGames !== null && createdGames.length > 0 && (
          <div className="flex flex-col gap-3">
            {createdGames.map((game) => {
              const targetUrl = game.status === 'ended' ? `/game/${game.game_code}/results` : `/crossword/${game.game_code}/live`
              return (
                <Link key={game.id} to={targetUrl}>
                  <Card className="transition hover:border-accent-purple/40">
                    <CardBody className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-text-primary">
                          {game.title}
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {formatDate(game.created_at)} · Code:{' '}
                          <span className="font-mono font-semibold text-text-secondary">{game.game_code}</span>
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={STATUS_TONE[game.status] ?? 'neutral'}>
                          {game.status}
                        </Badge>

                        <button
                          type="button"
                          onClick={(e) => handleDeleteGame(e, game.id, game.title)}
                          disabled={deletingId === game.id}
                          aria-label={`Delete ${game.title}`}
                          title="Delete match"
                          className="rounded-lg border border-danger/30 p-2 text-text-muted transition hover:border-danger hover:bg-danger/10 hover:text-danger active:scale-95 disabled:opacity-50"
                        >
                          {deletingId === game.id ? (
                            <Loader2 size={15} className="animate-spin text-danger" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>

                        <ChevronRight size={16} className="text-text-muted" />
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </PageShell>
  )
}
