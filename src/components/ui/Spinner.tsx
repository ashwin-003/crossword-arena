import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 py-10 text-text-secondary', className)}>
      <Loader2 size={28} className="animate-spin text-accent-cyan" />
      {label && <p className="font-display text-xs font-semibold uppercase tracking-wider">{label}</p>}
    </div>
  )
}

export function FullScreenSpinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-bg">
      <Spinner label={label} />
    </div>
  )
}
