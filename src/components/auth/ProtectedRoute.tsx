import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { FullScreenSpinner } from '@/components/ui/Spinner'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth()
  const location = useLocation()

  if (initializing) {
    return <FullScreenSpinner label="Loading your session…" />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
