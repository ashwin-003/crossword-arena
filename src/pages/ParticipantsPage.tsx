import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, ArrowLeft } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LinkButton } from '@/components/ui/LinkButton'
import { useAuth } from '@/contexts/AuthContext'
import { fetchMyCreatedGames } from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { supabase } from '@/lib/supabaseClient'
import { formatDate } from '@/utils/format'

type ParticipantDetails = {
  id: string
  user_id: string
  game_id: string
  status: string
  joined_at: string
  live_score: number
  display_name: string
  batch_number: string
  game_title?: string
}

export default function ParticipantsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isMentor = getUserRole() === 'mentor'
  const [participants, setParticipants] = useState<ParticipantDetails[] | null>(null)

  useEffect(() => {
    if (!profile) return
    if (!isMentor) {
      navigate('/join-game', { replace: true })
      return
    }

    async function loadParticipants() {
      try {
        const myGames = await fetchMyCreatedGames(profile!.id)
        const activeGames = myGames.filter(g => g.status === 'active' || g.status === 'starting')
        
        if (activeGames.length === 0) {
          setParticipants([])
          return
        }

        const gameIds = activeGames.map(g => g.id)
        const { data } = await supabase
          .from('participants_public')
          .select('id, user_id, game_id, status, joined_at, live_score, display_name, batch_number, games(title)')
          .in('game_id', gameIds)
          .order('joined_at', { ascending: false })

        if (data) {
          const mapped = data.map((p: any) => ({
            id: p.id,
            user_id: p.user_id,
            game_id: p.game_id,
            status: p.status,
            joined_at: p.joined_at,
            live_score: p.live_score,
            display_name: p.display_name,
            batch_number: p.batch_number,
            game_title: p.games?.title || 'Unknown Game',
          }))
          setParticipants(mapped)
        } else {
          setParticipants([])
        }
      } catch (err) {
        console.error('Error fetching participants:', err)
        setParticipants([])
      }
    }

    loadParticipants()
  }, [profile, isMentor, navigate])

  return (
    <PageShell>
      <div className="mb-8">
        <LinkButton to="/mentor" variant="ghost" size="sm" className="mb-4 -ml-2 text-text-muted">
          <ArrowLeft size={16} />
          BACK TO DASHBOARD
        </LinkButton>
        <p className="font-display text-xs font-bold uppercase tracking-widest text-accent-cyan">
          OVERVIEW
        </p>
        <h1 className="mt-1 font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
          Participants
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Students who have joined your crossword games.
        </p>
      </div>

      <section className="mb-10">
        {participants === null && <Spinner label="Loading participants…" />}

        {participants !== null && participants.length === 0 && (
          <EmptyState
            icon={Users}
            title="No Participants Yet"
            description="No one has joined your games."
          />
        )}

        {participants !== null && participants.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {participants.map((p) => (
              <Card key={`${p.id}-${p.user_id}`} className="transition hover:border-accent-cyan/50 hover:bg-surface-elevated/50">
                <CardBody className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm font-bold uppercase tracking-wide text-text-primary">
                        {p.display_name}
                      </p>
                      {p.batch_number && (
                        <p className="text-xs text-text-secondary">
                          Batch: <span className="font-mono">{p.batch_number}</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-bold text-accent-cyan">
                        {p.live_score} <span className="text-[10px] text-text-muted">PTS</span>
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-text-muted">
                    <span className="truncate">Game: {p.game_title}</span>
                    <span className="shrink-0">{formatDate(p.joined_at)}</span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}
