import { Badge } from '@/components/ui/Badge'
import type { PaperTradeStatus, TradeDirection, TradingMode } from '@/types/trading'

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

/** Per-trade execution mode — sourced from the trade record itself (`TradeRecord.mode`), never inferred from the deployment's current header indicator, so this stays correct even if a deployment's mode ever changed between when an older trade was created and now. */
export function ModeBadge({ mode }: { readonly mode: TradingMode }) {
  return <Badge tone={mode === 'LIVE' ? 'loss' : 'neutral'}>{mode}</Badge>
}
