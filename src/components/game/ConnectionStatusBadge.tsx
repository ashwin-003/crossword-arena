import { Badge } from '@/components/ui/Badge'
import type { ConnectionStatus } from '@/hooks/useRealtimeGame'

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  if (status === 'connected') {
    return (
      <Badge tone="success" pulse>
        Connected
      </Badge>
    )
  }
  if (status === 'reconnecting') {
    return <Badge tone="warning">Reconnecting…</Badge>
  }
  return <Badge tone="neutral">Connecting…</Badge>
}
