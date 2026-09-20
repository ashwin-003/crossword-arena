import { useEffect, useState } from 'react'
import { playTick, playStart } from '@/lib/sound'

const STEPS = ['3', '2', '1', 'GO!']
const STEP_MS = 700

export function MatchStartCountdown({ onDone }: { onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (stepIndex < STEPS.length - 1) {
      playTick()
    } else {
      playStart()
    }
    const timer = window.setTimeout(() => {
      if (stepIndex < STEPS.length - 1) {
        setStepIndex((i) => i + 1)
      } else {
        onDone()
      }
    }, STEP_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  return (
    <div className="fixed inset-0 z-[85] flex flex-col items-center justify-center gap-4 bg-bg/95 backdrop-blur-sm">
      <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-text-muted">Get Ready</p>
      <p key={stepIndex} className="animate-fade-in-up font-display text-8xl font-extrabold uppercase text-gradient-brand">
        {STEPS[stepIndex]}
      </p>
    </div>
  )
}
