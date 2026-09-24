import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Users, Clock, Swords, FileEdit, Trash2, Loader2, Edit3 } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { LinkButton } from '@/components/ui/LinkButton'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import {
  fetchMyCreatedGames,
  fetchMyDrafts,
  deleteDraft,
  type CreatedGameEntry,
  type GameDraft,
} from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { formatDateTime } from '@/utils/format'

export default function MentorDashboardPage() {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [games, setGames] = useState<CreatedGameEntry[] | null>(null)
  const [drafts, setDrafts] = useState<GameDraft[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null)

  async function loadData() {
    if (!profile) return
    const [myGames, myDrafts] = await Promise.all([
      fetchMyCreatedGames(profile.id),
      fetchMyDrafts(profile.id),
    ])
    setGames(myGames)
    setDrafts(myDrafts)
    setLoading(false)
  }

  useEffect(() => {
    if (getUserRole() === 'student') {
      showToast({ variant: 'danger', title: 'Access Denied', description: 'Students cannot access the Mentor Dashboard.' })
      navigate('/join-game', { replace: true })
      return
    }
    loadData()
  }, [profile, navigate, showToast])

  async function handleDeleteDraft(e: React.MouseEvent, draftId: string, title: string) {
    e.preventDefault()
    e.stopPropagation()

    const confirmed = window.confirm(
      `Delete the draft "${title.trim() || 'Untitled Crossword'}"? This cannot be undone.`
    )
    if (!confirmed) return

    setDeletingDraftId(draftId)
    const result = await deleteDraft(draftId)
    setDeletingDraftId(null)

    if (!result.ok) {
      showToast({ variant: 'danger', title: 'Unable to delete draft', description: result.error })
      return
    }

    showToast({ variant: 'success', title: 'Draft deleted' })
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draftId) : []))
  }

  // Calculate overview statistics dynamically
  const totalGamesHosted = games?.length ?? 0
  const activeGames = games?.filter((g) => g.status === 'active' || g.status === 'starting') ?? []
  const activeMatchesCount = activeGames.length
  const totalParticipants = activeGames.reduce((sum, g) => sum + (g.participant_count ?? 0), 0)

  return (
    <PageShell>
      {/* 1. Main Welcome Section */}
      <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-display text-xs font-bold uppercase tracking-widest text-accent-cyan">
            MENTOR DASHBOARD
          </p>
          <h1 className="mt-1 font-heavy text-3xl uppercase tracking-tight text-outline text-text-primary sm:text-4xl">
            Welcome back, {profile?.name ?? 'Mentor'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary sm:text-base">
            Manage your crossword competitions
          </p>
        </div>

        {/* 2. Action: + CREATE GAME */}
        <div className="flex shrink-0">
          <LinkButton to="/create-game" size="lg" className="w-full sm:w-auto">
            <Plus size={18} />
            CREATE GAME
          </LinkButton>
        </div>
      </div>

      {/* 3. Overview Stat Cards */}
      <div className="mb-10 grid grid-cols-3 gap-3 sm:gap-4">
        <Link to="/mentor/games" className="block outline-none">
          <Card className="h-full transition hover:border-accent-purple/50 hover:bg-surface-elevated/50 active:scale-[0.98]">
            <CardBody className="flex flex-col items-center gap-1.5 py-5 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-purple/10 text-accent-purple">
                <Swords size={18} />
              </div>
              <span className="font-display text-[9px] font-bold uppercase tracking-widest text-text-muted sm:text-[11px]">
                TOTAL GAMES HOSTED
              </span>
              <span className="font-mono text-xl font-extrabold text-text-primary sm:text-3xl">
                {loading ? '—' : String(totalGamesHosted)}
              </span>
            </CardBody>
          </Card>
        </Link>

        <Link to="/mentor/participants" className="block outline-none">
          <Card className="h-full transition hover:border-accent-cyan/50 hover:bg-surface-elevated/50 active:scale-[0.98]">
            <CardBody className="flex flex-col items-center gap-1.5 py-5 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-cyan/10 text-accent-cyan">
                <Users size={18} />
              </div>
              <span className="font-display text-[9px] font-bold uppercase tracking-widest text-text-muted sm:text-[11px]">
                TOTAL PARTICIPANTS
              </span>
              <span className="font-mono text-xl font-extrabold text-text-primary sm:text-3xl">
                {loading ? '—' : String(totalParticipants)}
              </span>
            </CardBody>
          </Card>
        </Link>

        <Link to="/mentor/active-matches" className="block outline-none">
          <Card className="h-full transition hover:border-warning/50 hover:bg-surface-elevated/50 active:scale-[0.98]">
            <CardBody className="flex flex-col items-center gap-1.5 py-5 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Clock size={18} />
              </div>
              <span className="font-display text-[9px] font-bold uppercase tracking-widest text-text-muted sm:text-[11px]">
                ACTIVE MATCHES
              </span>
              <span className="font-mono text-xl font-extrabold text-text-primary sm:text-3xl">
                {loading ? '—' : String(activeMatchesCount)}
              </span>
            </CardBody>
          </Card>
        </Link>
      </div>

      {/* 4. Saved Drafts Section */}
      <section className="mb-10">
        <div className="mb-4">
          <h2 className="font-display text-base font-bold uppercase tracking-wider text-text-primary sm:text-lg">
            SAVED DRAFTS
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary sm:text-sm">
            Continue creating your unfinished crossword games.
          </p>
        </div>

        {drafts === null && <Spinner label="Loading saved drafts…" />}

        {drafts !== null && drafts.length === 0 && (
          <EmptyState
            icon={FileEdit}
            title="NO SAVED DRAFTS"
            description="Your unfinished crossword games will appear here."
          />
        )}

        {drafts !== null && drafts.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {drafts.map((draft) => {
              const questionCount = Array.isArray(draft.sections) && draft.sections.length > 0
                ? draft.sections.reduce((sum, s) => sum + (Array.isArray(s.clues) ? s.clues.length : 0), 0)
                : Array.isArray(draft.clues) ? draft.clues.length : 0
              const sectionCount = Array.isArray(draft.sections) && draft.sections.length > 0
                ? draft.sections.length
                : 0
              return (
                <Card
                  key={draft.id}
                  className="flex flex-col justify-between transition hover:border-accent-purple/50"
                >
                  <CardBody className="flex flex-col justify-between gap-4 p-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display text-[10px] font-bold uppercase tracking-widest text-accent-cyan">
                          SAVED DRAFT
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge tone="warning">
                            STATUS: DRAFT
                          </Badge>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteDraft(e, draft.id, draft.title)}
                            disabled={deletingDraftId === draft.id}
                            aria-label={`Delete draft ${draft.title || 'Untitled'}`}
                            title="Delete draft"
                            className="rounded-lg border border-danger/30 p-1.5 text-text-muted transition hover:border-danger hover:bg-danger/10 hover:text-danger active:scale-95 disabled:opacity-50"
                          >
                            {deletingDraftId === draft.id ? (
                              <Loader2 size={13} className="animate-spin text-danger" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <h3 className="line-clamp-1 font-display text-base font-bold uppercase tracking-wide text-text-primary">
                          {draft.title.trim() || 'Untitled Crossword'}
                        </h3>
                        <p className="mt-1 font-display text-xs font-semibold text-text-secondary">
                          {sectionCount > 0
                            ? `${sectionCount} ${sectionCount === 1 ? 'Section' : 'Sections'} · ${questionCount} ${questionCount === 1 ? 'Question' : 'Questions'}`
                            : `${questionCount} ${questionCount === 1 ? 'Question' : 'Questions'}`
                          }
                        </p>
                      </div>

                      <div className="border-t border-border pt-2 text-xs text-text-muted">
                        Last updated: <span className="font-mono text-text-secondary">{formatDateTime(draft.updated_at)}</span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <LinkButton
                        to={`/create-game/${draft.id}`}
                        variant="secondary"
                        size="sm"
                        className="w-full justify-center"
                      >
                        <Edit3 size={14} />
                        CONTINUE EDITING
                      </LinkButton>
                    </div>
                  </CardBody>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </PageShell>
  )
}
