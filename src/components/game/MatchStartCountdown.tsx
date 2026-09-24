import { useEffect, useState } from 'react'
import { playTick, playStart } from '@/lib/sound'

const STEPS = ['3', '2', '1']
const STEP_MS = 1000

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
  }, [stepIndex, onDone])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg/95 backdrop-blur-md select-none">
      <div className="flex flex-col items-center gap-6">
        <p className="font-display text-xs font-bold uppercase tracking-[0.4em] text-accent-cyan animate-pulse">
          MATCH STARTING
        </p>
        <div
          key={stepIndex}
          className="animate-fade-in-up font-heavy text-9xl font-black uppercase text-outline text-gradient-brand drop-shadow-[0_0_40px_rgba(139,92,246,0.6)] sm:text-[12rem]"
        >
          {STEPS[stepIndex]}
        </div>
      </div>
    </div>
  )
}
