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

export interface AuthUser {
  id: string
  role?: string
  batchNumber?: string
  email?: string
}

export async function requireUser(req: Request): Promise<{ user: AuthUser | null; caller: SupabaseClient }> {
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  const caller = getCallerClient(req)
  const admin = getAdminClient()

  if (token) {
    // 1. Check if token is a Student Session Token
    if (token.startsWith('st_')) {
      try {
        const { data: sessionRow, error: sessionErr } = await admin
          .from('student_sessions')
          .select('id, batch_number, is_active')
          .eq('token', token)
          .maybeSingle()

        if (!sessionErr && sessionRow) {
          if (sessionRow.is_active === false) {
            return { user: null, caller }
          }

          // Update last_seen_at asynchronously
          admin
            .from('student_sessions')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', sessionRow.id)
            .then(() => {})
            .catch(() => {})

          return {
            user: {
              id: sessionRow.id,
              role: 'student',
              batchNumber: sessionRow.batch_number,
            },
            caller,
          }
        }
      } catch (err) {
        console.warn('Error verifying student session token:', err)
      }
    }

    // 2. Otherwise verify as Supabase Auth user (e.g. Mentor)
    try {
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token)
      if (user && !error) {
        return { user, caller }
      }
    } catch {
      // fallback to caller client below
    }
  }

  const {
    data: { user },
    error,
  } = await caller.auth.getUser()
  if (error || !user) {
    return { user: null, caller }
  }
  return { user, caller }
}
