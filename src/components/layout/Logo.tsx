import clsx from 'clsx'

/** Simple crossword-grid inspired mark: three filled cells forming an "L",
 * evoking a puzzle grid without resembling any real game's branding. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('shrink-0', className)} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#cwa-logo-grad)" />
      <g fill="white">
        <rect x="7" y="7" width="6" height="6" rx="1.2" opacity="0.95" />
        <rect x="14.5" y="7" width="6" height="6" rx="1.2" opacity="0.55" />
        <rect x="7" y="14.5" width="6" height="6" rx="1.2" opacity="0.55" />
        <rect x="14.5" y="14.5" width="6" height="6" rx="1.2" opacity="0.95" />
        <rect x="22" y="14.5" width="3" height="6" rx="1" opacity="0.35" />
        <rect x="7" y="22" width="6" height="3" rx="1" opacity="0.35" />
      </g>
      <defs>
        <linearGradient id="cwa-logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <LogoMark className="h-8 w-8" />
      <span className={clsx('font-display text-lg font-extrabold tracking-tight text-text-primary', wordmarkClassName)}>
        CROSSWORD<span className="text-gradient-brand"> ARENA</span>
      </span>
    </div>
  )
}
