// Uppercase charset with visually ambiguous characters removed: no 0/O, 1/I/L.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

export function generateGameCode(): string {
  let code = ''
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[bytes[i] % CHARSET.length]
  }
  return code
}
