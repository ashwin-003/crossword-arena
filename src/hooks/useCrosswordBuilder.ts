import { useCallback, useMemo, useState } from 'react'
import type { DraftClue, CrosswordGenerationResult } from '@/types/crossword'
import type { ClueDirection } from '@/types/database'
import { generateCrossword } from '@/utils/crosswordGenerator'
import { isValidAnswer, normalizeAnswer } from '@/utils/answerFormat'

let idCounter = 0
function nextId() {
  idCounter += 1
  return `draft-${idCounter}-${Date.now()}`
}

export function emptyClue(direction: ClueDirection): DraftClue {
  return { localId: nextId(), direction, clue: '', answer: '' }
}

export function useCrosswordBuilder() {
  const [acrossClues, setAcrossClues] = useState<DraftClue[]>([emptyClue('across')])
  const [downClues, setDownClues] = useState<DraftClue[]>([emptyClue('down')])
  const [generation, setGeneration] = useState<CrosswordGenerationResult | null>(null)
  const [generating, setGenerating] = useState(false)

  const addRow = useCallback((direction: ClueDirection) => {
    if (direction === 'across') setAcrossClues((prev) => [...prev, emptyClue('across')])
    else setDownClues((prev) => [...prev, emptyClue('down')])
    setGeneration(null)
  }, [])

  const removeRow = useCallback((direction: ClueDirection, localId: string) => {
    if (direction === 'across') setAcrossClues((prev) => (prev.length > 1 ? prev.filter((c) => c.localId !== localId) : prev))
    else setDownClues((prev) => (prev.length > 1 ? prev.filter((c) => c.localId !== localId) : prev))
    setGeneration(null)
  }, [])

  const updateRow = useCallback((direction: ClueDirection, localId: string, patch: Partial<Pick<DraftClue, 'clue' | 'answer'>>) => {
    const updater = (prev: DraftClue[]) =>
      prev.map((c) => (c.localId === localId ? { ...c, ...patch, answer: patch.answer !== undefined ? patch.answer.toUpperCase() : c.answer } : c))
    if (direction === 'across') setAcrossClues(updater)
    else setDownClues(updater)
    setGeneration(null)
  }, [])

  const allClues = useMemo(() => [...acrossClues, ...downClues], [acrossClues, downClues])

  const validationErrors = useMemo(() => {
    const errors: string[] = []
    const filled = allClues.filter((c) => c.clue.trim().length > 0 || c.answer.trim().length > 0)
    if (filled.length === 0) errors.push('Add at least one clue.')
    for (const c of filled) {
      if (c.clue.trim().length === 0) errors.push(`Missing clue text for answer "${c.answer || '—'}".`)
      if (!isValidAnswer(c.answer)) errors.push(`"${c.answer || '—'}" must be letters only, 2–20 characters.`)
    }
    return errors
  }, [allClues])

  const generate = useCallback(() => {
    if (validationErrors.length > 0) return
    setGenerating(true)
    const filled = allClues
      .filter((c) => c.clue.trim().length > 0 && c.answer.trim().length > 0)
      .map((c) => ({ ...c, answer: normalizeAnswer(c.answer) }))
    // Synchronous but wrapped in a microtask so the "Generating…" button
    // state has a chance to paint for larger puzzles.
    const result = generateCrossword(filled)
    setGeneration(result)
    setGenerating(false)
    return result
  }, [allClues, validationErrors])

  const reset = useCallback(() => {
    setAcrossClues([emptyClue('across')])
    setDownClues([emptyClue('down')])
    setGeneration(null)
  }, [])

  const loadFromDraft = useCallback((clues?: { direction: ClueDirection; clue: string; answer: string }[]) => {
    const safeClues = Array.isArray(clues) ? clues : []
    const across = safeClues
      .filter((c) => c.direction === 'across')
      .map((c) => ({ localId: nextId(), direction: 'across' as const, clue: c.clue, answer: c.answer }))
    const down = safeClues
      .filter((c) => c.direction === 'down')
      .map((c) => ({ localId: nextId(), direction: 'down' as const, clue: c.clue, answer: c.answer }))
    setAcrossClues(across.length > 0 ? across : [emptyClue('across')])
    setDownClues(down.length > 0 ? down : [emptyClue('down')])
    setGeneration(null)
  }, [])

  const importClues = useCallback((rows: { direction: ClueDirection; clue: string; answer: string }[]) => {
    const across = rows
      .filter((r) => r.direction === 'across')
      .map((r) => ({ localId: nextId(), direction: 'across' as const, clue: r.clue, answer: r.answer }))
    const down = rows
      .filter((r) => r.direction === 'down')
      .map((r) => ({ localId: nextId(), direction: 'down' as const, clue: r.clue, answer: r.answer }))
    setAcrossClues(across.length > 0 ? across : [emptyClue('across')])
    setDownClues(down.length > 0 ? down : [emptyClue('down')])
    setGeneration(null)
  }, [])

  return {
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
    reset,
    loadFromDraft,
  }
}
