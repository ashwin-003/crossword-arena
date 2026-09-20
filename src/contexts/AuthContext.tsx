import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { UserRow } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  profile: UserRow | null
  /** True until the initial session check + profile fetch has resolved. */
  initializing: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserRow | null>(null)
  const [initializing, setInitializing] = useState(true)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle()
    if (error || !data) {
      // Profile does not exist (e.g. database wiped or account deleted).
      // Purge orphaned session so the client starts completely fresh.
      await supabase.auth.signOut().catch(() => {})
      setSession(null)
      setProfile(null)
      return null
    }
    const userRow = data as UserRow
    setProfile(userRow)
    return userRow
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (initialSession?.user) {
        const p = await loadProfile(initialSession.user.id)
        if (p) {
          setSession(initialSession)
        } else {
          setSession(null)
        }
      } else {
        setSession(null)
      }
      if (!cancelled) setInitializing(false)
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (nextSession?.user) {
        setSession(nextSession)
        loadProfile(nextSession.user.id)
      } else {
        setSession(null)
        setProfile(null)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      initializing,
      refreshProfile: async () => {
        if (session?.user) await loadProfile(session.user.id)
      },
    }),
    [session, profile, initializing]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
