import { Trophy, Target, Users, Save, CloudCheck } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { TimerDisplay } from './TimerDisplay'
import { ConnectionStatusBadge } from './ConnectionStatusBadge'
import type { TimerWarningLevel } from '@/hooks/useGameTimer'
import type { ConnectionStatus } from '@/hooks/useRealtimeGame'
import type { SaveStatus } from '@/hooks/useCrosswordPlay'

export function MatchHud({
  timerFormatted,
  timerLevel,
  score,
  rank,
  totalParticipants,
  solvedCount,
  totalQuestions,
  participantCount,
  connectionStatus,
  saveStatus,
}: {
  timerFormatted: string
  timerLevel: TimerWarningLevel
  score: number
  rank: number | null
  totalParticipants: number
  solvedCount: number
  totalQuestions: number
  participantCount: number
  connectionStatus: ConnectionStatus
  saveStatus: SaveStatus
}) {
  const progressPct = totalQuestions > 0 ? Math.round((solvedCount / totalQuestions) * 100) : 0

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-5">
          <TimerDisplay formatted={timerFormatted} level={timerLevel} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="grid grid-cols-2 gap-4 py-5">
          <Stat icon={Trophy} label="Score" value={score.toLocaleString()} />
          <Stat icon={Target} label="Rank" value={rank ? `#${rank}` : '—'} sub={totalParticipants ? `of ${totalParticipants}` : undefined} />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-3 py-5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-display font-semibold uppercase tracking-wide text-text-secondary">Progress</span>
            <span className="font-mono text-text-primary">
              {solvedCount}/{totalQuestions}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-2.5 py-4 text-xs text-text-secondary">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              Players
            </span>
            <span className="font-semibold text-text-primary">{participantCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Connection</span>
            <ConnectionStatusBadge status={connectionStatus} />
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              {saveStatus === 'saving' ? <Save size={13} className="animate-pulse" /> : <CloudCheck size={13} />}
              Progress
            </span>
            <span className="font-semibold text-text-primary">{saveStatus === 'saving' ? 'Saving…' : 'Saved'}</span>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Trophy; label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon size={16} className="text-accent-cyan" />
      <span className="font-mono text-xl font-bold text-text-primary">{value}</span>
      <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-text-muted">
        {label} {sub && <span className="text-text-muted">{sub}</span>}
      </span>
    </div>
  )
}
