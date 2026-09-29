// POST /student-login
// { batchNumber: string, clientToken?: string }
//
// Securely verifies a student's batch number and atomically claims an active session.
// Enforces a strict maximum of ONE active login per batch number.
//
// If another user is already logged in with this batch number:
// Returns HTTP 409: "This batch number is already logged in. Please check your batch number and try again."
//
// If the same user reconnects/refreshes with their existing token:
// Reconnection succeeds and refreshes the session without creating a duplicate.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

interface StudentLoginBody {
  batchNumber?: string
  clientToken?: string
}

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `st_${hex}`
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405)

  let body: StudentLoginBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const batchNumber = (body.batchNumber ?? '').trim()
  const clientToken = (body.clientToken ?? '').trim() || null

  // Input validation: Must contain exactly 6 digits
  if (!/^\d{6}$/.test(batchNumber)) {
    return errorResponse('Invalid batch number', 400)
  }

  const admin = getAdminClient()

  // Atomically claim the session using database-level row locking.
  // This guarantees that race conditions (two simultaneous logins) result in
  // exactly one successful login and one rejection.
  const token = generateSessionToken()

  const { data: claimResult, error: claimError } = await admin.rpc('claim_student_session', {
    p_batch_number: batchNumber,
    p_token: token,
    p_client_token: clientToken,
    p_timeout_seconds: 1800, // 30 minutes of inactivity before auto-expiry
  })

  if (claimError) {
    console.error('Failed to claim student session:', claimError.message)
    return errorResponse('Unable to verify batch number right now.', 500)
  }

  if (!claimResult || !claimResult.ok) {
    if (claimResult?.error_code === 'ALREADY_LOGGED_IN') {
      return errorResponse(
        claimResult.message || 'This batch number is already logged in. Please check your batch number and try again.',
        409
      )
    }
    return errorResponse(claimResult?.message || 'Invalid batch number', 401)
  }

  const activeToken = claimResult.token || token

  return jsonResponse({
    ok: true,
    session: {
      token: activeToken,
      studentId: claimResult.student_id,
      batchNumber: claimResult.batch_number,
      name: `Student ${claimResult.batch_number}`,
    },
  })
})
