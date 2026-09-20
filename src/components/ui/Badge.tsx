import type { ReactNode } from 'react'
import clsx from 'clsx'

type Tone = 'neutral' | 'purple' | 'cyan' | 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-surface-raised text-text-secondary border-border-strong',
  purple: 'bg-accent-purple/15 text-accent-purple border-accent-purple/40',
  cyan: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/40',
  success: 'bg-success/15 text-success border-success/40',
  warning: 'bg-warning/15 text-warning border-warning/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
}

export function Badge({
  tone = 'neutral',
  children,
  pulse = false,
  className,
}: {
  tone?: Tone
  children: ReactNode
  pulse?: boolean
  className?: string
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wider',
        TONE_CLASSES[tone],
        className
      )}
    >
      {pulse && <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-current" />}
      {children}
    </span>
  )
}
