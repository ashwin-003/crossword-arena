import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border-2 border-white/90 bg-halftone bg-surface shadow-[4px_4px_0_0_#000000] transition-transform duration-150 hover:-translate-y-0.5',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('border-b border-border px-5 py-4', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('p-5', className)} {...rest}>
      {children}
    </div>
  )
}
