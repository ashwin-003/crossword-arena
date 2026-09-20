import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import clsx from 'clsx'
import type { GridLayout, ClueDirection } from '@/types/database'
import type { CellPosition } from '@/types/crossword'
import { cellKey } from '@/utils/crosswordPlay'

export interface CrosswordGridHandle {
  focus: () => void
}

interface CrosswordGridProps {
  gridLayout: Pick<GridLayout, 'rows' | 'cols' | 'cellMask'>
  grid: Map<string, string>
  numberAt: Map<string, number>
  cellToClues: Map<string, { across?: { id: string }; down?: { id: string } }>
  correctness: Map<string, boolean>
  selected: CellPosition
  direction: ClueDirection
  currentWordCells: Set<string>
  onSelect: (row: number, col: number) => void
  onLetter: (row: number, col: number, letter: string) => void
  onBackspace: () => void
  onArrow: (dRow: number, dCol: number) => void
  onTab: (shift: boolean) => void
  onEnter: () => void
  disabled?: boolean
}

export const CrosswordGrid = forwardRef<CrosswordGridHandle, CrosswordGridProps>(function CrosswordGrid(
  {
    gridLayout,
    grid,
    numberAt,
    cellToClues: _cellToClues,
    correctness: _correctness,
    selected,
    currentWordCells,
    onSelect,
    onLetter,
    onBackspace,
    onArrow,
    onTab,
    onEnter,
    disabled = false,
  },
  ref
) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hiddenInputRef = useRef<HTMLInputElement>(null)
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  function focusInput() {
    if (disabled) return
    if (hiddenInputRef.current) {
      hiddenInputRef.current.value = ' '
      try {
        hiddenInputRef.current.focus({ preventScroll: true })
      } catch {
        hiddenInputRef.current.focus()
      }
    }
  }

  useImperativeHandle(ref, () => ({
    focus: focusInput,
  }))

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Auto-scroll the scroll container so the active cell is always in comfortable view
  useEffect(() => {
    const key = cellKey(selected.row, selected.col)
    const cellEl = cellRefs.current.get(key)
    const container = scrollContainerRef.current
    if (cellEl && container) {
      const cellRect = cellEl.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (cellRect.left < containerRect.left + 24) {
        container.scrollLeft -= (containerRect.left + 24 - cellRect.left) + 16
      } else if (cellRect.right > containerRect.right - 24) {
        container.scrollLeft += (cellRect.right - (containerRect.right - 24)) + 16
      }

      if (cellRect.top < containerRect.top + 24) {
        container.scrollTop -= (containerRect.top + 24 - cellRect.top) + 16
      } else if (cellRect.bottom > containerRect.bottom - 24) {
        container.scrollTop += (cellRect.bottom - (containerRect.bottom - 24)) + 16
      }
    }
  }, [selected.row, selected.col])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return
    const { row, col } = selected
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault()
      onLetter(row, col, e.key.toUpperCase())
      return
    }
    switch (e.key) {
      case 'Backspace':
        e.preventDefault()
        onBackspace()
        break
      case 'ArrowUp':
        e.preventDefault()
        onArrow(-1, 0)
        break
      case 'ArrowDown':
        e.preventDefault()
        onArrow(1, 0)
        break
      case 'ArrowLeft':
        e.preventDefault()
        onArrow(0, -1)
        break
      case 'ArrowRight':
        e.preventDefault()
        onArrow(0, 1)
        break
      case 'Tab':
        e.preventDefault()
        onTab(e.shiftKey)
        break
      case 'Enter':
        e.preventDefault()
        onEnter()
        break
      case 'Delete':
        e.preventDefault()
        onLetter(row, col, '')
        break
      default:
        break
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (disabled) return
    const val = e.target.value
    if (!val) {
      onBackspace()
      e.target.value = ' '
      return
    }
    const char = val.slice(-1)
    if (/^[a-zA-Z]$/.test(char)) {
      onLetter(selected.row, selected.col, char.toUpperCase())
    }
    e.target.value = ' '
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      onBackspace()
      if (hiddenInputRef.current) hiddenInputRef.current.value = ' '
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onTab(e.shiftKey)
    } else if (e.key.startsWith('Arrow')) {
      handleKeyDown(e)
    }
  }

  const cellSize = gridLayout.cols > 18 ? 'clamp(1.1rem, 3.2vw, 2.1rem)' : gridLayout.cols > 12 ? 'clamp(1.4rem, 4vw, 2.6rem)' : 'clamp(1.8rem, 5vw, 3.2rem)'

  return (
    <div className="relative flex w-full max-w-full flex-col items-center">
      {/* Hidden input to summon soft keyboard on mobile devices (iOS/Android) */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        tabIndex={disabled ? -1 : 0}
        aria-label="Crossword mobile typing input"
        className="absolute top-0 left-0 h-0 w-0 opacity-0 pointer-events-none overflow-hidden"
        style={{ fontSize: '16px' }}
        defaultValue=" "
        onChange={handleInputChange}
        onKeyDown={handleInputKeyDown}
      />

      {/*
        Scroll container: Uses w-max min-w-full flex justify-center inside overflow-auto.
        This ensures:
        - When the grid is smaller than the screen, it is centered.
        - When the grid overflows (e.g. 15+ cols on mobile), it starts at scrollLeft = 0
          with zero clipping on the left edge (Column 0 / Cell 3 is fully visible and never cut off).
      */}
      <div
        ref={scrollContainerRef}
        className="w-full max-w-full overflow-auto max-h-[50vh] sm:max-h-[55vh] xl:max-h-none rounded-xl p-2 touch-pan-x touch-pan-y"
      >
        <div className="flex w-max min-w-full justify-center p-1">
          <div
            ref={containerRef}
            role="grid"
            aria-label="Crossword grid"
            tabIndex={disabled ? -1 : 0}
            onKeyDown={handleKeyDown}
            className={clsx(
              'inline-grid select-none gap-px rounded-lg border border-border-strong bg-border-strong p-px shadow-2xl outline-none shrink-0',
              disabled && 'pointer-events-none opacity-60'
            )}
            style={{ gridTemplateColumns: `repeat(${gridLayout.cols}, ${cellSize})` }}
          >
            {Array.from({ length: gridLayout.rows }).map((_, r) =>
              Array.from({ length: gridLayout.cols }).map((_, c) => {
                const filled = gridLayout.cellMask[r]?.[c]
                if (!filled) {
                  return <div key={`${r}-${c}`} className="bg-bg" style={{ width: cellSize, height: cellSize }} />
                }
                const key = cellKey(r, c)
                const letter = grid.get(key) ?? ''
                const number = numberAt.get(key)
                const isSelected = selected.row === r && selected.col === c
                const inWord = currentWordCells.has(key)

                return (
                  <button
                    type="button"
                    key={key}
                    ref={(el) => {
                      if (el) cellRefs.current.set(key, el)
                      else cellRefs.current.delete(key)
                    }}
                    role="gridcell"
                    aria-label={`Row ${r + 1} column ${c + 1}${letter ? `, letter ${letter}` : ', empty'}`}
                    onClick={() => {
                      onSelect(r, c)
                      focusInput()
                    }}
                    className={clsx(
                      'relative flex items-center justify-center border border-border-strong font-mono text-lg font-bold uppercase transition-colors duration-100 sm:text-xl',
                      isSelected
                        ? 'bg-accent-cyan text-black'
                        : inWord
                          ? 'bg-accent-cyan/25 text-text-primary'
                          : 'bg-white text-[#1b1e44] hover:bg-white/90'
                    )}
                    style={{ width: cellSize, height: cellSize }}
                  >
                    {number !== undefined && (
                      <span
                        className={clsx(
                          'pointer-events-none absolute left-0.5 top-0.5 text-[9px] font-bold leading-none select-none',
                          isSelected
                            ? 'text-black'
                            : inWord
                              ? 'text-accent-cyan'
                              : 'text-[#1b1e44]/80'
                        )}
                      >
                        {number}
                      </span>
                    )}
                    {letter}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
