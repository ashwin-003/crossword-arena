// POST /student-login
// { batchNumber: string }
//
// Securely verifies a student's batch number against public.students.
// Students do NOT have Supabase Auth accounts, passwords, or emails.
// The frontend never enumerates or queries public.students directly.
//
// On success:
// 1. Validates the 6-digit numeric batch number.
// 2. Checks existence in public.students table via service-role client.
// 3. UPSERTs a student session on batch_number (unique constraint ensures
//    one row per student). This guarantees the student always gets the SAME
//    session.id, which prevents duplicate participant rows in games.
// 4. Returns: { ok: true, session: { token, studentId, batchNumber, name } }
//
// On failure:
// Returns { ok: false, error: 'Invalid batch number' } with HTTP 401.

import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

interface StudentLoginBody {
  batchNumber?: string
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

  // Input validation: Must contain exactly 6 digits
  if (!/^\d{6}$/.test(batchNumber)) {
    return errorResponse('Invalid batch number', 400)
  }

  const admin = getAdminClient()

  // Securely verify against public.students
  const { data: student, error: studentError } = await admin
    .from('students')
    .select('batch_number')
    .eq('batch_number', batchNumber)
    .maybeSingle()

  if (studentError) {
    console.error('Database error checking students:', studentError.message)
    return errorResponse('Unable to verify batch number right now.', 500)
  }

  if (!student) {
    return errorResponse('Invalid batch number', 401)
  }

  // Batch number is valid.
  // UPSERT the session on the unique batch_number constraint.
  // This ensures each student always has EXACTLY ONE session row with
  // a stable `id` (UUID). That stable id becomes `user_id` in participants,
  // preventing duplicate participant rows when a student logs in multiple times.
  const token = generateSessionToken()
  const now = new Date().toISOString()

  const { data: sessionRow, error: sessionError } = await admin
    .from('student_sessions')
    .upsert(
      {
        batch_number: batchNumber,
        token,
        created_at: now,
        last_seen_at: now,
      },
      {
        onConflict: 'batch_number',
        ignoreDuplicates: false, // update the token and last_seen_at on conflict
      }
    )
    .select('id, batch_number')
    .single()

  if (sessionError || !sessionRow) {
    console.error('Failed to upsert student session:', sessionError?.message)
    return errorResponse('Unable to establish student session.', 500)
  }

  return jsonResponse({
    ok: true,
    session: {
      token,
      studentId: sessionRow.id,
      batchNumber: sessionRow.batch_number,
      name: `Student ${sessionRow.batch_number}`,
    },
  })
})
