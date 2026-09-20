import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatGameCodeInput, isCompleteGameCode } from '@/utils/gameCode'
import { joinGameByCode } from '@/services/gameService'

export default function JoinGamePage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isCompleteGameCode(code)) {
      setError('Enter the full 6-character game code.')
      return
    }

    setLoading(true)
    const result = await joinGameByCode(code)
    setLoading(false)

    if (!result.ok || !result.data) {
      setError(result.error ?? 'Unable to join that game.')
      return
    }

    navigate(`/game/${code}/lobby`)
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
              <h1 className="font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">Join Match</h1>
              <p className="mt-1 text-sm text-text-secondary">Enter the game code shared by the match creator.</p>
            </div>

            <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
              <input
                aria-label="Game code"
                autoFocus
                inputMode="text"
                autoCapitalize="characters"
                placeholder="7K4P92"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(formatGameCodeInput(e.target.value))}
                className="h-16 w-full rounded-xl border-2 border-border-strong bg-halftone bg-surface text-center font-mono text-3xl font-bold uppercase tracking-[0.35em] text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent-cyan focus-visible:outline-offset-2"
              />

              {error && (
                <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} fullWidth disabled={!isCompleteGameCode(code)}>
                Join Match
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </PageShell>
  )
}
