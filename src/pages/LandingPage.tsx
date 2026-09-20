import { Swords, KeyRound, Radio, Trophy, ShieldCheck, LineChart } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { LinkButton } from '@/components/ui/LinkButton'
import { Card, CardBody } from '@/components/ui/Card'
import { BoltAccent } from '@/components/decor/BoltAccent'
import { WebCorner } from '@/components/decor/WebCorner'

const FEATURES = [
  {
    icon: Radio,
    title: 'Live Competition',
    description: 'Every match runs on a server-authoritative clock, so all players compete on exactly the same timeline.',
  },
  {
    icon: Trophy,
    title: 'Real-time Leaderboard',
    description: 'Watch rankings update the instant a word is solved — no refresh, no polling delay.',
  },
  {
    icon: ShieldCheck,
    title: 'Competition Mode',
    description: 'Fullscreen-gated play with focus and visibility monitoring keeps matches fair and auditable.',
  },
  {
    icon: LineChart,
    title: 'Performance Tracking',
    description: 'Every match is scored, ranked, and saved to your personal history — accuracy, speed, and all.',
  },
]

const STEPS = [
  { step: '01', title: 'Create or Join', description: 'Spin up a match with your own crossword, or drop in a 6-character code.' },
  { step: '02', title: 'Match Lobby', description: 'Watch players join live, then the creator starts the match for everyone at once.' },
  { step: '03', title: 'Solve & Compete', description: 'Race the clock in Competition Mode while the leaderboard updates live.' },
  { step: '04', title: 'Results & Rank', description: 'Get your server-verified score, rank, and accuracy the moment you submit.' },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-bg bg-grid-pattern">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#1b1e44_0%,#5d3fdb_28%,#604eea_48%,#5386ef_68%,#1b1e44_100%)] opacity-90" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-20 bg-gradient-to-r from-accent-purple/25 via-accent-cyan/15 to-transparent sm:h-28"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 55%, 0 100%)' }}
      />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <WebCorner className="pointer-events-none absolute -right-4 -top-4 -z-10 h-40 w-40 text-accent-purple/40 sm:h-56 sm:w-56" />
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <LinkButton to="/login" variant="ghost" size="sm">
            Log In
          </LinkButton>
          <LinkButton to="/register" variant="secondary" size="sm">
            Register
          </LinkButton>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="animate-fade-in-up">
          <h1 className="font-heavy text-5xl uppercase leading-[1.05] tracking-tight text-outline text-text-primary sm:text-7xl">
            Crossword<span className="block text-gradient-brand">Arena</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl font-display text-base font-semibold uppercase tracking-widest text-text-secondary sm:text-lg">
            Think Fast. Solve Smart. Compete Live.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LinkButton to="/create-game" size="lg" className="relative">
              <Swords size={17} />
              Create Game
              <BoltAccent className="absolute -right-2 -top-2 h-5 w-5 text-warning" />
            </LinkButton>
            <LinkButton to="/join-game" variant="secondary" size="lg">
              <KeyRound size={17} />
              Join Game
            </LinkButton>
          </div>
        </div>
      </main>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="mb-8 text-center font-display text-xs font-bold uppercase tracking-[0.3em] text-text-muted">
          How It Works
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Card key={s.step}>
              <CardBody>
                <span className="font-display text-2xl font-extrabold text-accent-purple/50">{s.step}</span>
                <p className="mt-2 font-display text-sm font-bold uppercase tracking-wide text-text-primary">{s.title}</p>
                <p className="mt-1.5 text-sm text-text-secondary">{s.description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardBody className="flex items-start gap-4">
                <div className="rounded-xl bg-accent-cyan/10 p-3">
                  <f.icon size={20} className="text-accent-cyan" />
                </div>
                <div>
                  <p className="font-display text-sm font-bold uppercase tracking-wide text-text-primary">{f.title}</p>
                  <p className="mt-1 text-sm text-text-secondary">{f.description}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 text-center text-xs text-text-muted sm:px-6">
        <Logo className="mb-3 justify-center opacity-70" />
        Built for competitive college crossword events.
      </footer>
    </div>
  )
}
