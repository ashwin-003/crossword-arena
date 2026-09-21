import { supabase } from '@/lib/supabaseClient'
import { batchNumberToSyntheticEmail, batchNumberToDerivedPassword, type RegisterInput } from '@/lib/auth'

export interface ServiceError {
  message: string
}

export async function registerPlayer(input: RegisterInput): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; userId: string }>('register', {
    body: {
      name: input.name.trim(),
      className: input.className.trim(),
      batchNumber: input.batchNumber.trim(),
    },
  })

  if (error) {
    let message = 'Unable to create your account. Please try again.'
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const body = await context.clone().json()
        if (body?.error?.message) message = body.error.message
      } catch {
        // ignore — fall back to default message
      }
    }
    return { ok: false, error: { message } }
  }

  if (!data?.ok) {
    return { ok: false, error: { message: 'Unable to create your account. Please try again.' } }
  }

  return { ok: true }
}

export function getLastBatchNumber(): string | null {
  try {
    return localStorage.getItem('ca_last_batch_number')
  } catch {
    return null
  }
}

export async function loginPlayer(batchNumber: string): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const trimmed = batchNumber.trim()
  const email = batchNumberToSyntheticEmail(trimmed)
  const password = batchNumberToDerivedPassword(trimmed)
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const message = error.message.toLowerCase().includes('invalid')
      ? 'That batch number is not registered yet.'
      : 'Unable to log in right now. Please try again.'
    return { ok: false, error: { message } }
  }

  try {
    localStorage.setItem('ca_last_batch_number', trimmed)
  } catch {
    // ignore storage unavailability
  }

  return { ok: true }
}

export async function loginMentor(
  identifier: string,
  password?: string
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const trimmedId = identifier.trim()
  const trimmedPass = (password ?? '').trim()

  // Case 1: Standard email address
  if (trimmedId.includes('@')) {
    if (!trimmedPass) {
      return { ok: false, error: { message: 'Password is required for email login.' } }
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedId,
      password: trimmedPass,
    })
    if (error) {
      const message = error.message.toLowerCase().includes('invalid')
        ? 'Invalid mentor email or password.'
        : 'Unable to log in right now. Please try again.'
      return { ok: false, error: { message } }
    }
    return { ok: true }
  }

  // Case 2: 6-digit Mentor ID
  if (/^\d{6}$/.test(trimmedId)) {
    if (trimmedPass) {
      const email = batchNumberToSyntheticEmail(trimmedId)
      const { error: customPassErr } = await supabase.auth.signInWithPassword({
        email,
        password: trimmedPass,
      })
      if (!customPassErr) {
        try {
          localStorage.setItem('ca_last_batch_number', trimmedId)
        } catch {
          // ignore
        }
        return { ok: true }
      }
    }

    // Fall back to standard ID derivation
    return loginPlayer(trimmedId)
  }

  // Case 3: Other username/identifier with password
  if (trimmedPass) {
    const syntheticEmail = `${trimmedId.toLowerCase()}@players.crossword-arena.internal`
    const { error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: trimmedPass,
    })
    if (!error) {
      return { ok: true }
    }
  }

  return { ok: false, error: { message: 'Enter a valid 6-digit Mentor ID or Email address.' } }
}

export async function reauthenticateSilently(): Promise<boolean> {
  const lastBatch = getLastBatchNumber()
  if (!lastBatch) return false
  const res = await loginPlayer(lastBatch)
  return res.ok
}

export async function logoutPlayer(): Promise<void> {
  try {
    localStorage.removeItem('ca_last_batch_number')
  } catch {
    // ignore
  }
  await supabase.auth.signOut()
}
