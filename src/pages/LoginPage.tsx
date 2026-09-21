import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Shield, GraduationCap, ArrowRight, ArrowLeft } from 'lucide-react'
import { LogoMark } from '@/components/layout/Logo'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { loginPlayer, loginMentor } from '@/services/authService'
import { supabase } from '@/lib/supabaseClient'
import { formatGameCodeInput } from '@/utils/gameCode'

type LoginMode = 'select' | 'mentor' | 'student'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const initialBatch = (location.state as { batchNumber?: string } | null)?.batchNumber ?? ''

  const [mode, setMode] = useState<LoginMode>(initialBatch ? 'student' : 'select')

  // Student form state
  const [studentBatch, setStudentBatch] = useState(initialBatch)
  const [unregisteredBatch, setUnregisteredBatch] = useState<string | null>(null)

  // Mentor form state
  const [mentorIdentifier, setMentorIdentifier] = useState('')
  const [mentorPassword, setMentorPassword] = useState('')

  // Shared state
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleStudentSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setUnregisteredBatch(null)

    if (!/^\d{6}$/.test(studentBatch)) {
      setError('Enter your 6-digit batch number (e.g. 261012).')
      return
    }

    setLoading(true)
    const result = await loginPlayer(studentBatch)
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
        .eq('batch_number', studentBatch)
        .maybeSingle()

      if (!userRow) {
        setUnregisteredBatch(studentBatch)
        setError(`Batch number ${studentBatch} is not registered yet.`)
        return
      }
    } catch {
      // Fall back to general error
    }

    setError(defaultError)
  }

  async function handleMentorSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!mentorIdentifier.trim()) {
      setError('Please enter your Mentor ID or Email.')
      return
    }

    setLoading(true)
    const result = await loginMentor(mentorIdentifier, mentorPassword)
    setLoading(false)

    if (result.ok) {
      const redirectTo = (location.state as { from?: string } | null)?.from ?? '/lobby'
      navigate(redirectTo, { replace: true })
      return
    }

    setError('error' in result ? result.error.message : 'Unable to log in right now.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg bg-grid-pattern px-4 py-10">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,#1b1e44_0%,#5d3fdb_28%,#604eea_48%,#5386ef_68%,#1b1e44_100%)] opacity-90" />
      <div className="pointer-events-none absolute -left-12 top-28 -z-10 h-40 w-40 rotate-12 bg-halftone opacity-20" />
      <div className="pointer-events-none absolute -right-12 bottom-28 -z-10 h-48 w-48 -rotate-12 bg-halftone opacity-20" />
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex justify-center">
            <LogoMark className="h-12 w-12 sm:h-14 sm:w-14 drop-shadow-[0_0_24px_rgba(96,78,234,0.5)]" />
          </div>
          <h1 className="font-heavy text-4xl uppercase leading-[1.05] tracking-tight text-outline text-text-primary sm:text-5xl">
            Crossword<span className="block text-gradient-brand">Arena</span>
          </h1>
        </div>
        <Card>
          <CardBody>
            {mode === 'select' && (
              <div>
                <h1 className="mb-1 font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">
                  Welcome Back
                </h1>
                <p className="mb-6 text-sm text-text-secondary">Select your login option to enter the arena.</p>

                <div className="flex flex-col gap-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('mentor')
                      setError(null)
                    }}
                    className="group relative flex items-center justify-between rounded-xl border border-border-strong bg-surface/60 p-4 text-left backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset] transition-all duration-200 hover:border-accent-purple/60 hover:bg-accent-purple/10 hover:shadow-[0_0_20px_rgba(93,63,219,0.25)] active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent-purple/40 bg-accent-purple/20 text-accent-purple transition-colors group-hover:border-accent-purple/60 group-hover:bg-accent-purple/30">
                        <Shield size={22} />
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold uppercase tracking-wider text-text-primary group-hover:text-accent-purple">
                          Mentor Login
                        </p>
                        <p className="text-xs text-text-muted">Host, create & monitor crossword matches</p>
                      </div>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent-purple"
                    />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('student')
                      setError(null)
                    }}
                    className="group relative flex items-center justify-between rounded-xl border border-border-strong bg-surface/60 p-4 text-left backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,255,255,0.05)_inset] transition-all duration-200 hover:border-accent-cyan/60 hover:bg-accent-cyan/10 hover:shadow-[0_0_20px_rgba(0,240,255,0.2)] active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent-cyan/40 bg-cyan-500/20 text-accent-cyan transition-colors group-hover:border-accent-cyan/60 group-hover:bg-accent-cyan/30">
                        <GraduationCap size={22} />
                      </div>
                      <div>
                        <p className="font-display text-sm font-bold uppercase tracking-wider text-text-primary group-hover:text-accent-cyan">
                          Student Login
                        </p>
                        <p className="text-xs text-text-muted">Join live matches with your batch number</p>
                      </div>
                    </div>
                    <ArrowRight
                      size={18}
                      className="text-text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-accent-cyan"
                    />
                  </button>
                </div>
              </div>
            )}

            {mode === 'mentor' && (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">
                      Mentor Login
                    </h1>
                    <p className="mt-0.5 text-xs text-text-secondary">Log in with your mentor credentials</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('select')
                      setError(null)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-white/5 px-2.5 py-1 text-xs font-semibold text-text-muted transition hover:border-accent-purple/50 hover:bg-accent-purple/10 hover:text-text-primary"
                  >
                    <ArrowLeft size={13} />
                    Back
                  </button>
                </div>

                <form onSubmit={handleMentorSubmit} className="flex flex-col gap-4" noValidate>
                  <Input
                    label="Mentor ID or Email"
                    name="mentorIdentifier"
                    autoComplete="username"
                    placeholder="e.g. 6-digit ID or mentor@college.edu"
                    value={mentorIdentifier}
                    onChange={(e) => setMentorIdentifier(e.target.value)}
                  />

                  <Input
                    label="Password"
                    name="mentorPassword"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={mentorPassword}
                    onChange={(e) => setMentorPassword(e.target.value)}
                    hint="Leave blank if logging in with 6-digit Mentor ID"
                  />

                  {error && (
                    <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
                      <p>{error}</p>
                    </div>
                  )}

                  <Button type="submit" loading={loading} fullWidth className="mt-2">
                    Log In as Mentor
                  </Button>

                  <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('select')
                        setError(null)
                      }}
                      className="hover:text-text-primary transition"
                    >
                      ← Back to options
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('student')
                        setError(null)
                      }}
                      className="font-medium text-accent-cyan hover:underline"
                    >
                      Student Login →
                    </button>
                  </div>
                </form>
              </div>
            )}

            {mode === 'student' && (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h1 className="font-heavy text-xl uppercase tracking-wide text-outline text-text-primary">
                      Student Login
                    </h1>
                    <p className="mt-0.5 text-xs text-text-secondary">Enter your batch number to participate</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('select')
                      setError(null)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-white/5 px-2.5 py-1 text-xs font-semibold text-text-muted transition hover:border-accent-cyan/50 hover:bg-accent-cyan/10 hover:text-text-primary"
                  >
                    <ArrowLeft size={13} />
                    Back
                  </button>
                </div>

                <form onSubmit={handleStudentSubmit} className="flex flex-col gap-4" noValidate>
                  <Input
                    label="Batch Number"
                    name="batchNumber"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="6 digits (e.g. 261012)"
                    maxLength={6}
                    value={studentBatch}
                    onChange={(e) =>
                      setStudentBatch(
                        formatGameCodeInput(e.target.value)
                          .replace(/[^0-9]/g, '')
                          .slice(0, 6)
                      )
                    }
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
                    Log In as Student
                  </Button>

                  <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('select')
                        setError(null)
                      }}
                      className="hover:text-text-primary transition"
                    >
                      ← Back to options
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('mentor')
                        setError(null)
                      }}
                      className="font-medium text-accent-purple hover:underline"
                    >
                      Mentor Login →
                    </button>
                  </div>
                </form>
              </div>
            )}
          </CardBody>
        </Card>

        <p className="mt-6 text-center text-sm text-text-secondary">
          New student?{' '}
          <Link to="/register" className="font-semibold text-accent-cyan hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}
