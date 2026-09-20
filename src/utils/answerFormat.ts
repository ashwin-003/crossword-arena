/** Normalizes raw user input into the canonical answer form stored in the
 * database (`answer ~ '^[A-Z]{1,20}$'`): uppercase letters only. */
export function normalizeAnswer(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '')
}

export function isValidAnswer(raw: string): boolean {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return false
  const normalized = normalizeAnswer(trimmed)
  // Reject input that contained anything other than letters/spaces once
  // normalized (digits, punctuation) so the builder can point out the typo
  // rather than silently dropping characters.
  if (normalized.length !== trimmed.replace(/\s/g, '').length) return false
  return normalized.length >= 2 && normalized.length <= 20
}
