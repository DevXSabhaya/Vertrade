import type { ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { TradeStatusBadge, DirectionBadge } from '@/features/trading/StatusBadge'
import { TargetProgress } from './TargetProgress'
import { TrailingStopStatus } from './TrailingStopStatus'
import { formatCurrency, formatPnlClass, signedCurrency } from '@/lib/format'
import type { PaperTradeView } from '@/types/trading'

interface TradeCardProps {
  readonly trade: PaperTradeView
  readonly action?: ReactNode
}

/**
 * The mobile-first counterpart to the desktop `<Table>` views — small
 * screens get a proper stacked layout instead of a horizontally-shrunk
 * table. Used by ActiveTrades/Positions/History behind an `sm:hidden` split
 * against their existing table markup.
 */
export function TradeCard({ trade, action }: TradeCardProps) {
  const pnl = trade.trade?.unrealizedPnl ?? trade.trade?.realizedPnl ?? null

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink-900">{trade.rawSymbol}</p>
          <div className="mt-1 flex items-center gap-2">
            <DirectionBadge direction={trade.direction} />
            <TradeStatusBadge status={trade.status} />
          </div>
        </div>
        {pnl !== null && (
          <p className={`text-right text-sm font-semibold ${formatPnlClass(pnl)}`}>
            {signedCurrency(pnl)}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-ink-400">Entry</dt>
          <dd className="text-ink-800">{formatCurrency(trade.entryTriggerPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">Stop Loss</dt>
          <dd className="text-ink-800">
            {formatCurrency(trade.trade?.currentStopLoss ?? trade.initialStopLoss)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-400">Quantity</dt>
          <dd className="text-ink-800">{trade.quantity}</dd>
        </div>
        {trade.trade && (
          <div>
            <dt className="text-xs text-ink-400">Trailing</dt>
            <dd>
              <TrailingStopStatus trailingEnabled={trade.trade.trailingEnabled} />
            </dd>
          </div>
        )}
      </dl>

      {trade.trade && trade.trade.targets.length > 0 && (
        <div>
          <p className="text-xs text-ink-400">Targets</p>
          <div className="mt-1">
            <TargetProgress targets={trade.trade.targets} currentTarget={trade.trade.currentTarget} />
          </div>
        </div>
      )}

      {trade.failureReason && (
        <p className="rounded-md bg-loss-50 px-2 py-1 text-xs text-loss-600">
          {trade.failureReason}
        </p>
      )}

      {action && <div className="pt-1">{action}</div>}
    </Card>
  )
}
