import { supabase } from '@/lib/supabaseClient'
import { batchNumberToSyntheticEmail, type RegisterInput } from '@/lib/auth'

export interface ServiceError {
  message: string
}

export interface StudentSession {
  token: string
  studentId: string
  batchNumber: string
  name: string
}

const STUDENT_SESSION_KEY = 'ca_student_session'

export function getStudentSession(): StudentSession | null {
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StudentSession
  } catch {
    return null
  }
}

export function setStudentSession(session: StudentSession | null) {
  try {
    if (session) {
      localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session))
      localStorage.setItem('ca_last_batch_number', session.batchNumber)
      localStorage.setItem('ca_user_role', 'student')
    } else {
      localStorage.removeItem(STUDENT_SESSION_KEY)
    }
  } catch {
    // ignore storage unavailability
  }
}

export async function registerPlayer(_input: RegisterInput): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  return { ok: false, error: { message: 'Registration is closed. Please log in with your batch number.' } }
}

export function getLastBatchNumber(): string | null {
  try {
    return localStorage.getItem('ca_last_batch_number')
  } catch {
    return null
  }
}

export function getUserRole(): 'student' | 'mentor' {
  try {
    const studentSession = getStudentSession()
    if (studentSession) return 'student'
    return (localStorage.getItem('ca_user_role') as 'mentor') === 'mentor' ? 'mentor' : 'student'
  } catch {
    return 'student'
  }
}

/**
 * Verifies student batch number securely through the student-login Edge Function.
 * Students do NOT use Supabase Auth, passwords, or emails.
 */
export async function loginPlayer(batchNumber: string): Promise<{ ok: true; session?: StudentSession } | { ok: false; error: ServiceError }> {
  const trimmed = batchNumber.trim()
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: { message: 'Invalid batch number' } }
  }

  const existingSession = getStudentSession()
  const clientToken = existingSession?.batchNumber === trimmed ? existingSession.token : undefined

  try {
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean
      session?: StudentSession
      error?: { message: string }
    }>('student-login', {
      body: { batchNumber: trimmed, clientToken },
    })

    if (error) {
      let message = 'Invalid batch number'
      const context = (error as { context?: Response }).context
      if (context) {
        try {
          const body = await context.clone().json()
          if (body?.error?.message) message = body.error.message
          else if (body?.message) message = body.message
        } catch {
          // ignore
        }
      }
      return { ok: false, error: { message } }
    }

    if (!data?.ok || !data.session) {
      return { ok: false, error: { message: data?.error?.message ?? 'Invalid batch number' } }
    }

    // Save student session in localStorage
    setStudentSession(data.session)

    // Notify auth context listeners
    window.dispatchEvent(new Event('ca_student_auth_change'))

    return { ok: true, session: data.session }
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : 'Unable to log in right now.' },
    }
  }
}

export async function loginMentor(
  identifier: string,
  password?: string
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const trimmedId = identifier.trim()
  const trimmedPass = (password ?? '').trim()

  if (!trimmedPass) {
    return { ok: false, error: { message: 'Password is required for mentor login.' } }
  }

  // Clear any existing student session
  setStudentSession(null)

  // Attempt login with provided email/identifier
  let loginEmail = trimmedId
  if (/^\d{6}$/.test(trimmedId)) {
    loginEmail = batchNumberToSyntheticEmail(trimmedId)
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: trimmedPass,
  })

  if (error || !authData?.user) {
    const message = error?.message.toLowerCase().includes('invalid')
      ? 'Invalid mentor email or password.'
      : 'Unable to log in right now. Please try again.'
    return { ok: false, error: { message } }
  }

  // Verify mentor exists in public.mentors and has is_active = true
  const { data: mentor, error: mentorError } = await supabase
    .from('mentors')
    .select('id, is_active')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()

  if (mentorError || !mentor) {
    await supabase.auth.signOut().catch(() => {})
    return { ok: false, error: { message: 'This account is not authorized as a mentor.' } }
  }

  if (!mentor.is_active) {
    await supabase.auth.signOut().catch(() => {})
    return { ok: false, error: { message: 'This mentor account is inactive.' } }
  }

  try {
    localStorage.setItem('ca_user_role', 'mentor')
  } catch {
    // ignore
  }

  return { ok: true }
}

export async function reauthenticateSilently(): Promise<boolean> {
  const studentSession = getStudentSession()
  if (studentSession) return true
  return false
}

export async function logoutPlayer(): Promise<void> {
  const studentSession = getStudentSession()
  const lastBatch = studentSession?.batchNumber || getLastBatchNumber()

  if (studentSession?.token || lastBatch) {
    // 1. Invalidate session via student-logout Edge Function
    try {
      await supabase.functions.invoke('student-logout', {
        body: {
          token: studentSession?.token ?? null,
          batchNumber: lastBatch ?? null,
        },
      })
    } catch {
      // ignore
    }

    // 2. Direct RPC release guarantee
    try {
      await supabase.rpc('release_student_session', {
        p_token: studentSession?.token ?? null,
        p_batch_number: lastBatch ?? null,
      })
    } catch {
      // ignore
    }
  }

  try {
    setStudentSession(null)
    localStorage.removeItem('ca_last_batch_number')
    localStorage.removeItem('ca_user_role')
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event('ca_student_auth_change'))
  await supabase.auth.signOut().catch(() => {})
}
