import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Toaster } from '@/components/ui/Toaster'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { FullScreenSpinner } from '@/components/ui/Spinner'

// Route-level code splitting: each page ships in its own chunk so a first
// visit to /login doesn't pull in the crossword generator, the grid
// interaction engine, etc.
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/RegisterPage'))
const PlayerLobbyPage = lazy(() => import('@/pages/PlayerLobbyPage'))
const CreateGamePage = lazy(() => import('@/pages/CreateGamePage'))
const JoinGamePage = lazy(() => import('@/pages/JoinGamePage'))
const GameLobbyPage = lazy(() => import('@/pages/GameLobbyPage'))
const CompetitionPage = lazy(() => import('@/pages/CompetitionPage'))
const GameMonitorPage = lazy(() => import('@/pages/GameMonitorPage'))
const ResultsPage = lazy(() => import('@/pages/ResultsPage'))
const GameHistoryDetailPage = lazy(() => import('@/pages/GameHistoryDetailPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const SpectatorPage = lazy(() => import('@/pages/SpectatorPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

function HomeRoute() {
  const { session, initializing } = useAuth()
  if (initializing) return <FullScreenSpinner />
  return session ? <Navigate to="/lobby" replace /> : <LandingPage />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Suspense fallback={<FullScreenSpinner />}>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/crossword/:gameCode/live" element={<SpectatorPage />} />

            <Route
              path="/lobby"
              element={
                <ProtectedRoute>
                  <PlayerLobbyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-game"
              element={
                <ProtectedRoute>
                  <CreateGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-game/:draftId"
              element={
                <ProtectedRoute>
                  <CreateGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/join-game"
              element={
                <ProtectedRoute>
                  <JoinGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/lobby"
              element={
                <ProtectedRoute>
                  <GameLobbyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/competition"
              element={
                <ProtectedRoute>
                  <CompetitionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/monitor"
              element={
                <ProtectedRoute>
                  <GameMonitorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/results"
              element={
                <ProtectedRoute>
                  <ResultsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/history"
              element={
                <ProtectedRoute>
                  <GameHistoryDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <HistoryPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </ToastProvider>
    </AuthProvider>
  )
}
