import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Table, TableHead, Th, TableBody, Td } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useActiveTrades, useExitTrade, useCancelTrade } from '@/hooks/useTrades'
import { TradeStatusBadge, DirectionBadge } from '@/features/trading/StatusBadge'
import { TradeCard } from '@/components/trading/TradeCard'
import { formatCurrency, formatPnlClass, signedCurrency } from '@/lib/format'
import { getErrorMessage } from '@/lib/error-message'
import type { PaperTradeView } from '@/types/trading'

export default function ActiveTrades() {
  const activeTrades = useActiveTrades()
  const exitTrade = useExitTrade()
  const cancelTrade = useCancelTrade()
  const toast = useToast()
  const [confirmTarget, setConfirmTarget] = useState<PaperTradeView | null>(null)

  async function handleConfirmExit() {
    if (!confirmTarget) return
    try {
      await exitTrade.mutateAsync(confirmTarget.id)
      toast.show(`Exited ${confirmTarget.rawSymbol}.`, 'success')
      setConfirmTarget(null)
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not exit this trade.'), 'error')
    }
  }

  async function handleCancel(trade: PaperTradeView) {
    try {
      await cancelTrade.mutateAsync(trade.id)
      toast.show(`Cancelled ${trade.rawSymbol}.`, 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not cancel this trade.'), 'error')
    }
  }

  return (
    <>
      <Seo title="Active Trades" description="Your open paper trades." path="/app/active-trades" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Active Trades</h1>

      <div className="mt-6">
        {activeTrades.isLoading ? (
          <SkeletonRows rows={4} />
        ) : activeTrades.isError ? (
          <ErrorState message="Couldn't load active trades." onRetry={() => activeTrades.refetch()} />
        ) : activeTrades.data && activeTrades.data.length > 0 ? (
          <>
            {/* Mobile: stacked cards, not a shrunk table. */}
            <div className="flex flex-col gap-4 sm:hidden">
              {activeTrades.data.map((trade) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  action={
                    trade.status === 'OPEN' ? (
                      <Button size="sm" variant="danger" className="w-full" onClick={() => setConfirmTarget(trade)}>
                        Exit
                      </Button>
                    ) : trade.status === 'PENDING' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        isLoading={cancelTrade.isPending}
                        onClick={() => void handleCancel(trade)}
                      >
                        Cancel
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>

            <div className="hidden sm:block">
              <Table caption="Active paper trades">
                <TableHead>
                  <Th>Symbol</Th>
                  <Th>Direction</Th>
                  <Th>Status</Th>
                  <Th>Entry</Th>
                  <Th>Stop Loss</Th>
                  <Th>Qty</Th>
                  <Th>P&amp;L</Th>
                  <Th>Actions</Th>
                </TableHead>
                <TableBody>
                  {activeTrades.data.map((trade) => (
                    <tr key={trade.id}>
                      <Td className="font-medium text-ink-900">{trade.rawSymbol}</Td>
                      <Td>
                        <DirectionBadge direction={trade.direction} />
                      </Td>
                      <Td>
                        <TradeStatusBadge status={trade.status} />
                      </Td>
                      <Td>{formatCurrency(trade.entryTriggerPrice)}</Td>
                      <Td>{formatCurrency(trade.trade?.currentStopLoss ?? trade.initialStopLoss)}</Td>
                      <Td>{trade.quantity}</Td>
                      <Td className={formatPnlClass(trade.trade?.unrealizedPnl ?? 0)}>
                        {trade.trade?.unrealizedPnl !== undefined && trade.trade?.unrealizedPnl !== null
                          ? signedCurrency(trade.trade.unrealizedPnl)
                          : '—'}
                      </Td>
                      <Td>
                        <div className="flex gap-2">
                          {trade.status === 'OPEN' && (
                            <Button size="sm" variant="danger" onClick={() => setConfirmTarget(trade)}>
                              Exit
                            </Button>
                          )}
                          {trade.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              isLoading={cancelTrade.isPending}
                              onClick={() => void handleCancel(trade)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            title="No active trades"
            description="Your open paper trades will appear here once you place one."
            action={
              <Link to="/app/trade">
                <Button size="sm">New Paper Trade</Button>
              </Link>
            }
          />
        )}
      </div>

      <Modal
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        title={`Exit ${confirmTarget?.rawSymbol ?? ''}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={exitTrade.isPending} onClick={() => void handleConfirmExit()}>
              Confirm Exit
            </Button>
          </>
        }
      >
        This will close your entire position in {confirmTarget?.rawSymbol} at the current market
        price. This action cannot be undone.
      </Modal>
    </>
  )
}
