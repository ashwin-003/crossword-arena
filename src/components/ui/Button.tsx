import { forwardRef, type ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  chunky?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-accent-purple to-accent-purple-dim text-white border-2 border-black shadow-[0_0_0_1px_rgba(96,78,234,0.3)] hover:brightness-110 active:brightness-95',
  secondary:
    'bg-surface-raised text-text-primary border-2 border-black hover:bg-surface-hover hover:border-accent-cyan/60',
  ghost: 'bg-transparent text-text-secondary border-2 border-transparent hover:text-text-primary hover:bg-surface',
  danger:
    'bg-gradient-to-b from-[#f15a50] via-danger to-[#d9413b] text-white border-2 border-black hover:brightness-110 active:brightness-95',
  success:
    'bg-gradient-to-b from-[#65f47f] via-success to-success-dim text-white border-2 border-black hover:brightness-110 active:brightness-95',
  warning:
    'bg-gradient-to-b from-[#ffd42a] via-warning to-warning-dim text-black border-2 border-black hover:brightness-110 active:brightness-95',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-xs',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  chunky = true,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  chunky?: boolean
  className?: string
}) {
  return clsx(
    'inline-flex select-none items-center justify-center gap-2 rounded-lg font-display font-semibold uppercase tracking-wide transition-all duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:brightness-75',
    'focus-visible:outline-2 focus-visible:outline-accent-cyan focus-visible:outline-offset-2',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
    chunky && 'btn-chunky',
    className
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, chunky = true, disabled, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, fullWidth, chunky, className })}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
})
