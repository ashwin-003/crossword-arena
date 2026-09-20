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

  return { ok: true }
}

export async function logoutPlayer(): Promise<void> {
  await supabase.auth.signOut()
}
