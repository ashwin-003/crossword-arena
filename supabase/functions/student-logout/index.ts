// POST /student-logout
//
// Invalidate the active student session on the server.
// Immediately marks the batch number as available for new logins.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  let body: { batchNumber?: string; token?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const rawAuth = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
  const bearerVal = rawAuth.replace(/^Bearer\s+/i, '').trim()
  // Student tokens are generated as "st_<hex>". If client sent student token in header, use it.
  const token = (body.token && body.token.trim()) || (bearerVal.startsWith('st_') ? bearerVal : null)
  const batchNumber = (body.batchNumber && body.batchNumber.trim()) || null

  const admin = getAdminClient()

  if (batchNumber || token) {
    try {
      await admin.rpc('release_student_session', {
        p_token: token,
        p_batch_number: batchNumber,
      })
    } catch (err) {
      console.error('release_student_session RPC error:', err)
    }

    // Direct update via admin client as a guaranteed fallback
    try {
      if (batchNumber) {
        await admin.from('student_sessions').update({ is_active: false }).eq('batch_number', batchNumber)
      } else if (token) {
        await admin.from('student_sessions').update({ is_active: false }).eq('token', token)
      }
    } catch (err) {
      console.error('Direct update error:', err)
    }
  }

  return jsonResponse({ ok: true })
})
