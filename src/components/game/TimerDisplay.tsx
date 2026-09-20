import clsx from 'clsx'
import { Clock } from 'lucide-react'
import type { TimerWarningLevel } from '@/hooks/useGameTimer'

const LEVEL_CLASSES: Record<TimerWarningLevel, string> = {
  normal: 'text-text-primary',
  'warning-1m': 'text-warning',
  'warning-30s': 'text-warning animate-pulse-glow',
  'warning-10s': 'text-danger animate-pulse-glow',
  expired: 'text-danger',
}

export function TimerDisplay({ formatted, level }: { formatted: string; level: TimerWarningLevel }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        <Clock size={12} />
        Time Remaining
      </span>
      <span className={clsx('font-mono text-3xl font-extrabold tabular-nums tracking-wide sm:text-4xl', LEVEL_CLASSES[level])}>
        {formatted}
      </span>
    </div>
  )
}
