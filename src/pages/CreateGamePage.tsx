import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Wand2, Rocket, RotateCcw, Grid3x3, Save, Plus, Trash2, Clock,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { QuestionBuilderSection } from '@/components/crossword/QuestionBuilder'
import { CsvImportButton } from '@/components/crossword/CsvImportButton'
import { GridPreview } from '@/components/crossword/GridPreview'
import { EmptyState } from '@/components/ui/EmptyState'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { emptyClue } from '@/hooks/useCrosswordBuilder'
import { createGame, fetchDraftById, saveDraft, deleteDraft } from '@/services/gameService'
import { getUserRole } from '@/services/authService'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import type { GameDraftSection } from '@/services/gameService'
import type { ClueDirection } from '@/types/database'
import type { CrosswordGenerationResult } from '@/types/crossword'

// ============================================================================
// Constants & Section ID Generator
// ============================================================================

const TIME_LIMIT_PRESETS = [
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '20 min', seconds: 1200 },
  { label: '30 min', seconds: 1800 },
]

let sectionIdCounter = 0
function nextSectionId() {
  sectionIdCounter += 1
  return `section-${sectionIdCounter}-${Date.now()}`
}

// ============================================================================
// Per-section state managed via an array of SectionState objects
// ============================================================================

interface SectionState {
  localId: string
  name: string
  timeLimitSeconds: number
  acrossClues: ReturnType<typeof emptyClue>[]
  downClues: ReturnType<typeof emptyClue>[]
  generation: CrosswordGenerationResult | null
  generating: boolean
  collapsed: boolean
}

function createEmptySection(position: number): SectionState {
  const letter = String.fromCharCode(65 + position)
  return {
    localId: nextSectionId(),
    name: `Section ${letter}`,
    timeLimitSeconds: 600,
    acrossClues: [emptyClue('across')],
    downClues: [emptyClue('down')],
    generation: null,
    generating: false,
    collapsed: false,
  }
}

// ============================================================================
// The page
// ============================================================================

export default function CreateGamePage() {
  const navigate = useNavigate()
  const { draftId } = useParams<{ draftId?: string }>()
  const { profile } = useAuth()
  const { showToast } = useToast()

  useEffect(() => {
    if (!profile) return
    if (getUserRole() !== 'mentor') {
      showToast({ variant: 'danger', title: 'Access Denied', description: 'Students cannot create games.' })
      navigate('/join-game', { replace: true })
    }
  }, [profile, navigate, showToast])

  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(draftId)
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<SectionState[]>([createEmptySection(0)])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId))
  const [createError, setCreateError] = useState<string | null>(null)

  // Set first section as active once loaded
  useEffect(() => {
    if (sections.length > 0 && !activeSectionId) {
      setActiveSectionId(sections[0].localId)
    }
  }, [sections, activeSectionId])

  // ── Draft loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!draftId) return
    let cancelled = false
    fetchDraftById(draftId)
      .then((draft) => {
        if (cancelled) return
        if (draft) {
          setTitle(draft.title)

          // Handle new multi-section draft format
          if (Array.isArray(draft.sections) && draft.sections.length > 0) {
            const loaded: SectionState[] = draft.sections.map((s) => {
              const across = (s.clues ?? [])
                .filter((c) => c.direction === 'across')
                .map((c) => ({ localId: nextSectionId(), direction: 'across' as ClueDirection, clue: c.clue, answer: c.answer }))
              const down = (s.clues ?? [])
                .filter((c) => c.direction === 'down')
                .map((c) => ({ localId: nextSectionId(), direction: 'down' as ClueDirection, clue: c.clue, answer: c.answer }))
              return {
                localId: s.localId || nextSectionId(),
                name: s.name,
                timeLimitSeconds: s.timeLimitSeconds ?? 600,
                acrossClues: across.length > 0 ? across : [emptyClue('across')],
                downClues: down.length > 0 ? down : [emptyClue('down')],
                generation: s.generatedGrid ? {
                  ok: true,
                  crossword: {
                    rows: s.generatedGrid.rows,
                    cols: s.generatedGrid.cols,
                    cellMask: s.generatedGrid.cellMask,
                    solutionGrid: Array.from({ length: s.generatedGrid.rows }, () => Array(s.generatedGrid!.cols).fill(null)),
                    words: s.generatedGrid.words.map((w, idx) => ({
                      localId: `draft-w-${idx}`,
                      direction: w.direction,
                      clue: w.clue,
                      answer: w.answer,
                      row: w.row,
                      col: w.col,
                      number: w.number,
                    })),
                  }
                } : null,
                generating: false,
                collapsed: false,
              }
            })
            setSections(loaded)
            setActiveSectionId(loaded[0]?.localId ?? null)
          } else if (Array.isArray(draft.clues) && draft.clues.length > 0) {
            // Migrate legacy single-section draft
            const across = draft.clues.filter((c) => c.direction === 'across')
              .map((c) => ({ localId: nextSectionId(), direction: 'across' as ClueDirection, clue: c.clue, answer: c.answer }))
            const down = draft.clues.filter((c) => c.direction === 'down')
              .map((c) => ({ localId: nextSectionId(), direction: 'down' as ClueDirection, clue: c.clue, answer: c.answer }))
            const s: SectionState = {
              localId: nextSectionId(),
              name: 'Section A',
              timeLimitSeconds: draft.time_limit_seconds ?? 600,
              acrossClues: across.length > 0 ? across : [emptyClue('across')],
              downClues: down.length > 0 ? down : [emptyClue('down')],
              generation: null,
              generating: false,
              collapsed: false,
            }
            setSections([s])
            setActiveSectionId(s.localId)
          }
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
    return () => { cancelled = true }
  }, [draftId, showToast])

  // ── Section management ─────────────────────────────────────────────────────

  function addSection() {
    const newSection = createEmptySection(sections.length)
    setSections((prev) => [...prev, newSection])
    setActiveSectionId(newSection.localId)
  }

  function removeSection(localId: string) {
    if (sections.length <= 1) {
      showToast({ variant: 'warning', title: 'Cannot remove', description: 'A game must have at least one section.' })
      return
    }
    setSections((prev) => {
      const next = prev.filter((s) => s.localId !== localId)
      return next
    })
    setActiveSectionId((prev) => {
      if (prev === localId) {
        const remaining = sections.filter((s) => s.localId !== localId)
        return remaining[0]?.localId ?? null
      }
      return prev
    })
  }

  function updateSection(localId: string, patch: Partial<Pick<SectionState, 'name' | 'timeLimitSeconds' | 'collapsed'>>) {
    setSections((prev) => prev.map((s) => s.localId === localId ? { ...s, ...patch } : s))
  }

  function updateSectionClues(
    localId: string,
    direction: ClueDirection,
    updater: (prev: ReturnType<typeof emptyClue>[]) => ReturnType<typeof emptyClue>[]
  ) {
    setSections((prev) => prev.map((s) => {
      if (s.localId !== localId) return s
      return {
        ...s,
        generation: null, // invalidate grid when clues change
        acrossClues: direction === 'across' ? updater(s.acrossClues) : s.acrossClues,
        downClues: direction === 'down' ? updater(s.downClues) : s.downClues,
      }
    }))
  }

  function addClueRow(localId: string, direction: ClueDirection) {
    updateSectionClues(localId, direction, (prev) => [...prev, emptyClue(direction)])
  }

  function removeClueRow(localId: string, direction: ClueDirection, clueLocalId: string) {
    updateSectionClues(localId, direction, (prev) =>
      prev.length > 1 ? prev.filter((c) => c.localId !== clueLocalId) : prev
    )
  }

  function updateClueRow(localId: string, direction: ClueDirection, clueLocalId: string, patch: { clue?: string; answer?: string }) {
    updateSectionClues(localId, direction, (prev) =>
      prev.map((c) => c.localId === clueLocalId
        ? { ...c, ...patch, answer: patch.answer !== undefined ? patch.answer.toUpperCase() : c.answer }
        : c
      )
    )
  }

  function importCluesForSection(localId: string, rows: { direction: ClueDirection; clue: string; answer: string }[]) {
    setSections((prev) => prev.map((s) => {
      if (s.localId !== localId) return s
      const across = rows.filter((r) => r.direction === 'across')
        .map((r) => ({ localId: nextSectionId(), direction: 'across' as ClueDirection, clue: r.clue, answer: r.answer }))
      const down = rows.filter((r) => r.direction === 'down')
        .map((r) => ({ localId: nextSectionId(), direction: 'down' as ClueDirection, clue: r.clue, answer: r.answer }))
      return {
        ...s,
        generation: null,
        acrossClues: across.length > 0 ? across : [emptyClue('across')],
        downClues: down.length > 0 ? down : [emptyClue('down')],
      }
    }))
  }

  // ── Grid generation ────────────────────────────────────────────────────────

  const { generateCrosswordSection } = useSectionGenerator()

  async function generateGridForSection(localId: string) {
    const section = sections.find((s) => s.localId === localId)
    if (!section) return

    // Validate
    const allClues = [...section.acrossClues, ...section.downClues]
    const filled = allClues.filter((c) => c.clue.trim() || c.answer.trim())
    if (filled.length === 0) {
      showToast({ variant: 'warning', title: 'No questions', description: 'Add questions before generating the grid.' })
      return
    }

    setSections((prev) => prev.map((s) => s.localId === localId ? { ...s, generating: true } : s))

    const result = await generateCrosswordSection(allClues)

    setSections((prev) => prev.map((s) => s.localId === localId ? { ...s, generating: false, generation: result } : s))
  }

  // ── Save Draft ─────────────────────────────────────────────────────────────

  async function handleSaveDraft() {
    if (!profile) return
    setSavingDraft(true)

    const draftSections: GameDraftSection[] = sections.map((s) => ({
      localId: s.localId,
      name: s.name,
      timeLimitSeconds: s.timeLimitSeconds,
      clues: [
        ...s.acrossClues.filter((c) => c.clue.trim() || c.answer.trim()).map((c) => ({
          direction: 'across' as const, clue: c.clue.trim(), answer: c.answer.trim(),
        })),
        ...s.downClues.filter((c) => c.clue.trim() || c.answer.trim()).map((c) => ({
          direction: 'down' as const, clue: c.clue.trim(), answer: c.answer.trim(),
        })),
      ],
      generatedGrid: s.generation?.ok ? {
        rows: s.generation.crossword.rows,
        cols: s.generation.crossword.cols,
        cellMask: s.generation.crossword.cellMask,
        words: s.generation.crossword.words.map((w) => ({
          direction: w.direction,
          clue: w.clue,
          answer: w.answer,
          row: w.row,
          col: w.col,
          number: w.number,
        })),
      } : undefined,
    }))

    const saved = await saveDraft({ id: currentDraftId, title: title.trim(), sections: draftSections }, profile.id)
    setSavingDraft(false)

    if (saved) {
      setCurrentDraftId(saved.id)
      if (!draftId) {
        navigate(`/create-game/${saved.id}`, { replace: true })
      }
      showToast({ variant: 'success', title: 'Draft saved' })
    } else {
      showToast({ variant: 'danger', title: 'Failed to save draft' })
    }
  }

  // ── Create Game ────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (title.trim().length === 0) {
      setCreateError('Give your game a title.')
      return
    }

    // Every section must have a generated grid
    const ungenerated = sections.filter((s) => !s.generation?.ok)
    if (ungenerated.length > 0) {
      setCreateError(`Generate the crossword grid for: ${ungenerated.map((s) => s.name).join(', ')}`)
      return
    }

    setCreating(true)
    setCreateError(null)

    const sectionInputs = sections.map((s) => {
      const gen = s.generation as {
        ok: true
        crossword: {
          rows: number
          cols: number
          cellMask: boolean[][]
          words: {
            direction: string
            clue: string
            answer: string
            row: number
            col: number
            number: number
          }[]
        }
      }
      return {
        name: s.name,
        timeLimitSeconds: s.timeLimitSeconds,
        grid: {
          rows: gen.crossword.rows,
          cols: gen.crossword.cols,
          cellMask: gen.crossword.cellMask,
          words: gen.crossword.words.map((w) => ({
            direction: w.direction as 'across' | 'down',
            clue: w.clue,
            answer: w.answer,
            row: w.row,
            col: w.col,
            number: w.number,
          })),
        },
        clues: gen.crossword.words.map((w) => ({
          direction: w.direction as 'across' | 'down',
          clue: w.clue,
          answer: w.answer,
        })),
      }
    })

    const result = await createGame({ title: title.trim(), sections: sectionInputs })
    setCreating(false)

    if (!result.ok || !result.data) {
      setCreateError(result.error ?? 'Unable to create the game.')
      return
    }

    if (currentDraftId) {
      deleteDraft(currentDraftId)
    }

    showToast({
      variant: 'success',
      title: 'Game created',
      description: `Game code ${result.data.gameCode} · ${result.data.sectionCount} section${result.data.sectionCount === 1 ? '' : 's'}`,
    })
    navigate(`/game/${result.data.gameCode}/lobby`)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (draftId && loadingDraft) {
    return <FullScreenSpinner />
  }

  const activeSection = sections.find((s) => s.localId === activeSectionId) ?? sections[0]

  return (
    <PageShell>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heavy text-2xl uppercase tracking-tight text-outline text-text-primary sm:text-3xl">
            {currentDraftId ? 'Edit Draft' : 'Create Game'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Build a multi-section crossword competition, preview each grid, and launch when ready.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleSaveDraft}
          loading={savingDraft}
        >
          <Save size={15} />
          Save Draft
        </Button>
      </div>

      <div className="flex flex-col gap-6">

        {/* ── Game Title ── */}
        <Card>
          <CardHeader>
            <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
              Game Information
            </h2>
          </CardHeader>
          <CardBody>
            <Input
              label="Game Title"
              placeholder="e.g. Crossword Challenge 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </CardBody>
        </Card>

        {/* ── Section Selector Tabs ── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sections.map((s) => (
            <button
              key={s.localId}
              type="button"
              onClick={() => setActiveSectionId(s.localId)}
              className={[
                'shrink-0 rounded-xl border-2 px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all',
                s.localId === activeSectionId
                  ? 'border-accent-purple bg-accent-purple/15 text-accent-purple'
                  : 'border-border-strong text-text-secondary hover:border-accent-cyan/40 hover:text-text-primary',
              ].join(' ')}
            >
              {s.name}
              {s.generation?.ok && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={addSection}
            className="flex shrink-0 items-center gap-1 rounded-xl border-2 border-dashed border-border-strong px-3 py-2 text-xs font-bold uppercase tracking-wide text-text-muted transition hover:border-accent-cyan/50 hover:text-accent-cyan"
          >
            <Plus size={13} />
            Add Section
          </button>
        </div>

        {/* ── Active Section Editor ── */}
        {activeSection && (
          <div key={activeSection.localId} className="grid grid-cols-1 gap-6 xl:grid-cols-[26rem_1fr]">
            {/* Left column: section config + questions */}
            <div className="flex flex-col gap-4">

              {/* Section config */}
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                    {activeSection.name}
                  </h2>
                  {sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSection(activeSection.localId)}
                      className="rounded-lg p-1.5 text-text-muted transition hover:bg-danger/10 hover:text-danger"
                      title="Remove this section"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <Input
                    label="Section Name"
                    placeholder="e.g. Section A"
                    value={activeSection.name}
                    onChange={(e) => updateSection(activeSection.localId, { name: e.target.value })}
                    maxLength={80}
                  />

                  {/* Section Time Limit */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      <Clock size={11} className="mr-1 inline" />
                      Time Limit
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {TIME_LIMIT_PRESETS.map((preset) => (
                        <button
                          key={preset.seconds}
                          type="button"
                          onClick={() => updateSection(activeSection.localId, { timeLimitSeconds: preset.seconds })}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                            activeSection.timeLimitSeconds === preset.seconds
                              ? 'border-accent-purple bg-accent-purple/15 text-accent-purple shadow-[0_0_10px_rgba(168,85,247,0.2)]'
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
                      value={Math.round(activeSection.timeLimitSeconds / 60)}
                      onChange={(e) =>
                        updateSection(activeSection.localId, {
                          timeLimitSeconds: Math.max(1, Number(e.target.value) || 1) * 60,
                        })
                      }
                      hint="Custom time in minutes."
                      className="mt-1"
                    />
                  </div>
                </CardBody>
              </Card>

              {/* Questions */}
              <Card>
                <CardHeader>
                  <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                    Questions — {activeSection.name}
                  </h2>
                </CardHeader>
                <CardBody className="flex flex-col gap-6">
                  <CsvImportButton
                    onImport={(rows) => importCluesForSection(activeSection.localId, rows)}
                  />

                  <QuestionBuilderSection
                    direction="across"
                    clues={activeSection.acrossClues}
                    onAdd={() => addClueRow(activeSection.localId, 'across')}
                    onRemove={(id) => removeClueRow(activeSection.localId, 'across', id)}
                    onUpdate={(id, patch) => updateClueRow(activeSection.localId, 'across', id, patch)}
                  />
                  <div className="h-px bg-border" />
                  <QuestionBuilderSection
                    direction="down"
                    clues={activeSection.downClues}
                    onAdd={() => addClueRow(activeSection.localId, 'down')}
                    onRemove={(id) => removeClueRow(activeSection.localId, 'down', id)}
                    onUpdate={(id, patch) => updateClueRow(activeSection.localId, 'down', id, patch)}
                  />

                  <Button
                    type="button"
                    onClick={() => generateGridForSection(activeSection.localId)}
                    loading={activeSection.generating}
                    className="w-full"
                  >
                    <Wand2 size={16} />
                    Generate Grid — {activeSection.name}
                  </Button>
                </CardBody>
              </Card>
            </div>

            {/* Right column: grid preview */}
            <Card className="min-h-[24rem]">
              <CardHeader className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold uppercase tracking-widest text-text-primary">
                  Grid Preview — {activeSection.name}
                </h2>
                {activeSection.generation?.ok && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => generateGridForSection(activeSection.localId)}
                  >
                    <RotateCcw size={14} />
                    Regenerate
                  </Button>
                )}
              </CardHeader>
              <CardBody>
                {!activeSection.generation && (
                  <EmptyState
                    icon={Grid3x3}
                    title="No Grid Yet"
                    description={`Fill in questions for ${activeSection.name}, then click Generate Grid.`}
                  />
                )}

                {activeSection.generation?.ok === false && (
                  <div className="rounded-xl border border-danger/40 bg-danger/5 p-5 text-center">
                    <p className="font-display text-sm font-semibold uppercase tracking-wide text-danger">
                      Unable to generate a valid crossword
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      {activeSection.generation.error.message}
                    </p>
                    {activeSection.generation.error.conflictingAnswers && (
                      <p className="mt-2 text-xs text-text-muted">
                        Check: {activeSection.generation.error.conflictingAnswers.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                {activeSection.generation?.ok && (
                  <GridPreview crossword={activeSection.generation.crossword} />
                )}
              </CardBody>
            </Card>
          </div>
        )}

        {/* ── Create Game Button ── */}
        <Card>
          <CardBody className="flex flex-col gap-3">
            {createError && <p className="text-sm text-danger">{createError}</p>}

            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{sections.length}</span> section{sections.length !== 1 ? 's' : ''} ·{' '}
                <span className="font-semibold text-text-primary">
                  {sections.filter((s) => s.generation?.ok).length}
                </span>{' '}
                grid{sections.filter((s) => s.generation?.ok).length !== 1 ? 's' : ''} ready
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSaveDraft}
                  loading={savingDraft}
                >
                  <Save size={15} />
                  Save Draft
                </Button>
                <Button
                  type="button"
                  onClick={handleCreate}
                  loading={creating}
                  disabled={sections.some((s) => !s.generation?.ok)}
                >
                  <Rocket size={16} />
                  Create Game
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

      </div>
    </PageShell>
  )
}

// ============================================================================
// Tiny hook to run generateCrossword in a microtask without coupling to
// the per-section state (which would cause stale closure issues)
// ============================================================================
function useSectionGenerator() {
  const { generateCrossword } = useAsyncCrosswordGenerator()
  return { generateCrosswordSection: generateCrossword }
}

function useAsyncCrosswordGenerator() {
  const generateCrossword = useCallback(
    async (clues: { localId: string; direction: ClueDirection; clue: string; answer: string }[]) => {
      const { generateCrossword: gen } = await import('@/utils/crosswordGenerator')
      const { normalizeAnswer, isValidAnswer } = await import('@/utils/answerFormat')

      const filled = clues
        .filter((c) => c.clue.trim().length > 0 && c.answer.trim().length > 0)
        .filter((c) => isValidAnswer(c.answer))
        .map((c) => ({ ...c, answer: normalizeAnswer(c.answer) }))

      if (filled.length === 0) {
        return { ok: false as const, error: { message: 'Add at least one valid clue and answer.' } }
      }

      return gen(filled)
    },
    []
  )
  return { generateCrossword }
}
