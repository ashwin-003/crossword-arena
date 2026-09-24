// POST /register
// { name: string, className: string, batchNumber: string }
//
// Creates the Supabase Auth user (secure hashing handled entirely by
// GoTrue) and, via the on_auth_user_created trigger, the matching
// public.users profile row. There is no player-facing password — accounts
// are identified purely by batch number, and a fixed internal password is
// derived from it so Supabase Auth (which requires *a* password) still
// works under the hood. Batch-number uniqueness is double-checked here for
// a friendly error message, and is still enforced at the database level as
// the source of truth.
import { handleOptions, jsonResponse, errorResponse } from '../_shared/cors.ts'
import { getAdminClient } from '../_shared/supabaseAdmin.ts'

const BATCH_NUMBER_PATTERN = /^\d{6}$/
const EMAIL_DOMAIN = 'players.crossword-arena.internal'

interface RegisterBody {
  name?: string
  className?: string
  batchNumber?: string
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  let body: RegisterBody
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body', 400)
  }

  const name = (body.name ?? '').trim()
  const className = (body.className ?? '').trim()
  const batchNumber = (body.batchNumber ?? '').trim()

  if (name.length < 1 || name.length > 80) {
    return errorResponse('Name is required.', 422)
  }
  if (className.length < 1 || className.length > 40) {
    return errorResponse('Class is required.', 422)
  }
  if (!BATCH_NUMBER_PATTERN.test(batchNumber)) {
    return errorResponse('Batch number must be exactly 6 digits.', 422)
  }

  const admin = getAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('students')
    .select('id')
    .eq('batch_number', batchNumber)
    .maybeSingle()

  if (existingError) {
    return errorResponse('Unable to validate batch number right now.', 500, existingError.message)
  }
  if (existing) {
    return errorResponse('That batch number is already registered.', 409)
  }

  const email = `p${batchNumber}@${EMAIL_DOMAIN}`
  const password = `crossword-arena-${batchNumber}-internal`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, class: className, batch_number: batchNumber },
  })

  if (createError || !created?.user) {
    const message = createError?.message ?? 'Unable to create account.'
    const status = message.toLowerCase().includes('already') ? 409 : 500
    return errorResponse('Unable to create account.', status, message)
  }

  // Insert profile into public.students
  await admin.from('students').insert({
    auth_user_id: created.user.id,
    name,
    class: className,
    batch_number: batchNumber,
    is_active: true,
  })

  return jsonResponse({ ok: true, userId: created.user.id })
})
