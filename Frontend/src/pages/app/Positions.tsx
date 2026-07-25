import { Seo } from '@/components/seo/Seo'
import { Table, TableHead, Th, TableBody, Td } from '@/components/ui/Table'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePositions } from '@/hooks/useTrades'
import { TradeStatusBadge, DirectionBadge } from '@/features/trading/StatusBadge'
import { TradeCard } from '@/components/trading/TradeCard'
import { formatCurrency, formatPnlClass, signedCurrency } from '@/lib/format'

export default function Positions() {
  const positions = usePositions()

  return (
    <>
      <Seo title="Positions" description="Your open paper trading positions." path="/app/positions" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Positions</h1>

      <div className="mt-6">
        {positions.isLoading ? (
          <SkeletonRows rows={4} />
        ) : positions.isError ? (
          <ErrorState message="Couldn't load positions." onRetry={() => positions.refetch()} />
        ) : positions.data && positions.data.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 sm:hidden">
              {positions.data.map((position) => (
                <TradeCard key={position.id} trade={position} />
              ))}
            </div>

            <div className="hidden sm:block">
              <Table caption="Open positions">
                <TableHead>
                  <Th>Instrument</Th>
                  <Th>Direction</Th>
                  <Th>Quantity</Th>
                  <Th>Avg. Price</Th>
                  <Th>P&amp;L</Th>
                  <Th>Status</Th>
                </TableHead>
                <TableBody>
                  {positions.data.map((position) => (
                    <tr key={position.id}>
                      <Td className="font-medium text-ink-900">{position.rawSymbol}</Td>
                      <Td>
                        <DirectionBadge direction={position.direction} />
                      </Td>
                      <Td>{position.trade?.openQuantity ?? position.quantity}</Td>
                      <Td>
                        {formatCurrency(position.trade?.averagePrice ?? position.entryTriggerPrice)}
                      </Td>
                      <Td className={formatPnlClass(position.trade?.unrealizedPnl ?? 0)}>
                        {position.trade?.unrealizedPnl !== undefined && position.trade?.unrealizedPnl !== null
                          ? signedCurrency(position.trade.unrealizedPnl)
                          : '—'}
                      </Td>
                      <Td>
                        <TradeStatusBadge status={position.status} />
                      </Td>
                    </tr>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState
            title="No open positions"
            description="Positions from your active paper trades will appear here."
          />
        )}
      </div>
    </>
  )
}
