import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { Toaster } from '@/components/ui/Toaster'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { FullScreenSpinner } from '@/components/ui/Spinner'

import { getUserRole } from '@/services/authService'

// Route-level code splitting: each page ships in its own chunk so a first
// visit to /login doesn't pull in the crossword generator, the grid
// interaction engine, etc.
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const MentorDashboardPage = lazy(() => import('@/pages/MentorDashboardPage'))
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
const GamesHostedPage = lazy(() => import('@/pages/GamesHostedPage'))
const ParticipantsPage = lazy(() => import('@/pages/ParticipantsPage'))
const ActiveMatchesPage = lazy(() => import('@/pages/ActiveMatchesPage'))
function HomeRoute() {
  const { session, initializing } = useAuth()
  if (initializing) return <FullScreenSpinner />
  if (!session) return <Navigate to="/login" replace />
  const role = getUserRole()
  return role === 'mentor' ? <Navigate to="/mentor" replace /> : <Navigate to="/join-game" replace />
}

function LobbyRedirect() {
  const role = getUserRole()
  return <Navigate to={role === 'mentor' ? '/mentor' : '/join-game'} replace />
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
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/crossword/:gameCode/live" element={<SpectatorPage />} />

            <Route
              path="/mentor"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <MentorDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/games"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <GamesHostedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/participants"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <ParticipantsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mentor/active-matches"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <ActiveMatchesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/mentor/dashboard" element={<Navigate to="/mentor" replace />} />

            <Route path="/lobby" element={<LobbyRedirect />} />
            <Route
              path="/create-game"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <CreateGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-game/:draftId"
              element={
                <ProtectedRoute allowedRole="mentor">
                  <CreateGamePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/join-game"
              element={
                <ProtectedRoute allowedRole="student">
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
                <ProtectedRoute allowedRole="student">
                  <CompetitionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/game/:gameCode/monitor"
              element={
                <ProtectedRoute allowedRole="mentor">
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
                <ProtectedRoute allowedRole="mentor">
                  <GameHistoryDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute allowedRole="mentor">
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
