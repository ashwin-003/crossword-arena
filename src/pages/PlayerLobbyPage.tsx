import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function PlayerLobbyPage() {
  const navigate = useNavigate()

  useEffect(() => {
    navigate('/join-game', { replace: true })
  }, [navigate])

  return null
}
