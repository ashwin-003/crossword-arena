import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchParticipants, sortParticipantsByBatch } from '@/services/gameService'
import type { ParticipantWithUser } from '@/types/database'
import { useToast } from '@/contexts/ToastContext'

interface UseGameParticipantsOptions {
  announceJoins?: boolean
  currentUserId?: string
}

/**
 * Live participant roster. Doubles as the live leaderboard data source
 * (participants carries live_score/live_solved_count) — one Realtime
 * subscription powers both the waiting room roster and the in-game
 * leaderboard, and only fires on real joins or real scoring events
 * (check_word_answer), never per keystroke.
 *
 * ORDERING: The participant list is ALWAYS sorted by batch_number ASC
 * after every fetch and every realtime event. This is deterministic
 * regardless of join order, DB insertion order, UUID, or event arrival order.
 */
export function useGameParticipants(gameId: string | undefined, options?: UseGameParticipantsOptions) {
  const [participants, setParticipants] = useState<ParticipantWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()
  const knownIds = useRef<Set<string>>(new Set())

  // Read through a ref so the subscription below never has to tear down
  // and reconnect just because these callback-adjacent values changed
  // (e.g. `currentUserId` arriving a beat after the profile loads) — the
  // realtime channel itself should only ever depend on `gameId`.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    let debounceHandle: number | undefined

    async function refresh(isInitial = false) {
      const data = await fetchParticipants(gameId!)
      if (cancelled) return

      // Deduplicate by user_id (keep first occurrence — DB query already
      // ordered by batch_number so the first entry is canonical).
      const seen = new Set<string>()
      const deduped = data.filter((p) => {
        if (seen.has(p.user_id)) return false
        seen.add(p.user_id)
        return true
      })

      // Always sort by batch_number ASC — deterministic regardless of join
      // order, UUID, or realtime arrival order.
      const sorted = sortParticipantsByBatch(deduped)

      const { announceJoins = false, currentUserId } = optionsRef.current ?? {}
      if (announceJoins && !isInitial) {
        for (const p of sorted) {
          if (!knownIds.current.has(p.user_id) && p.user_id !== currentUserId) {
            showToast({ variant: 'info', title: 'Player Joined', description: `${p.user?.name ?? 'A player'} joined the match.` })
          }
        }
      }
      knownIds.current = new Set(sorted.map((p) => p.user_id))
      setParticipants(sorted)
      setLoading(false)
    }

    refresh(true)

    const channel = supabase
      .channel(`participants:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameId}` },
        () => {
          window.clearTimeout(debounceHandle)
          // Debounce rapid-fire inserts (e.g. bulk joins) then re-fetch and
          // re-sort the full list — never just append the new row, which
          // would break the batch_number ordering guarantee.
          debounceHandle = window.setTimeout(() => refresh(false), 250)
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      window.clearTimeout(debounceHandle)
      supabase.removeChannel(channel)
    }
  }, [gameId, showToast])

  return { participants, loading }
}
