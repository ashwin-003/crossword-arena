import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatGameCodeInput, isCompleteGameCode } from '@/utils/gameCode'
import { joinGameByCode } from '@/services/gameService'
import { getUserRole } from '@/services/authService'

export default function JoinGamePage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (getUserRole() === 'mentor') {
      navigate('/mentor', { replace: true })
    }
  }, [navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (getUserRole() === 'mentor') {
      setError('Mentors cannot join games as participants. Please use the Mentor Dashboard.')
      navigate('/mentor', { replace: true })
      return
    }

    const cleanCode = formatGameCodeInput(code)
    if (!isCompleteGameCode(cleanCode)) {
      setError('Enter the full 6-character game code.')
      return
    }

    setLoading(true)
    const result = await joinGameByCode(cleanCode)
    setLoading(false)

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Unable to join that game.')
      return
    }

    // Direct game entry if match is already active, or waiting room if waiting for mentor
    if (result.data.status === 'active') {
      try {
        if (typeof document.documentElement.requestFullscreen === 'function') {
          document.documentElement.requestFullscreen().catch(() => {})
        }
      } catch {}
      navigate(`/game/${cleanCode}/competition`, { replace: true })
    } else {
      navigate(`/game/${cleanCode}/lobby`, { replace: true })
    }
  }

  return (
    <PageShell className="flex items-center justify-center py-20">
      <div className="w-full max-w-sm animate-fade-in-up">
        <Card>
          <CardBody className="flex flex-col items-center gap-5 text-center">
            <div className="rounded-full bg-accent-cyan/10 p-4">
              <KeyRound size={26} className="text-accent-cyan" />
            </div>
            <div>
              <h1 className="font-heavy text-xl uppercase tracking-wide text-outline text-text-primary sm:text-2xl">
                JOIN A MATCH
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Enter the Game Code provided by your mentor.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
              <div className="flex w-full flex-col gap-1.5 text-left">
                <label
                  htmlFor="game-code-input"
                  className="font-display text-xs font-bold uppercase tracking-widest text-text-secondary"
                >
                  GAME CODE
                </label>
                <input
                  id="game-code-input"
                  autoFocus
                  inputMode="text"
                  autoCapitalize="characters"
                  placeholder="Enter Game Code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(formatGameCodeInput(e.target.value))}
                  className="h-16 w-full rounded-xl border-2 border-border-strong bg-halftone bg-surface text-center font-mono text-2xl font-bold uppercase tracking-[0.25em] text-text-primary placeholder:text-sm placeholder:tracking-normal placeholder:font-sans placeholder:font-normal placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent-cyan focus-visible:outline-offset-2 sm:text-3xl sm:tracking-[0.35em]"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} fullWidth disabled={!isCompleteGameCode(code)}>
                JOIN MATCH
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  )
}
