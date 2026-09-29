import { useEffect, useRef, useState, useCallback } from 'react'
import { recordViolation, logGameEvent } from '@/services/gameService'

interface UseAntiMalpracticeOptions {
  gameId: string | undefined
  userId: string | undefined
  active: boolean // true only during active test (not submitted, countdown finished)
  initialCount?: number
  onViolation?: (count: number) => void
  onAutoSubmit?: () => void
}

export function useAntiMalpractice({
  gameId,
  userId,
  active,
  initialCount = 0,
  onViolation,
  onAutoSubmit,
}: UseAntiMalpracticeOptions) {
  const [violationCount, setViolationCount] = useState<number>(() => {
    if (gameId && userId) {
      try {
        const cached = localStorage.getItem(`ca_malpractice_${gameId}_${userId}`)
        if (cached) {
          const parsed = parseInt(cached, 10)
          if (!isNaN(parsed) && parsed > initialCount) return Math.min(parsed, 3)
        }
      } catch {
        // ignore storage error
      }
    }
    return Math.min(initialCount, 3)
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [isDuplicateTab, setIsDuplicateTab] = useState(false)

  const violationCountRef = useRef(violationCount)
  useEffect(() => {
    violationCountRef.current = violationCount
  }, [violationCount])

  const isAwayRef = useRef(false)
  const lastViolationTimeRef = useRef(0)
  const isAutoSubmittedRef = useRef(false)
  const tabIdRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36)
  )

  const onViolationRef = useRef(onViolation)
  useEffect(() => {
    onViolationRef.current = onViolation
  }, [onViolation])

  const onAutoSubmitRef = useRef(onAutoSubmit)
  useEffect(() => {
    onAutoSubmitRef.current = onAutoSubmit
  }, [onAutoSubmit])

  // Sync initialCount from parent/database when received
  useEffect(() => {
    if (typeof initialCount === 'number' && initialCount > violationCountRef.current) {
      const clamped = Math.min(initialCount, 3)
      setViolationCount(clamped)
      violationCountRef.current = clamped
      if (gameId && userId) {
        try {
          localStorage.setItem(`ca_malpractice_${gameId}_${userId}`, String(clamped))
        } catch {
          // ignore
        }
      }
      if (clamped >= 3 && !isAutoSubmittedRef.current) {
        isAutoSubmittedRef.current = true
        setModalOpen(true)
        onAutoSubmitRef.current?.()
      }
    }
  }, [initialCount, gameId, userId])

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Single Active Tab Detection (Multi-Tab Protection)
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId || !userId || !active) return

    const tabKey = `ca_active_tab_${gameId}_${userId}`
    const myTabId = tabIdRef.current
    let channel: BroadcastChannel | null = null

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel(`ca_tab_channel_${gameId}_${userId}`)
        channel.onmessage = (event) => {
          if (event.data?.type === 'CLAIM_ACTIVE_TAB' && event.data.tabId !== myTabId) {
            // Another tab is trying to join; tell them we are already active
            channel?.postMessage({ type: 'ACTIVE_TAB_ALREADY_EXISTS', tabId: myTabId })
          } else if (event.data?.type === 'ACTIVE_TAB_ALREADY_EXISTS' && event.data.tabId !== myTabId) {
            // We were informed another tab is already open!
            setIsDuplicateTab(true)
          }
        }
        // Ask if another tab exists
        channel.postMessage({ type: 'CLAIM_ACTIVE_TAB', tabId: myTabId })
      }
    } catch {
      // BroadcastChannel fallback to localStorage
    }

    // Check localStorage heartbeat
    try {
      const existingRaw = localStorage.getItem(tabKey)
      if (existingRaw) {
        const existing = JSON.parse(existingRaw)
        const now = Date.now()
        // If another tab has updated heartbeat within last 3.5s, block this one
        if (existing.tabId && existing.tabId !== myTabId && now - existing.ts < 3500) {
          setIsDuplicateTab(true)
        }
      }
    } catch {
      // ignore
    }

    // Start heartbeat for current tab
    const heartbeatInterval = window.setInterval(() => {
      try {
        localStorage.setItem(tabKey, JSON.stringify({ tabId: myTabId, ts: Date.now() }))
      } catch {
        // ignore
      }
    }, 1500)

    const handleBeforeUnload = () => {
      try {
        const raw = localStorage.getItem(tabKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.tabId === myTabId) {
            localStorage.removeItem(tabKey)
          }
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.clearInterval(heartbeatInterval)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (channel) {
        channel.close()
      }
      handleBeforeUnload()
    }
  }, [gameId, userId, active])

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Centralized Incident Handler (Deduplication)
  // ──────────────────────────────────────────────────────────────────────────
  const handleScreenLeft = useCallback(
    (reason: string) => {
      if (!active || !gameId || isAutoSubmittedRef.current) return

      // Deduplication Rule 1: If student is already marked as away for this incident, ignore
      if (isAwayRef.current) return

      // Deduplication Rule 2: Minimum 2.5s cooldown threshold between distinct incidents
      const now = Date.now()
      if (now - lastViolationTimeRef.current < 2500) return

      isAwayRef.current = true
      lastViolationTimeRef.current = now

      const current = violationCountRef.current
      const nextCount = Math.min(current + 1, 3)
      violationCountRef.current = nextCount
      setViolationCount(nextCount)

      // Synchronously cache to localStorage for instant reload resistance
      if (userId) {
        try {
          localStorage.setItem(`ca_malpractice_${gameId}_${userId}`, String(nextCount))
        } catch {
          // ignore
        }
      }

      onViolationRef.current?.(nextCount)

      // Authoritative backend sync via Edge Function
      recordViolation(gameId, reason)
        .then((res) => {
          if (res.data?.interruptionCount) {
            const serverCount = Math.min(res.data.interruptionCount, 3)
            if (serverCount > violationCountRef.current) {
              violationCountRef.current = serverCount
              setViolationCount(serverCount)
              if (userId) {
                try {
                  localStorage.setItem(`ca_malpractice_${gameId}_${userId}`, String(serverCount))
                } catch {
                  // ignore
                }
              }
            }
          }
        })
        .catch(() => {
          // Network hiccup - offline count is safely retained in state & localStorage
        })

      if (nextCount >= 3) {
        isAutoSubmittedRef.current = true
        setModalOpen(true)
        onAutoSubmitRef.current?.()
      }
    },
    [active, gameId, userId]
  )

  const handleScreenReturned = useCallback(() => {
    if (!active || !gameId || !userId) return

    // If the student was away, mark return and pop up warning modal if < 3
    if (isAwayRef.current) {
      isAwayRef.current = false
      logGameEvent(gameId, userId, 'screen_returned', { count: violationCountRef.current })

      if (violationCountRef.current > 0 && violationCountRef.current < 3) {
        setModalOpen(true)
      }
    }
  }, [active, gameId, userId])

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Browser & Mobile Event Listeners
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !gameId || isAutoSubmittedRef.current) return

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        handleScreenLeft('visibility_hidden')
      } else if (document.visibilityState === 'visible') {
        handleScreenReturned()
      }
    }

    function onBlur() {
      // Delay check slightly to prevent false positives from internal DOM focus transitions
      window.setTimeout(() => {
        if (typeof document.hasFocus === 'function' && document.hasFocus()) {
          return
        }
        handleScreenLeft('window_blur')
      }, 100)
    }

    function onFocus() {
      handleScreenReturned()
    }

    function onPageHide() {
      handleScreenLeft('pagehide')
    }

    function onPageShow() {
      handleScreenReturned()
    }

    function onFullscreenChange() {
      if (!document.fullscreenElement) {
        handleScreenLeft('fullscreen_exit')
      } else {
        handleScreenReturned()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [active, gameId, handleScreenLeft, handleScreenReturned])

  const acknowledgeWarning = useCallback(() => {
    setModalOpen(false)
  }, [])

  return {
    violationCount,
    modalOpen,
    isDuplicateTab,
    acknowledgeWarning,
    triggerViolation: handleScreenLeft,
  }
}
