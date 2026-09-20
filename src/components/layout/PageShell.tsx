import type { ReactNode } from 'react'
import clsx from 'clsx'
import { NavBar } from './NavBar'
import { WebCorner } from '@/components/decor/WebCorner'

export function PageShell({
  children,
  className,
  fullBleed = false,
}: {
  children: ReactNode
  className?: string
  fullBleed?: boolean
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg bg-grid-pattern">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#1b1e44_0%,#5d3fdb_28%,#604eea_48%,#5386ef_68%,#1b1e44_100%)] opacity-90" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-20 bg-gradient-to-r from-accent-purple/25 via-accent-cyan/15 to-transparent sm:h-28"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 55%, 0 100%)' }}
      />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <WebCorner className="pointer-events-none absolute -right-4 -top-4 -z-10 h-40 w-40 text-accent-purple/40 sm:h-56 sm:w-56" />
      <NavBar />
      <main
        className={clsx(
          fullBleed ? '' : 'relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10',
          className
        )}
      >
        {children}
      </main>
    </div>
  )
}
