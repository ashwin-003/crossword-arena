import { useCallback, useEffect, useState } from 'react'
import * as sound from '@/lib/sound'

/**
 * Thin React wrapper around the Web-Audio sound module so components get
 * a reactive `muted` flag (for the toggle button) alongside the actual
 * play functions.
 */
export function useSound() {
  const [muted, setMuted] = useState(() => sound.isSoundMuted())

  useEffect(() => {
    sound.setSoundMuted(muted)
  }, [muted])

  const toggleMuted = useCallback(() => setMuted((m) => !m), [])

  return {
    muted,
    toggleMuted,
    playCorrect: sound.playCorrect,
    playTick: sound.playTick,
    playAlert: sound.playAlert,
    playFanfare: sound.playFanfare,
    playStart: sound.playStart,
  }
}
