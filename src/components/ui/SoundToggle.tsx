import { Volume2, VolumeX } from 'lucide-react'
import { useSound } from '@/hooks/useSound'

export function SoundToggle() {
  const { muted, toggleMuted } = useSound()
  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={muted}
      className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary transition hover:bg-surface hover:text-text-primary"
    >
      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
    </button>
  )
}
