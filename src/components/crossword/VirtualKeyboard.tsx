import { Delete, SkipForward } from 'lucide-react'

interface VirtualKeyboardProps {
  onLetter: (letter: string) => void
  onBackspace: () => void
  onNextWord?: () => void
  disabled?: boolean
}

const ROW_1 = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']
const ROW_2 = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
const ROW_3 = ['Z', 'X', 'C', 'V', 'B', 'N', 'M']

export function VirtualKeyboard({
  onLetter,
  onBackspace,
  onNextWord,
  disabled = false,
}: VirtualKeyboardProps) {
  return (
    <div
      role="group"
      aria-label="Crossword on-screen keyboard"
      className="flex w-full max-w-lg flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-surface/80 p-2 shadow-lg backdrop-blur-xl transition-colors duration-200 hover:border-white/20 sm:p-3"
    >
      {/* Row 1 */}
      <div className="flex w-full justify-center gap-1 sm:gap-1.5">
        {ROW_1.map((char) => (
          <button
            key={char}
            type="button"
            disabled={disabled}
            onClick={() => onLetter(char)}
            className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface-raised font-mono text-sm font-bold text-text-primary transition active:scale-95 active:bg-accent-purple active:text-white sm:h-11 sm:text-base hover:border-accent-cyan/50 hover:bg-surface-hover"
          >
            {char}
          </button>
        ))}
      </div>

      {/* Row 2 */}
      <div className="flex w-full justify-center gap-1 px-2 sm:gap-1.5 sm:px-4">
        {ROW_2.map((char) => (
          <button
            key={char}
            type="button"
            disabled={disabled}
            onClick={() => onLetter(char)}
            className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface-raised font-mono text-sm font-bold text-text-primary transition active:scale-95 active:bg-accent-purple active:text-white sm:h-11 sm:text-base hover:border-accent-cyan/50 hover:bg-surface-hover"
          >
            {char}
          </button>
        ))}
      </div>

      {/* Row 3 */}
      <div className="flex w-full justify-center gap-1 sm:gap-1.5">
        {onNextWord && (
          <button
            type="button"
            disabled={disabled}
            onClick={onNextWord}
            aria-label="Next word"
            title="Next word"
            className="flex h-10 min-w-[2.75rem] flex-1 items-center justify-center gap-1 rounded-lg border border-border-strong bg-surface-raised px-2 font-display text-xs font-bold uppercase text-accent-cyan transition active:scale-95 active:bg-accent-cyan active:text-bg sm:h-11 sm:min-w-[3.5rem] hover:border-accent-cyan/50 hover:bg-surface-hover"
          >
            <SkipForward size={15} />
            <span className="hidden sm:inline">Next</span>
          </button>
        )}

        {ROW_3.map((char) => (
          <button
            key={char}
            type="button"
            disabled={disabled}
            onClick={() => onLetter(char)}
            className="flex h-10 flex-1 items-center justify-center rounded-lg border border-border-strong bg-surface-raised font-mono text-sm font-bold text-text-primary transition active:scale-95 active:bg-accent-purple active:text-white sm:h-11 sm:text-base hover:border-accent-cyan/50 hover:bg-surface-hover"
          >
            {char}
          </button>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={onBackspace}
          aria-label="Delete letter"
          title="Backspace"
          className="flex h-10 min-w-[2.75rem] flex-1 items-center justify-center rounded-lg border border-danger/40 bg-danger/15 text-danger transition active:scale-95 active:bg-danger active:text-white sm:h-11 sm:min-w-[3.5rem] hover:bg-danger/25"
        >
          <Delete size={17} />
        </button>
      </div>
    </div>
  )
}
