import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  variant?: 'default' | 'impact'
}

export function Modal({ open, onClose, title, children, footer, variant = 'impact' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          'glass-panel relative w-full max-w-md animate-fade-in-up rounded-2xl border p-6 shadow-2xl',
          variant === 'impact' ? 'border-2 border-accent-purple/40 bg-halftone' : 'border-border-strong'
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2
            id="modal-title"
            className={clsx(
              variant === 'impact'
                ? 'font-heavy text-2xl uppercase tracking-wide text-outline text-text-primary'
                : 'font-display text-lg font-bold uppercase tracking-wide text-text-primary'
            )}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-md p-1 text-text-muted transition hover:bg-surface-hover hover:text-text-primary"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-text-secondary">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
