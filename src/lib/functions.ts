import { supabase } from './supabaseClient'

export interface FunctionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/**
 * Thin wrapper around supabase.functions.invoke that unwraps our Edge
 * Functions' consistent `{ error: { message } }` failure shape into a
 * single friendly string, so every caller doesn't have to re-parse
 * FunctionsHttpError responses by hand.
 */
export async function callFunction<TResponse = unknown, TBody extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  body?: TBody
): Promise<FunctionResult<TResponse>> {
  const { data, error } = await supabase.functions.invoke<TResponse>(name, { body })

  if (error) {
    let message = 'Something went wrong. Please try again.'
    const context = (error as { context?: Response }).context
    if (context) {
      try {
        const parsed = await context.clone().json()
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
