import { AlertTriangle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function FullscreenInterruptedOverlay({
  interruptionCount,
  maxInterruptions,
  graceSecondsLeft,
  locked,
  onReturn,
}: {
  interruptionCount: number
  maxInterruptions: number
  graceSecondsLeft: number
  locked: boolean
  onReturn: () => void
}) {
  if (locked) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-bg/97 px-4 text-center backdrop-blur-sm">
        <div className="rounded-full bg-danger/10 p-5">
          <Lock size={32} className="text-danger" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-danger">
            Removed From Competition
          </h2>
          <p className="max-w-sm text-sm text-text-secondary">
            Your game has been submitted automatically with your progress so far.
          </p>
        </div>
      </div>
    )
  }

  const remaining = Math.max(maxInterruptions - interruptionCount, 0)

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-bg/97 px-4 text-center backdrop-blur-sm">
      <div className="animate-pulse-glow rounded-full bg-warning/10 p-5">
        <AlertTriangle size={32} className="text-warning" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide text-warning">
          Competition Mode Interrupted
        </h2>
        <p className="max-w-sm text-sm text-text-secondary">Return to fullscreen now. Your timer keeps running.</p>
        <p className="mt-1 font-mono text-3xl font-extrabold text-danger">{formatSeconds(graceSecondsLeft)}</p>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
          Auto-submit if you don't return in time
        </p>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">
          Attempt {interruptionCount} of {maxInterruptions} used — {remaining} remaining
        </p>
      </div>
      <Button onClick={onReturn} size="lg">
        Return to Game
      </Button>
    </div>
  )
}
