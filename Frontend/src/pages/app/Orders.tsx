import { Seo } from '@/components/seo/Seo'
import { Badge } from '@/components/ui/Badge'
import { Table, TableHead, Th, TableBody, Td } from '@/components/ui/Table'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useOrders } from '@/hooks/useTrades'
import { DirectionBadge } from '@/features/trading/StatusBadge'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { QueueItemState } from '@/types/trading'

const stateTone: Record<QueueItemState, 'neutral' | 'gain' | 'loss' | 'brand' | 'warning'> = {
  QUEUED: 'warning',
  LOCKED: 'warning',
  PROCESSING: 'brand',
  SUBMITTED: 'brand',
  COMPLETED: 'gain',
  RETRYING: 'warning',
  FAILED: 'loss',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
}

export default function Orders() {
  const orders = useOrders()

  return (
    <>
      <Seo title="Orders" description="Your paper trading order history." path="/app/orders" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Orders</h1>

      <div className="mt-6">
        {orders.isLoading ? (
          <SkeletonRows rows={4} />
        ) : orders.isError ? (
          <ErrorState message="Couldn't load orders." onRetry={() => orders.refetch()} />
        ) : orders.data && orders.data.length > 0 ? (
          <Table caption="Paper trading orders">
            <TableHead>
              <Th>Symbol</Th>
              <Th>Side</Th>
              <Th>Quantity</Th>
              <Th>Price</Th>
              <Th>State</Th>
              <Th>Submitted</Th>
            </TableHead>
            <TableBody>
              {orders.data.map((order) => (
                <tr key={order.id}>
                  <Td className="font-medium text-ink-900">{order.request.rawSymbol}</Td>
                  <Td>
                    <DirectionBadge direction={order.request.direction} />
                  </Td>
                  <Td>{order.request.quantity}</Td>
                  <Td>{formatCurrency(order.request.entryTriggerPrice)}</Td>
                  <Td>
                    <Badge tone={stateTone[order.state]}>{order.state}</Badge>
                    {order.lastError && (
                      <p className="mt-1 max-w-xs text-xs text-loss-600">{order.lastError}</p>
                    )}
                  </Td>
                  <Td>{formatDateTime(order.createdAt)}</Td>
                </tr>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No orders yet" description="Orders you submit will appear here." />
        )}
      </div>
    </>
  )
}
