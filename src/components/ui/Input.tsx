import { forwardRef, type InputHTMLAttributes } from 'react'
import clsx from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...rest },
  ref
) {
  const inputId = id ?? rest.name
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="font-display text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'h-11 rounded-lg border-2 bg-surface px-3.5 text-sm text-text-primary placeholder:text-text-muted',
          'transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent-cyan focus-visible:outline-offset-2',
          error ? 'border-danger/60' : 'border-border-strong focus:border-accent-cyan/60',
          className
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className="text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  )
})
