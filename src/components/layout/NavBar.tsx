import { Link, useNavigate } from 'react-router-dom'
import { History, LogOut, Swords } from 'lucide-react'
import { Logo } from './Logo'
import { SoundToggle } from '@/components/ui/SoundToggle'
import { useAuth } from '@/contexts/AuthContext'
import { logoutPlayer } from '@/services/authService'
import { useToast } from '@/contexts/ToastContext'

import { getUserRole } from '@/services/authService'

export function NavBar() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const isMentor = getUserRole() === 'mentor'

  async function handleLogout() {
    await logoutPlayer()
    showToast({ variant: 'info', title: 'Signed out' })
    navigate('/login')
  }

  const homePath = isMentor ? '/mentor' : '/join-game'

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={profile ? homePath : '/login'}>
          <Logo />
        </Link>
        {profile && (
          <nav className="flex items-center gap-1.5 sm:gap-2">
            {isMentor && (
              <>
                <Link
                  to="/mentor"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-surface hover:text-text-primary sm:px-3 sm:py-2"
                >
                  <Swords size={15} />
                  <span className="hidden xs:inline sm:inline">DASHBOARD</span>
                </Link>
                <Link
                  to="/history"
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-surface hover:text-text-primary sm:px-3 sm:py-2"
                >
                  <History size={15} />
                  <span className="hidden xs:inline sm:inline">HISTORY</span>
                </Link>
              </>
            )}

            <SoundToggle />
            <div className="mx-0.5 h-5 w-px bg-border-strong sm:mx-1 sm:h-6" />
            <span className="max-w-[7rem] truncate font-display text-xs font-bold text-text-primary sm:max-w-[12rem]">
              {profile.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-danger/10 hover:text-danger sm:px-3 sm:py-2"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">LOGOUT</span>
            </button>
          </nav>
        )}
      </div>
    </header>
  )
}
