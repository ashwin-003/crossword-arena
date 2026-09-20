import { useEffect, useRef, useState } from 'react'

export type TimerWarningLevel = 'normal' | 'warning-1m' | 'warning-30s' | 'warning-10s' | 'expired'

function computeLevel(remainingSeconds: number): TimerWarningLevel {
  if (remainingSeconds <= 0) return 'expired'
  if (remainingSeconds <= 10) return 'warning-10s'
  if (remainingSeconds <= 30) return 'warning-30s'
  if (remainingSeconds <= 60) return 'warning-1m'
  return 'normal'
}

/**
 * Renders a countdown purely from the server's authoritative `endTime`.
 * There is no per-player backend timer loop — every client independently
 * derives "time remaining" from the same timestamp, and the server
 * separately enforces it via update-game-state when end_time passes.
 */
export function useGameTimer(endTime: string | null | undefined, onExpire?: () => void) {
  const [remainingSeconds, setRemainingSeconds] = useState(() => (endTime ? secondsUntil(endTime) : 0))
  const firedExpireRef = useRef(false)

  useEffect(() => {
    if (!endTime) return
    firedExpireRef.current = false

    function tick() {
      const remaining = secondsUntil(endTime!)
      setRemainingSeconds(remaining)
      if (remaining <= 0 && !firedExpireRef.current) {
        firedExpireRef.current = true
        onExpire?.()
      }
    }

    tick()
    const interval = window.setInterval(tick, 1000)
    return () => window.clearInterval(interval)
  }, [endTime, onExpire])

  const clamped = Math.max(0, remainingSeconds)
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  return { remainingSeconds: clamped, formatted, level: computeLevel(clamped) }
}

function secondsUntil(isoTime: string): number {
  return Math.round((new Date(isoTime).getTime() - Date.now()) / 1000)
}
