import { Badge } from '@/components/ui/Badge'
import type { PaperTradeStatus, TradeDirection } from '@/types/trading'

const statusTone: Record<PaperTradeStatus, 'neutral' | 'gain' | 'loss' | 'brand' | 'warning'> = {
  PENDING: 'warning',
  OPEN: 'brand',
  CLOSED: 'neutral',
  FAILED: 'loss',
  CANCELLED: 'neutral',
}

export function TradeStatusBadge({ status }: { readonly status: PaperTradeStatus }) {
  return <Badge tone={statusTone[status]}>{status}</Badge>
}

export function DirectionBadge({ direction }: { readonly direction: TradeDirection }) {
  return <Badge tone={direction === 'LONG' ? 'gain' : 'loss'}>{direction}</Badge>
}
