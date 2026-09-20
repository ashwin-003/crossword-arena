import { useState } from 'react'

export function useClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), resetAfterMs)
      return true
    } catch {
      return false
    }
  }

  return { copied, copy }
}
