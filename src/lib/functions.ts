import { supabase } from './supabaseClient'
import { getStudentSession, reauthenticateSilently } from '@/services/authService'

export interface FunctionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

async function getValidAccessToken(): Promise<string | null> {
  try {
    // 1. Prefer Supabase Auth session (Mentor)
    let {
      data: { session },
    } = await supabase.auth.getSession()

    const isExpiredOrExpiring =
      !session ||
      (session.expires_at && session.expires_at * 1000 < Date.now() + 60000)

    if (isExpiredOrExpiring) {
      const refreshed = await supabase.auth.refreshSession().catch(() => null)

      if (refreshed?.data?.session) {
        session = refreshed.data.session
      }
    }

    if (session?.access_token) {
      return session.access_token
    }

    // 2. Fall back to student session
    const studentSession = getStudentSession()

    if (studentSession?.token) {
      return studentSession.token
    }

    return null
  } catch (err) {
    console.warn('[callFunction] Error checking auth session:', err)
    return null
  }
}

/**
 * Wrapper around supabase.functions.invoke that:
 * 1. Ensures the caller has a valid access token (student session token or mentor auth token).
 * 2. Explicitly injects Authorization: Bearer <token>.
 * 3. Unwraps Edge Function error responses into friendly error messages.
 */
export async function callFunction<TResponse = unknown, TBody extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  body?: TBody
): Promise<FunctionResult<TResponse>> {
  let token = await getValidAccessToken()
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let { data, error } = await supabase.functions.invoke<TResponse>(name, { body, headers })

  // If 401 / Authentication error occurred on mentor auth, attempt session recovery and retry once
  const context = (error as { context?: Response })?.context
  const isAuthError =
    context?.status === 401 ||
    error?.message?.toLowerCase().includes('auth') ||
    error?.message?.toLowerCase().includes('jwt')

  if (error && isAuthError && !getStudentSession()) {
    console.warn(`[callFunction] Got 401 on ${name}, attempting session recovery…`)
    const refreshed = await supabase.auth.refreshSession().catch(() => null)
    let freshToken = refreshed?.data?.session?.access_token ?? null

    if (!freshToken) {
      const reauthed = await reauthenticateSilently()
      if (reauthed) {
        const fresh = await supabase.auth.getSession()
        freshToken = fresh.data.session?.access_token ?? null
      }
    }

    if (freshToken) {
      token = freshToken
      const retryHeaders: Record<string, string> = { Authorization: `Bearer ${token}` }
      const retry = await supabase.functions.invoke<TResponse>(name, { body, headers: retryHeaders })
      data = retry.data
      error = retry.error
    }
  }

  if (error) {
    let message = 'Something went wrong. Please try again.'
    const errContext = (error as { context?: Response }).context
    if (errContext) {
      try {
        const parsed = await errContext.clone().json()
        if (parsed?.error?.message) {
          message = parsed.error.message
        } else if (parsed?.message) {
          message = parsed.message
        }
      } catch {
        // ignore parse failure
      }
    } else if (error.message) {
      message = error.message
    }

    // Friendly mappings for standard error states
    if (message.includes('Invalid game code') || message.includes('Game not found')) {
      message = 'Invalid game code'
    } else if (message.includes('Authentication required') || message.includes('session')) {
      message = 'Student session expired. Please log in again.'
    } else if (message.includes('already started') || message.includes('ended') || message.includes('cancelled')) {
      message = 'This game is no longer accepting participants.'
    }

    return { ok: false, error: message }
  }

  return { ok: true, data: data as TResponse }
}
