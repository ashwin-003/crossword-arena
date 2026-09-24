import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestionPublicRow, GridLayout, ClueDirection } from '@/types/database'
import type { CellPosition, ClueEntry } from '@/types/crossword'
import { buildGridIndex, cellKey, emptyGridFromLayout, isWordComplete, toClueEntry, wordCells, wordText } from '@/utils/crosswordPlay'
import { checkWordAnswer, fetchMyAnswers, upsertAnswerDraft } from '@/services/gameService'
import { playCorrect } from '@/lib/sound'

export type SaveStatus = 'idle' | 'saving' | 'saved'

const AUTOSAVE_DEBOUNCE_MS = 600

export function useCrosswordPlay({
  gameId,
  userId,
  questions,
  gridLayout,
  active,
}: {
  gameId: string | undefined
  userId: string | undefined
  questions: QuestionPublicRow[]
  gridLayout: Pick<GridLayout, 'rows' | 'cols' | 'cellMask'>
  active: boolean
}) {
  const clues = useMemo(() => questions.map(toClueEntry), [questions])
  const { cellToClues, numberAt } = useMemo(() => buildGridIndex(clues), [clues])
  const cluesById = useMemo(() => new Map(clues.map((c) => [c.id, c])), [clues])

  const firstPlayable = useMemo<CellPosition>(() => {
    for (let r = 0; r < gridLayout.rows; r++) {
      for (let c = 0; c < gridLayout.cols; c++) {
        if (gridLayout.cellMask[r]?.[c]) return { row: r, col: c }
      }
    }
    return { row: 0, col: 0 }
  }, [gridLayout])

  const [grid, setGrid] = useState<Map<string, string>>(() => emptyGridFromLayout(gridLayout))
  const [correctness, setCorrectness] = useState<Map<string, boolean>>(new Map())
  const [selected, setSelected] = useState<CellPosition>(firstPlayable)
  const [direction, setDirection] = useState<ClueDirection>('across')
  const [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const saveTimers = useRef<Map<string, number>>(new Map())

  const loadProgress = useCallback(async () => {
    if (!gameId || !userId) return
    const savedAnswers = await fetchMyAnswers(gameId, userId)
    const next = emptyGridFromLayout(gridLayout)
    const nextCorrectness = new Map<string, boolean>()

    for (const a of savedAnswers) {
      const clue = cluesById.get(a.question_id)
      if (!clue) continue
      const cells = wordCells(clue)
      for (let i = 0; i < cells.length; i++) {
        const ch = a.answer[i]
        if (ch) next.set(cellKey(cells[i].row, cells[i].col), ch)
      }
      if (a.is_correct !== null) nextCorrectness.set(a.question_id, a.is_correct)
    }

    setGrid(next)
    setCorrectness(nextCorrectness)
    setLoaded(true)
  }, [gameId, userId, gridLayout, cluesById])

  useEffect(() => {
    if (active && clues.length > 0) loadProgress()
  }, [active, clues.length, loadProgress])

  useEffect(() => {
    setSelected(firstPlayable)
  }, [firstPlayable])

  function activeClueAt(row: number, col: number, dir: ClueDirection): ClueEntry | undefined {
    const entry = cellToClues.get(cellKey(row, col))
    if (!entry) return undefined
    return entry[dir] ?? entry.across ?? entry.down
  }

  const currentClue = activeClueAt(selected.row, selected.col, direction)

  function flushSave(questionId: string, text: string) {
    const existing = saveTimers.current.get(questionId)
    if (existing) window.clearTimeout(existing)
    saveTimers.current.delete(questionId)
    setSaveStatus('saving')
    upsertAnswerDraft(gameId!, userId!, questionId, text).then(() => setSaveStatus('saved'))
  }

  function scheduleSave(questionId: string, text: string) {
    const existing = saveTimers.current.get(questionId)
    if (existing) window.clearTimeout(existing)
    setSaveStatus('saving')
    const handle = window.setTimeout(() => {
      upsertAnswerDraft(gameId!, userId!, questionId, text).then(() => setSaveStatus('saved'))
    }, AUTOSAVE_DEBOUNCE_MS)
    saveTimers.current.set(questionId, handle)
  }

  async function maybeCheckWord(clue: ClueEntry, gridSnapshot: Map<string, string>) {
    if (!isWordComplete(gridSnapshot, clue) || !gameId) return
    const text = wordText(gridSnapshot, clue)
    flushSave(clue.id, text)
    const { data } = await checkWordAnswer(gameId, clue.id, text, userId)
    const row = Array.isArray(data) ? data[0] : data
    if (row && typeof row.is_correct === 'boolean') {
      setCorrectness((prev) => {
        const next = new Map(prev)
        next.set(clue.id, row.is_correct)
        return next
      })
      if (row.is_correct) playCorrect()
    }
  }

  function moveWithinWord(clue: ClueEntry, from: CellPosition, delta: 1 | -1): CellPosition {
    const cells = wordCells(clue)
    const idx = cells.findIndex((c) => c.row === from.row && c.col === from.col)
    const nextIdx = idx + delta
    if (nextIdx < 0 || nextIdx >= cells.length) return from
    return cells[nextIdx]
  }

  const setLetter = useCallback(
    (row: number, col: number, letter: string) => {
      if (!active || !gridLayout.cellMask[row]?.[col]) return
      const clue = activeClueAt(row, col, direction)
      if (!clue) return

      setGrid((prev) => {
        const next = new Map(prev)
        next.set(cellKey(row, col), letter)
        scheduleSave(clue.id, wordText(next, clue))
        maybeCheckWord(clue, next)
        return next
      })

      if (letter) {
        const moved = moveWithinWord(clue, { row, col }, 1)
        setSelected(moved)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, direction, gridLayout, cellToClues]
  )

  const handleBackspace = useCallback(() => {
    if (!active) return
    const { row, col } = selected
    const clue = activeClueAt(row, col, direction)
    if (!clue) return
    const currentValue = grid.get(cellKey(row, col)) ?? ''

    if (currentValue) {
      setGrid((prev) => {
        const next = new Map(prev)
        next.set(cellKey(row, col), '')
        scheduleSave(clue.id, wordText(next, clue))
        return next
      })
    } else {
      const moved = moveWithinWord(clue, { row, col }, -1)
      setSelected(moved)
      setGrid((prev) => {
        const next = new Map(prev)
        next.set(cellKey(moved.row, moved.col), '')
        scheduleSave(clue.id, wordText(next, clue))
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selected, direction, grid, cellToClues])

  const moveSelection = useCallback(
    (dRow: number, dCol: number) => {
      let { row, col } = selected
      for (let i = 0; i < Math.max(gridLayout.rows, gridLayout.cols); i++) {
        row += dRow
        col += dCol
        if (row < 0 || row >= gridLayout.rows || col < 0 || col >= gridLayout.cols) return
        if (gridLayout.cellMask[row]?.[col]) {
          setSelected({ row, col })
          if (dRow !== 0) setDirection('down')
          if (dCol !== 0) setDirection('across')
          return
        }
      }
    },
    [selected, gridLayout]
  )

  const selectCell = useCallback(
    (row: number, col: number) => {
      if (!gridLayout.cellMask[row]?.[col]) return
      const entry = cellToClues.get(cellKey(row, col))
      if (!entry) return
      if (row === selected.row && col === selected.col) {
        // Toggle direction if the cell participates in both an across and a down word.
        if (entry.across && entry.down) {
          setDirection((d) => (d === 'across' ? 'down' : 'across'))
        }
      } else {
        setSelected({ row, col })
        if (!entry[direction]) {
          setDirection(entry.across ? 'across' : 'down')
        }
      }
    },
    [cellToClues, selected, direction, gridLayout]
  )

  const orderedClues = useMemo(
    () => [...clues].sort((a, b) => a.number - b.number || (a.direction > b.direction ? 1 : -1)),
    [clues]
  )

  const jumpToClue = useCallback((clue: ClueEntry) => {
    setSelected({ row: clue.row, col: clue.col })
    setDirection(clue.direction)
  }, [])

  const jumpRelative = useCallback(
    (delta: 1 | -1) => {
      if (!currentClue || orderedClues.length === 0) return
      const idx = orderedClues.findIndex((c) => c.id === currentClue.id)
      const nextIdx = (idx + delta + orderedClues.length) % orderedClues.length
      jumpToClue(orderedClues[nextIdx])
    },
    [currentClue, orderedClues, jumpToClue]
  )

  useEffect(() => {
    // Unmount-only cleanup: deliberately reads saveTimers.current at
    // cleanup time (not effect-setup time) since it's a plain mutable Map
    // this hook owns, not a DOM ref — timers scheduled throughout the
    // component's life need to be cleared, not just ones present at mount.
    return () => {
      for (const handle of saveTimers.current.values()) window.clearTimeout(handle)
    }
  }, [])

  const solvedCount = useMemo(() => [...correctness.values()].filter(Boolean).length, [correctness])

  return {
    grid,
    correctness,
    selected,
    direction,
    clues: orderedClues,
    cellToClues,
    numberAt,
    currentClue,
    loaded,
    saveStatus,
    solvedCount,
    totalQuestions: clues.length,
    setLetter,
    handleBackspace,
    moveSelection,
    selectCell,
    jumpToClue,
    jumpRelative,
    setDirection,
    reload: loadProgress,
  }
}
