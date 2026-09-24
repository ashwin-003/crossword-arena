import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Swords, ArrowLeft } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { LinkButton } from '@/components/ui/LinkButton'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyCreatedGames, type CreatedGameEntry } from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { formatDate } from '@/utils/format'

const STATUS_TONE: Record<string, 'cyan' | 'purple' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  waiting: 'warning',
  starting: 'purple',
  active: 'danger',
  ended: 'success',
  cancelled: 'neutral',
}

export default function GamesHostedPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isMentor = getUserRole() === 'mentor'
  const [createdGames, setCreatedGames] = useState<CreatedGameEntry[] | null>(null)

  useEffect(() => {
    if (!profile) return
    if (!isMentor) {
      navigate('/join-game', { replace: true })
      return
    }

    fetchMyCreatedGames(profile.id).then((created) => {
      setCreatedGames(created)
    })
  }, [profile, isMentor, navigate])

  return (
    <PageShell>
      <div className="mb-8">
        <LinkButton to="/mentor" variant="ghost" size="sm" className="mb-4 -ml-2 text-text-muted">
          <ArrowLeft size={16} />
          BACK TO DASHBOARD
        </LinkButton>
        <p className="font-display text-xs font-bold uppercase tracking-widest text-accent-purple">
          OVERVIEW
        </p>
        <h1 className="mt-1 font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
          Games Hosted
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          All crossword competitions you have created.
        </p>
      </div>

      <section className="mb-10">
        {createdGames === null && <Spinner label="Loading hosted games…" />}

        {createdGames !== null && createdGames.length === 0 && (
          <EmptyState
            icon={Swords}
            title="No Games Hosted"
            description="You have not created any games yet."
          />
        )}

        {createdGames !== null && createdGames.length > 0 && (
          <div className="flex flex-col gap-3">
            {createdGames.map((game) => {
              const targetUrl = `/game/${game.game_code}/monitor`
              return (
                <Link key={game.id} to={targetUrl} className="block outline-none">
                  <Card className="transition hover:border-accent-purple/50 hover:bg-surface-elevated/50 active:scale-[0.99]">
                    <CardBody className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-text-primary">
                          {game.title}
                        </p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          Created {formatDate(game.created_at)} · Code:{' '}
                          <span className="font-mono font-semibold text-text-secondary">{game.game_code}</span>
                          {game.participant_count !== undefined && (
                            <span> · {game.participant_count} {game.participant_count === 1 ? 'Participant' : 'Participants'}</span>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={STATUS_TONE[game.status] ?? 'neutral'}>
                          {game.status}
                        </Badge>
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
