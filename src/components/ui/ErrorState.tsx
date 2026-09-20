import { TriangleAlert } from 'lucide-react'
import { Button } from './Button'

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string
  description?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-14 text-center">
      <div className="rounded-full bg-danger/15 p-3">
        <TriangleAlert size={22} className="text-danger" />
      </div>
      <p className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-sm text-text-secondary">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          Try Again
        </Button>
      )}
    </div>
  )
}
