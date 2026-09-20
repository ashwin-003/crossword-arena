import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { registerPlayer, loginPlayer, logoutPlayer } from '@/services/authService'
import { validateRegisterInput, type RegisterValidationError } from '@/lib/auth'
import { useToast } from '@/contexts/ToastContext'

export default function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  const initialBatch = (location.state as { batchNumber?: string } | null)?.batchNumber ?? ''
  const [name, setName] = useState('')
  const [className, setClassName] = useState('')
  const [batchNumber, setBatchNumber] = useState(initialBatch)
  const [fieldErrors, setFieldErrors] = useState<RegisterValidationError[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false)
  const [loading, setLoading] = useState(false)

  // Clear any existing stale session so new registration is completely clean
  useEffect(() => {
    logoutPlayer().catch(() => {})
  }, [])

  function errorFor(field: RegisterValidationError['field']) {
    return fieldErrors.find((e) => e.field === field)?.message
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setIsAlreadyRegistered(false)

    const input = { name, className, batchNumber }
    const errors = validateRegisterInput(input)
    setFieldErrors(errors)
    if (errors.length > 0) return

    setLoading(true)
    const result = await registerPlayer(input)

    if (!result.ok) {
      setLoading(false)
      const msg = 'error' in result ? result.error.message : 'Unable to create account.'
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered')) {
        setIsAlreadyRegistered(true)
        setFormError(`Batch number ${batchNumber} is already registered.`)
      } else {
        setFormError(msg)
      }
      return
    }

    const loginResult = await loginPlayer(batchNumber)
    setLoading(false)

    if (!loginResult.ok) {
      showToast({ variant: 'success', title: 'Account created', description: 'Please log in.' })
      navigate('/login', { state: { batchNumber } })
      return
    }

    showToast({ variant: 'success', title: `Welcome, ${name.trim()}!` })
    navigate('/lobby', { replace: true })
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
              Create Account
            </h1>
            <p className="mb-6 text-sm text-text-secondary">Register to join the competition.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <Input
                label="Name"
                name="name"
                autoComplete="name"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errorFor('name')}
              />
              <Input
                label="Class"
                name="class"
                placeholder="e.g. IV CSE"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                error={errorFor('className')}
              />
              <Input
                label="Batch Number"
                name="batchNumber"
                inputMode="numeric"
                placeholder="******"
                maxLength={6}
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                error={errorFor('batchNumber')}
              />

              {formError && (
                <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                  <p>{formError}</p>
                  {isAlreadyRegistered && (
                    <button
                      type="button"
                      onClick={() => navigate('/login', { state: { batchNumber } })}
                      className="mt-2 inline-flex items-center text-xs font-bold text-accent-cyan underline hover:text-accent-cyan/80"
                    >
                      Log in with batch number {batchNumber} now →
                    </button>
                  )}
                </div>
              )}

              <Button type="submit" loading={loading} fullWidth className="mt-2">
                Register
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent-cyan hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  )
}
