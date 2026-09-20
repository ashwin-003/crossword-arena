import { useEffect, useRef } from 'react'
import { logGameEvent, recordInterruption } from '@/services/gameService'

/**
 * Realistic browser-level competition monitoring (spec sections 17–19).
 * This can observe and record signals — it cannot guarantee a player isn't
 * using a second device or taking a screenshot, and the UI built on top of
 * this never claims otherwise.
 */
export function useCompetitionMonitor({
  gameId,
  userId,
  active,
  isFullscreen,
  onInterruption,
  onRestored,
}: {
  gameId: string | undefined
  userId: string | undefined
  active: boolean
  isFullscreen: boolean
  onInterruption: (count: number) => void
  onRestored: () => void
}) {
  const wasFullscreenRef = useRef(isFullscreen)

  // Fullscreen exit/restore
  useEffect(() => {
    if (!active || !gameId || !userId) {
      wasFullscreenRef.current = isFullscreen
      return
    }
    if (wasFullscreenRef.current && !isFullscreen) {
      logGameEvent(gameId, userId, 'fullscreen_exited')
      recordInterruption(gameId).then(({ data }) => {
        if (typeof data === 'number') onInterruption(data)
      })
    } else if (!wasFullscreenRef.current && isFullscreen) {
      logGameEvent(gameId, userId, 'fullscreen_restored')
      onRestored()
    }
    wasFullscreenRef.current = isFullscreen
  }, [isFullscreen, active, gameId, userId, onInterruption, onRestored])

  // Visibility + focus monitoring
  useEffect(() => {
    if (!active || !gameId || !userId) return

    function onVisibilityChange() {
      logGameEvent(gameId!, userId!, 'visibility_changed', { hidden: document.hidden })
    }
    function onBlur() {
      logGameEvent(gameId!, userId!, 'focus_lost')
    }
    function onFocus() {
      logGameEvent(gameId!, userId!, 'focus_restored')
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [active, gameId, userId])
}
