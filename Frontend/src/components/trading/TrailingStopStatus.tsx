import { Badge } from '@/components/ui/Badge'

/**
 * `CreatePaperTradeDto` (backend) does not currently accept a trailing-stop
 * configuration at trade creation — only `TradeRecord.trailingEnabled` is
 * exposed as a read-only field once a trade exists. This component is
 * deliberately read-only for the same reason: showing a trailing "toggle" on
 * the trade form would suggest a capability the backend doesn't accept yet.
 */
export function TrailingStopStatus({ trailingEnabled }: { readonly trailingEnabled: boolean }) {
  return trailingEnabled ? (
    <Badge tone="brand">Trailing SL active</Badge>
  ) : (
    <Badge tone="neutral">Fixed stop-loss</Badge>
  )
}
