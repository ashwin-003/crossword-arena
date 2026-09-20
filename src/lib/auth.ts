/**
 * CROSSWORD ARENA authenticates with just a 6-digit batch number — no
 * password. Supabase Auth still requires *a* password internally to create
 * and authenticate the account, so we deterministically derive a fixed one
 * from the batch number itself (never shown to or typed by the player) and
 * map the batch number to a synthetic, unguessable-enough internal email
 * address. This exact derivation is duplicated in
 * `supabase/functions/register/index.ts` — if you change the formula here,
 * change it there too, or logins will stop matching what registration
 * created.
 */

const EMAIL_DOMAIN = 'players.crossword-arena.internal'

export const BATCH_NUMBER_PATTERN = /^\d{6}$/

export function isValidBatchNumber(value: string): boolean {
  return BATCH_NUMBER_PATTERN.test(value)
}

export function batchNumberToSyntheticEmail(batchNumber: string): string {
  return `p${batchNumber}@${EMAIL_DOMAIN}`
}

export function batchNumberToDerivedPassword(batchNumber: string): string {
  return `crossword-arena-${batchNumber}-internal`
}

export interface RegisterInput {
  name: string
  className: string
  batchNumber: string
}

export interface RegisterValidationError {
  field: 'name' | 'className' | 'batchNumber'
  message: string
}

export function validateRegisterInput(input: RegisterInput): RegisterValidationError[] {
  const errors: RegisterValidationError[] = []

  if (input.name.trim().length < 1 || input.name.trim().length > 80) {
    errors.push({ field: 'name', message: 'Enter your name.' })
  }
  if (input.className.trim().length < 1 || input.className.trim().length > 40) {
    errors.push({ field: 'className', message: 'Enter your class.' })
  }
  if (!isValidBatchNumber(input.batchNumber)) {
    errors.push({ field: 'batchNumber', message: 'Batch number must be exactly 6 digits.' })
  }

  return errors
}
