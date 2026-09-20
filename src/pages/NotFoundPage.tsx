import { Compass } from 'lucide-react'
import { LinkButton } from '@/components/ui/LinkButton'
import { Logo } from '@/components/layout/Logo'

export default function NotFoundPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-bg bg-grid-pattern px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_120%_60%_at_50%_-10%,rgba(139,92,246,0.18),transparent),radial-gradient(ellipse_100%_50%_at_100%_110%,rgba(34,211,238,0.14),transparent)]" />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <Logo />
      <div className="rounded-full bg-surface-raised p-4">
        <Compass size={26} className="text-text-muted" />
      </div>
      <div>
        <h1 className="font-heavy text-4xl uppercase tracking-tight text-outline text-text-primary">404</h1>
        <p className="mt-1 text-sm text-text-secondary">This page doesn't exist.</p>
      </div>
      <LinkButton to="/">Back to Home</LinkButton>
    </div>
  )
}
