import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react'
import { useToast, type ToastVariant } from '@/contexts/ToastContext'

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Info; classes: string }> = {
  info: { icon: Info, classes: 'border-border-strong text-text-primary' },
  success: { icon: CheckCircle2, classes: 'border-success/40 text-success' },
  warning: { icon: TriangleAlert, classes: 'border-warning/40 text-warning' },
  danger: { icon: XCircle, classes: 'border-danger/40 text-danger' },
}

export function Toaster() {
  const { toasts, dismissToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
      {toasts.map((toast) => {
        const { icon: Icon, classes } = VARIANT_STYLES[toast.variant]
        return (
          <div
            key={toast.id}
            role="status"
            className={`glass-panel pointer-events-auto w-full max-w-sm animate-fade-in-up rounded-xl border ${classes} p-3.5 shadow-2xl sm:w-96`}
          >
            <div className="flex items-start gap-3">
              <Icon size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-text-primary">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-0.5 text-sm text-text-secondary">{toast.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-text-muted transition hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
