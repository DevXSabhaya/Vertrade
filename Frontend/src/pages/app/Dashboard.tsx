import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePnlSummary } from '@/hooks/useAccount'
import { useActiveTrades, useTradeHistory } from '@/hooks/useTrades'
import { TradeStatusBadge, DirectionBadge } from '@/features/trading/StatusBadge'
import { formatCurrency, formatDateTime, formatPnlClass, signedCurrency } from '@/lib/format'

export default function Dashboard() {
  const pnl = usePnlSummary()
  const activeTrades = useActiveTrades()
  const recentHistory = useTradeHistory({ limit: 5, offset: 0 })

  return (
    <>
      <Seo title="Dashboard" description="Your paper trading dashboard." path="/app" noIndex />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Dashboard</h1>
        <Link to="/app/trade">
          <Button>New Paper Trade</Button>
        </Link>
      </div>

      <section aria-label="Account summary" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {pnl.isLoading ? (
          Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : pnl.isError ? (
          <div className="col-span-full">
            <ErrorState message="Couldn't load your account summary." onRetry={() => pnl.refetch()} />
          </div>
        ) : pnl.data ? (
          <>
            <Card>
              <CardHeading>Available Balance</CardHeading>
              <p className="mt-2 text-2xl font-bold text-ink-900">
                {formatCurrency(pnl.data.availableBalance)}
              </p>
            </Card>
            <Card>
              <CardHeading>Used Margin</CardHeading>
              <p className="mt-2 text-2xl font-bold text-ink-900">
                {formatCurrency(pnl.data.reservedMargin)}
              </p>
            </Card>
            <Card>
              <CardHeading>Equity</CardHeading>
              <p className="mt-2 text-2xl font-bold text-ink-900">{formatCurrency(pnl.data.equity)}</p>
            </Card>
            <Card>
              <CardHeading>Total P&amp;L</CardHeading>
              <p className={`mt-2 text-2xl font-bold ${formatPnlClass(pnl.data.totalPnl)}`}>
                {signedCurrency(pnl.data.totalPnl)}
              </p>
            </Card>
            <Card>
              <CardHeading>Realized P&amp;L</CardHeading>
              <p className={`mt-2 text-xl font-semibold ${formatPnlClass(pnl.data.realizedPnl)}`}>
                {signedCurrency(pnl.data.realizedPnl)}
              </p>
            </Card>
            <Card>
              <CardHeading>Unrealized P&amp;L</CardHeading>
              <p className={`mt-2 text-xl font-semibold ${formatPnlClass(pnl.data.unrealizedPnl)}`}>
                {signedCurrency(pnl.data.unrealizedPnl)}
              </p>
            </Card>
          </>
        ) : null}
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <CardHeading>Active Trades</CardHeading>
            <Link to="/app/active-trades" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-4">
            {activeTrades.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : activeTrades.isError ? (
              <ErrorState message="Couldn't load active trades." onRetry={() => activeTrades.refetch()} />
            ) : activeTrades.data && activeTrades.data.length > 0 ? (
              <ul className="flex flex-col divide-y divide-ink-100">
                {activeTrades.data.slice(0, 5).map((trade) => (
                  <li key={trade.id} className="flex items-center justify-between py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <DirectionBadge direction={trade.direction} />
                      <span className="font-medium text-ink-900">{trade.rawSymbol}</span>
                    </div>
                    <TradeStatusBadge status={trade.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No active trades yet"
                description="Place your first paper trade to see it here."
                action={
                  <Link to="/app/trade">
                    <Button size="sm">New Paper Trade</Button>
                  </Link>
                }
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardHeading>Recent Activity</CardHeading>
            <Link to="/app/history" className="text-xs font-medium text-brand-600 hover:underline">
              View history
            </Link>
          </div>
          <div className="mt-4">
            {recentHistory.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : recentHistory.isError ? (
              <ErrorState
                message="Couldn't load recent activity."
                onRetry={() => recentHistory.refetch()}
              />
            ) : recentHistory.data && recentHistory.data.length > 0 ? (
              <ul className="flex flex-col divide-y divide-ink-100">
                {recentHistory.data.map((trade) => (
                  <li key={trade.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">{trade.rawSymbol}</p>
                      <p className="text-xs text-ink-400">{formatDateTime(trade.updatedAt)}</p>
                    </div>
                    <TradeStatusBadge status={trade.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No activity yet" description="Your closed trades will appear here." />
            )}
          </div>
        </Card>
      </section>
    </>
  )
}
