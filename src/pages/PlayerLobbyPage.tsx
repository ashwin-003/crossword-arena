import { useEffect, useState } from 'react'
import { Swords, KeyRound, History, ArrowRight, Target, Trophy, Percent, FileEdit, Trash2 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/LinkButton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchMyActiveGames,
  fetchMyHistory,
  fetchMyDrafts,
  deleteDraft,
  type ActiveGameEntry,
  type HistoryEntry,
  type GameDraft,
} from '@/services/gameService'
import { formatDate } from '@/utils/format'

export default function PlayerLobbyPage() {
  const { profile } = useAuth()
  const [activeGames, setActiveGames] = useState<ActiveGameEntry[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [drafts, setDrafts] = useState<GameDraft[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return
    Promise.all([
      fetchMyActiveGames(profile.id),
      fetchMyHistory(profile.id),
      fetchMyDrafts(profile.id),
    ]).then(([active, hist, myDrafts]) => {
      setActiveGames(active)
      setHistory(hist)
      setDrafts(myDrafts)
      setLoaded(true)
    })
  }, [profile])

  const stats = computeStats(history)

  return (
    <PageShell>
      <div className="mb-10 text-center sm:text-left">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Player Lobby</p>
        <h1 className="mt-1 font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
          Welcome Back, {profile?.name ?? '—'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Ready for your next match?</p>
      </div>

      <div className="mb-10 flex flex-col justify-center gap-3 sm:flex-row sm:justify-start">
        <LinkButton to="/create-game" size="lg">
          <Swords size={18} />
          Create Game
        </LinkButton>
        <LinkButton to="/join-game" variant="secondary" size="lg">
          <KeyRound size={18} />
          Join Game
        </LinkButton>
      </div>

      <div className="mb-10 grid grid-cols-3 gap-3">
        <StatCard icon={Trophy} label="Matches Played" value={String(stats.matchesPlayed)} />
        <StatCard icon={Target} label="Best Rank" value={stats.bestRank ? `#${stats.bestRank}` : '—'} />
        <StatCard icon={Percent} label="Avg Accuracy" value={stats.avgAccuracy !== null ? `${stats.avgAccuracy}%` : '—'} />
      </div>

      {activeGames.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-display text-xs font-bold uppercase tracking-widest text-text-secondary">Active Matches</h2>
          <div className="flex flex-col gap-2.5">
            {activeGames.map(({ game }) => (
              <LinkButton
                key={game.id}
                to={game.status === 'active' ? `/game/${game.game_code}/competition` : `/game/${game.game_code}/lobby`}
                variant="secondary"
                className="!justify-between !normal-case"
              >
                <span className="flex items-center gap-3">
                  <Badge tone={game.status === 'active' ? 'danger' : 'cyan'} pulse={game.status === 'active'}>
                    {game.status === 'active' ? 'Live' : 'Waiting'}
                  </Badge>
                  <span className="font-display text-sm font-bold normal-case tracking-normal text-text-primary">{game.title}</span>
                </span>
                <ArrowRight size={15} />
              </LinkButton>
            ))}
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-text-secondary">
              Draft Matches
            </h2>
            <Badge tone="purple">{drafts.length}</Badge>
          </div>
          <div className="flex flex-col gap-2.5">
            {drafts.map((draft) => (
              <div key={draft.id} className="flex items-center gap-2">
                <LinkButton
                  to={`/create-game/${draft.id}`}
                  variant="secondary"
                  className="!flex-1 !justify-between !normal-case"
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-left">
                    <div className="flex items-center gap-2">
                      <FileEdit size={14} className="shrink-0 text-accent-purple" />
                      <span className="truncate font-display text-sm font-bold text-text-primary">
                        {draft.title.trim() || 'Untitled draft'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <span>
                        {(draft.clues?.length ?? 0)} {(draft.clues?.length ?? 0) === 1 ? 'clue' : 'clues'}
                      </span>
                      <span>•</span>
                      <span>Updated {formatDate(draft.updated_at)}</span>
                    </div>
                  </div>
                  <ArrowRight size={15} className="ml-2 shrink-0" />
                </LinkButton>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Delete this draft?')) return
                    const { error } = await deleteDraft(draft.id)
                    if (error) {
                      alert('Failed to delete draft: ' + error.message)
                      return
                    }
                    setDrafts((prev) => prev.filter((d) => d.id !== draft.id))
                  }}
                  aria-label="Delete draft"
                  title="Delete draft"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-card-bg text-text-muted transition hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-text-secondary">Recent Matches</h2>
          <LinkButton to="/history" variant="ghost" size="sm">
            <History size={13} />
            View All
          </LinkButton>
        </div>

        {loaded && history.length === 0 && (
          <EmptyState icon={Swords} title="No Matches Yet" description="Create or join a match to get started." />
        )}

        <div className="flex flex-col gap-2.5">
          {history.slice(0, 5).map((entry) => (
            <Card key={entry.id}>
              <CardBody className="flex items-center justify-between py-3.5">
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold text-text-primary">{entry.game.title}</p>
                  <p className="text-xs text-text-muted">{formatDate(entry.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-text-primary">{entry.score.toLocaleString()}</span>
                  {entry.rank && <Badge tone={entry.rank === 1 ? 'warning' : 'neutral'}>#{entry.rank}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-1.5 py-5 text-center">
        <Icon size={16} className="text-accent-cyan" />
        <span className="font-mono text-xl font-extrabold text-text-primary sm:text-2xl">{value}</span>
        <span className="font-display text-[9px] font-semibold uppercase tracking-widest text-text-muted sm:text-[10px]">{label}</span>
      </CardBody>
    </Card>
  )
}

function computeStats(history: HistoryEntry[]) {
  const matchesPlayed = history.length
  const ranks = history.map((h) => h.rank).filter((r): r is number => r !== null)
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null
  const avgAccuracy = matchesPlayed > 0 ? Math.round((history.reduce((sum, h) => sum + h.accuracy, 0) / matchesPlayed) * 10) / 10 : null
  return { matchesPlayed, bestRank, avgAccuracy }
}
