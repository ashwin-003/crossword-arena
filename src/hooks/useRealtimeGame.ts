import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchGameById } from '@/services/gameService'
import type { GameRow } from '@/types/database'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting'

/**
 * Keeps a single game row in sync via a Realtime Postgres Changes
 * subscription (status/start_time/end_time are the only things that ever
 * change on this row after creation). One row, so the UPDATE payload's
 * `new` is applied directly — no refetch needed.
 */
export function useRealtimeGame(gameId: string | undefined) {
  const [game, setGame] = useState<GameRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const previousStatusRef = useRef<ConnectionStatus>('connecting')

  useEffect(() => {
    if (!gameId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const data = await fetchGameById(gameId!)
      if (!cancelled) {
        setGame(data)
        setLoading(false)
      }
    }
    load()

    // Polling fallback: ensures status transitions (e.g. waiting -> active) trigger
    // immediately even if Realtime WebSocket events are delayed or publication is missing.
    const pollInterval = window.setInterval(async () => {
      if (cancelled) return
      try {
        const data = await fetchGameById(gameId!)
        if (!cancelled && data) {
          setGame((prev) => {
            if (!prev) return data
            if (prev.status !== data.status || prev.start_time !== data.start_time || prev.end_time !== data.end_time) {
              return data
            }
            return prev
          })
        }
      } catch {
        // ignore polling errors
      }
    }, 1500)

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          console.log('[useRealtimeGame] postgres_changes payload:', payload)
          setGame(payload.new as GameRow)
        }
      )
      .subscribe((status) => {
        console.log('[useRealtimeGame] subscribe status:', status)
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          if (previousStatusRef.current === 'reconnecting') {
            load()
          }
          previousStatusRef.current = 'connected'
          setConnectionStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          previousStatusRef.current = 'reconnecting'
          setConnectionStatus('reconnecting')
        }
      })

    return () => {
      cancelled = true
      window.clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { game, loading, connectionStatus, setGame }
}
