import { supabase } from './supabaseClient'
import { reauthenticateSilently } from '@/services/authService'

export interface FunctionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

async function getValidAccessToken(): Promise<string | null> {
  try {
    let {
      data: { session },
    } = await supabase.auth.getSession()

    // If session is missing or within 60 seconds of expiration, attempt refresh
    const isExpiredOrExpiring =
      !session || (session.expires_at && session.expires_at * 1000 < Date.now() + 60000)

    if (isExpiredOrExpiring) {
      const refreshed = await supabase.auth.refreshSession()
      if (refreshed.data.session) {
        session = refreshed.data.session
      } else {
        // Attempt silent reauth via stored batch number
        const reauthed = await reauthenticateSilently()
        if (reauthed) {
          const fresh = await supabase.auth.getSession()
          session = fresh.data.session
        }
      }
    }

    return session?.access_token ?? null
  } catch (err) {
    console.warn('[callFunction] Error checking auth session:', err)
    return null
  }
}

/**
 * Wrapper around supabase.functions.invoke that:
 * 1. Ensures the caller has a valid, fresh access token (refreshing or auto-reauthenticating if needed).
 * 2. Explicitly injects Authorization: Bearer <token>.
 * 3. Automatically retries once if a 401 / Authentication required is encountered.
 * 4. Unwraps Edge Function error responses into friendly error messages.
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

  // If 401 / Authentication error occurred, attempt session recovery and retry once
  const context = (error as { context?: Response })?.context
  const isAuthError =
    context?.status === 401 ||
    error?.message?.toLowerCase().includes('auth') ||
    error?.message?.toLowerCase().includes('jwt')

  if (error && isAuthError) {
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
        if (parsed?.error?.message) message = parsed.error.message
      } catch {
        // ignore parse failure, use default message
      }
    } else if (error.message) {
      message = error.message
    }
    return { ok: false, error: message }
  }

  return { ok: true, data: data as TResponse }
}

