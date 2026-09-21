import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { loginPlayer } from '@/services/authService'
import { supabase } from '@/lib/supabaseClient'
import { formatGameCodeInput } from '@/utils/gameCode'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialBatch = (location.state as { batchNumber?: string } | null)?.batchNumber ?? ''
  const [batchNumber, setBatchNumber] = useState(initialBatch)
  const [error, setError] = useState<string | null>(null)
  const [unregisteredBatch, setUnregisteredBatch] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Note: We do not log out on mount so opening /login in another tab or checking it does not kill an active match session.

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnregisteredBatch(null)

    if (!/^\d{6}$/.test(batchNumber)) {
      setError('Enter your 6-digit batch number (e.g. 261012).')
      return
    }

    setLoading(true)
    const result = await loginPlayer(batchNumber)
    setLoading(false)

    if (result.ok) {
      const redirectTo = (location.state as { from?: string } | null)?.from ?? '/lobby'
      navigate(redirectTo, { replace: true })
      return
    }

    const defaultError = 'error' in result ? result.error.message : 'Unable to log in right now.'
    // Check whether this batch number exists in the database
    try {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .eq('batch_number', batchNumber)
        .maybeSingle()

      if (!userRow) {
        setUnregisteredBatch(batchNumber)
        setError(`Batch number ${batchNumber} is not registered yet.`)
        return
      }
    } catch {
      // Fall back to general error
    }

    setError(defaultError)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg bg-grid-pattern px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#1b1e44_0%,#5d3fdb_28%,#604eea_48%,#5386ef_68%,#1b1e44_100%)] opacity-90" />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardBody>
            <h1 className="mb-1 font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">
              Welcome Back
            </h1>
            <p className="mb-6 text-sm text-text-secondary">Log in to enter the arena.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <Input
                label="Batch Number"
                name="batchNumber"
                inputMode="numeric"
                autoComplete="username"
                placeholder="******"
                maxLength={6}
                value={batchNumber}
                onChange={(e) => setBatchNumber(formatGameCodeInput(e.target.value).replace(/[^0-9]/g, '').slice(0, 6))}
              />

              {error && (
                <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  <p>{error}</p>
                  {unregisteredBatch && (
                    <button
                      type="button"
                      onClick={() => navigate('/register', { state: { batchNumber: unregisteredBatch } })}
                      className="mt-2 inline-flex items-center text-xs font-bold text-accent-cyan underline hover:text-accent-cyan/80"
                    >
                      Register with batch number {unregisteredBatch} now →
                    </button>
                  )}
                </div>
              )}

              <Button type="submit" loading={loading} fullWidth className="mt-2">
                Log In
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-6 text-center text-sm text-text-secondary">
          New here?{' '}
          <Link to="/register" className="font-semibold text-accent-cyan hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
