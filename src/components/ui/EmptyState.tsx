import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface/40 px-6 py-14 text-center">
      <div className="rounded-full bg-surface-raised p-3">
        <Icon size={22} className="text-text-muted" />
      </div>
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {action}
    </div>
  )
}
