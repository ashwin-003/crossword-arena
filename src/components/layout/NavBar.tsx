import { Link, useNavigate } from 'react-router-dom'
import { History, LogOut, Swords } from 'lucide-react'
import { Logo } from './Logo'
import { SoundToggle } from '@/components/ui/SoundToggle'
import { useAuth } from '@/contexts/AuthContext'
import { logoutPlayer } from '@/services/authService'
import { useToast } from '@/contexts/ToastContext'

export function NavBar() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { showToast } = useToast()

  async function handleLogout() {
    await logoutPlayer()
    showToast({ variant: 'info', title: 'Signed out' })
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to={profile ? '/lobby' : '/'}>
          <Logo />
        </Link>
        {profile && (
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/lobby"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-surface hover:text-text-primary sm:flex"
            >
              <Swords size={15} />
              Lobby
            </Link>
            <Link
              to="/history"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-surface hover:text-text-primary"
            >
              <History size={15} />
              <span className="hidden sm:inline">History</span>
            </Link>
            <SoundToggle />
            <div className="mx-1 hidden h-6 w-px bg-border-strong sm:block" />
            <span className="hidden max-w-[10rem] truncate text-xs font-semibold text-text-secondary sm:inline">
              {profile.name}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-danger/10 hover:text-danger"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </nav>
        )}
      </div>
    </header>
  )
}
