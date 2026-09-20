export function formatGameCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
}

export function isCompleteGameCode(value: string): boolean {
  return /^[A-Z0-9]{6}$/.test(value)
}
