import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { UserRow } from '@/types/database'
import { getStudentSession } from '@/services/authService'

interface AuthContextValue {
  session: Session | { user: { id: string; role: string; batchNumber?: string } } | null
  profile: UserRow | null
  /** True until the initial session check + profile fetch has resolved. */
  initializing: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | { user: { id: string; role: string; batchNumber?: string } } | null>(null)
  const [profile, setProfile] = useState<UserRow | null>(null)
  const [initializing, setInitializing] = useState(true)

  async function loadProfile(userId: string) {
    // 1. Check if user is a mentor
    const { data: mentorData, error: mentorError } = await supabase
      .from('mentors')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle()

    if (mentorError) {
      console.warn('Failed to query mentors table:', mentorError.message)
    }

    if (mentorData) {
      if (!mentorData.is_active) {
        console.warn('Mentor account is deactivated')
        await supabase.auth.signOut().catch(() => {})
        setSession(null)
        setProfile(null)
        return null
      }
      const mentorProfile: UserRow = {
        id: mentorData.auth_user_id, // Map to auth_user_id so ID comparisons match auth.uid()
        name: mentorData.name,
        class: 'Mentor',
        email: mentorData.email,
        is_active: mentorData.is_active,
        created_at: mentorData.created_at,
      }
      setProfile(mentorProfile)
      try {
        localStorage.setItem('ca_user_role', 'mentor')
      } catch {}
      return mentorProfile
    }

    // No mentor record found
    await supabase.auth.signOut().catch(() => {})
    setSession(null)
    setProfile(null)
    return null
  }

  function syncStudentSession(): boolean {
    const student = getStudentSession()
    if (student) {
      const studentProfile: UserRow = {
        id: student.studentId,
        name: student.name,
        class: student.batchNumber,
        batch_number: student.batchNumber,
        is_active: true,
        created_at: new Date().toISOString(),
      }
      setProfile(studentProfile)
      setSession({
        user: {
          id: student.studentId,
          role: 'student',
          batchNumber: student.batchNumber,
        },
      })
      return true
    }
    return false
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      // 1. Check student session first
      if (syncStudentSession()) {
        if (!cancelled) setInitializing(false)
        return
      }

      // 2. Otherwise check Supabase Auth session (mentor)
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()
      if (cancelled) return

      if (initialSession?.user) {
        setSession(initialSession)
        await loadProfile(initialSession.user.id)
      }
      if (!cancelled) setInitializing(false)
    }

    init()

    // Listen to custom student auth changes
    const onStudentAuthChange = () => {
      if (!syncStudentSession()) {
        setSession(null)
        setProfile(null)
      }
    }
    window.addEventListener('ca_student_auth_change', onStudentAuthChange)

    // Listen to Supabase Auth changes (mentor)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // If student is logged in, don't overwrite with null auth session
      if (getStudentSession()) {
        syncStudentSession()
        return
      }

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
      window.removeEventListener('ca_student_auth_change', onStudentAuthChange)
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      initializing,
      refreshProfile: async () => {
        if (syncStudentSession()) return
        if (session && 'user' in session && session.user && 'aud' in session.user) {
          await loadProfile(session.user.id)
        }
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
