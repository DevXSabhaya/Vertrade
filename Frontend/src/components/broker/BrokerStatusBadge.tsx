import { Badge } from '@/components/ui/Badge'
import type { BrokerRuntimeStatus } from '@/types/broker'

const STATUS_CONFIG: Record<BrokerRuntimeStatus, { label: string; tone: 'gain' | 'loss' | 'warning' | 'neutral' }> = {
  CONNECTED: { label: 'Connected', tone: 'gain' },
  NOT_CONNECTED: { label: 'Not connected', tone: 'neutral' },
  REAUTH_REQUIRED: { label: 'Reauth required', tone: 'warning' },
  ERROR: { label: 'Error', tone: 'loss' },
  NOT_IMPLEMENTED: { label: 'Coming soon', tone: 'neutral' },
}

export function BrokerStatusBadge({ status }: { readonly status: BrokerRuntimeStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
