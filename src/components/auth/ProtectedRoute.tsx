import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { FullScreenSpinner } from '@/components/ui/Spinner'
import { getUserRole } from '@/services/authService'

export function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: ReactNode
  allowedRole?: 'student' | 'mentor'
}) {
  const { session, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <FullScreenSpinner label="Loading your session…" />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (allowedRole) {
    const role = getUserRole()
    if (role !== allowedRole) {
      return <Navigate to={role === 'mentor' ? '/mentor' : '/join-game'} replace />
    }
  }

  return <>{children}</>
}
