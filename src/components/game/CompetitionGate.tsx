import { Maximize } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/layout/Logo'

export function CompetitionGate({ onEnter, entering }: { onEnter: () => void; entering: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-bg bg-grid-pattern px-4 text-center">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_120%_60%_at_50%_-10%,rgba(139,92,246,0.18),transparent),radial-gradient(ellipse_100%_50%_at_100%_110%,rgba(34,211,238,0.14),transparent)]" />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <Logo />
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-accent-purple/10 p-5">
          <Maximize size={32} className="text-accent-purple" />
        </div>
        <h1 className="font-heavy text-2xl uppercase tracking-wide text-outline text-text-primary">Competition Mode</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          Fullscreen mode is required to continue. Your match timer starts as soon as you enter.
        </p>
      </div>
      <Button size="lg" onClick={onEnter} loading={entering}>
        <Maximize size={16} />
        Enter Competition Mode
      </Button>
    </div>
  )
}
