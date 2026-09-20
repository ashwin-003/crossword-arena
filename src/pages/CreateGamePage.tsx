import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Wand2, Rocket, RotateCcw, Grid3x3, Save } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { QuestionBuilderSection } from '@/components/crossword/QuestionBuilder'
import { CsvImportButton } from '@/components/crossword/CsvImportButton'
import { GridPreview } from '@/components/crossword/GridPreview'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { useCrosswordBuilder } from '@/hooks/useCrosswordBuilder'
import { createGame, fetchDraftById, saveDraft, deleteDraft } from '@/services/gameService'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'

const TIME_LIMIT_PRESETS = [
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '20 min', seconds: 1200 },
]

export default function CreateGamePage() {
  const navigate = useNavigate()
  const { draftId } = useParams<{ draftId?: string }>()
  const { profile } = useAuth()
  const { showToast } = useToast()

  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId)
  const [title, setTitle] = useState('')
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(600)
  const [creating, setCreating] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId))
  const [createError, setCreateError] = useState<string | null>(null)

  const {
    acrossClues,
    downClues,
    addRow,
    removeRow,
    updateRow,
    importClues,
    allClues,
    validationErrors,
    generation,
    generating,
    generate,
    loadFromDraft,
  } = useCrosswordBuilder()

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    fetchDraftById(draftId)
      .then((draft) => {
        if (cancelled) return
        if (draft) {
          setTitle(draft.title)
          setTimeLimitSeconds(draft.time_limit_seconds)
          loadFromDraft(draft.clues)
        } else {
          showToast({ variant: 'danger', title: 'Draft not found' })
        }
        setLoadingDraft(false)
      })
      .catch(() => {
        if (cancelled) return
        showToast({ variant: 'danger', title: 'Failed to load draft' })
        setLoadingDraft(false)
      })

    return () => {
      cancelled = true
    }
  }, [draftId, loadFromDraft, showToast])

  async function handleSaveDraft() {
    if (!profile) return
    setSavingDraft(true)
    const clues = allClues
      .filter((c) => c.clue.trim() && c.answer.trim())
      .map((c) => ({ direction: c.direction, clue: c.clue.trim(), answer: c.answer.trim() }))
    const saved = await saveDraft({ id: currentDraftId, title: title.trim(), timeLimitSeconds, clues }, profile.id)
    setSavingDraft(false)
    if (saved) {
      setCurrentDraftId(saved.id)
      showToast({ variant: 'success', title: 'Draft saved' })
    } else {
      showToast({ variant: 'danger', title: 'Failed to save draft' })
    }
  }

  async function handleCreate() {
    if (!generation?.ok) return
    if (title.trim().length === 0) {
      setCreateError('Give your match a title.')
      return
    }

    setCreating(true)
    setCreateError(null)

    const clues = generation.crossword.words.map((w) => ({ direction: w.direction, clue: w.clue, answer: w.answer }))
    const result = await createGame({ title: title.trim(), timeLimitSeconds, clues })
    setCreating(false)

    if (!result.ok || !result.data) {
      setCreateError(result.error ?? 'Unable to create the match.')
      return
    }

    if (currentDraftId) {
      deleteDraft(currentDraftId)
    }

    showToast({ variant: 'success', title: 'Match created', description: `Game code ${result.data.gameCode}` })
    navigate(`/game/${result.data.gameCode}/lobby`)
  }

  if (draftId && loadingDraft) {
    return <FullScreenSpinner />
  }

  return (
    <PageShell>
      <div className="mb-8">
        <h1 className="font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
          Create Match
        </h1>
        <p className="mt-1 text-sm text-text-secondary">Build your crossword, preview the grid, and launch a match.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[24rem_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                Match Information
              </h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSaveDraft}
                loading={savingDraft}
              >
                <Save size={14} />
                Save Draft
              </Button>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <Input
                label="Match Title"
                placeholder="e.g. Crossword Clash"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <div className="flex flex-col gap-1.5">
                <label className="font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Time Limit
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIME_LIMIT_PRESETS.map((preset) => (
                    <button
                      key={preset.seconds}
                      type="button"
                      onClick={() => setTimeLimitSeconds(preset.seconds)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                        timeLimitSeconds === preset.seconds
                          ? 'border-accent-purple bg-accent-purple/15 text-accent-purple'
                          : 'border-border-strong text-text-secondary hover:border-accent-cyan/40 hover:text-text-primary'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  min={1}
                  max={180}
                  value={Math.round(timeLimitSeconds / 60)}
                  onChange={(e) => setTimeLimitSeconds(Math.max(1, Number(e.target.value) || 1) * 60)}
                  hint="Custom time in minutes (1–180)."
                  className="mt-1"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                Crossword Questions
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-6">
              <CsvImportButton onImport={importClues} />
              <QuestionBuilderSection
                direction="across"
                clues={acrossClues}
                onAdd={() => addRow('across')}
                onRemove={(id) => removeRow('across', id)}
                onUpdate={(id, patch) => updateRow('across', id, patch)}
              />
              <div className="h-px bg-border" />
              <QuestionBuilderSection
                direction="down"
                clues={downClues}
                onAdd={() => addRow('down')}
                onRemove={(id) => removeRow('down', id)}
                onUpdate={(id, patch) => updateRow('down', id, patch)}
              />

              {validationErrors.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                  {validationErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDraft}
                  loading={savingDraft}
                  className="w-1/3"
                >
                  <Save size={16} />
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={() => generate()}
                  loading={generating}
                  disabled={validationErrors.length > 0}
                  className="flex-1"
                >
                  <Wand2 size={16} />
                  Generate Grid
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="min-h-[28rem]">
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">Grid Preview</h2>
            {generation?.ok && (
              <Button type="button" variant="ghost" size="sm" onClick={() => generate()}>
                <RotateCcw size={14} />
                Regenerate
              </Button>
            )}
          </CardHeader>
          <CardBody>
            {!generation && (
              <EmptyState
                icon={Grid3x3}
                title="No Grid Yet"
                description="Fill in your across and down questions, then click Generate Grid to see a full preview here."
              />
            )}

            {generation?.ok === false && (
              <div className="rounded-xl border border-danger/40 bg-danger/5 p-5 text-center">
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-danger">
                  Unable to generate a valid crossword
                </p>
                <p className="mt-2 text-sm text-text-secondary">{generation.error.message}</p>
                {generation.error.conflictingAnswers && (
                  <p className="mt-2 text-xs text-text-muted">
                    Check: {generation.error.conflictingAnswers.join(', ')}
                  </p>
                )}
              </div>
            )}

            {generation?.ok && (
              <div className="flex flex-col gap-6">
                <GridPreview crossword={generation.crossword} />
                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  {createError && <p className="text-sm text-danger">{createError}</p>}
                  <Button type="button" onClick={handleCreate} loading={creating} className="sm:ml-auto">
                    <Rocket size={16} />
                    Create Game
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </PageShell>
  )
}
