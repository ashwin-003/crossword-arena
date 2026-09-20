import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * Service-role client. Bypasses RLS entirely — every function in this
 * directory is trusted, server-side code and is the ONLY code path allowed
 * to mutate games/participants/results/questions.answer. Never ship this
 * key to the browser.
 */
export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured for this function.')
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Client scoped to the caller's own JWT (respects RLS). Used to verify who
 * is calling before we do anything privileged with the admin client above.
 */
export function getCallerClient(req: Request): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not configured for this function.')
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
}

export async function requireUser(req: Request) {
  const caller = getCallerClient(req)
  const {
    data: { user },
    error,
  } = await caller.auth.getUser()
  if (error || !user) {
    return { user: null, caller }
  }
  return { user, caller }
}
