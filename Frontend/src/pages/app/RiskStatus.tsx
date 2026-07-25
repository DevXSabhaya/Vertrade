import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { useRiskStatus, useRiskSnapshot } from '@/hooks/useRisk'
import { formatCurrency, formatDateTime } from '@/lib/format'
import type { CircuitBreakerStatus } from '@/types/risk'

const breakerTone: Record<CircuitBreakerStatus, 'gain' | 'warning' | 'loss'> = {
  CLOSED: 'gain',
  HALF_OPEN: 'warning',
  OPEN: 'loss',
}

export default function RiskStatus() {
  const status = useRiskStatus()
  const snapshot = useRiskSnapshot()

  return (
    <>
      <Seo title="Risk Status" description="Platform-wide risk controls status." path="/app/risk" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Risk Status</h1>
      <p className="mt-1 text-sm text-ink-500">
        These are platform-wide safety controls (kill switch, circuit breakers, daily loss
        limits) — not a personal risk score for your account.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading>Trading Status</CardHeading>
          {status.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : status.isError ? (
            <div className="mt-4">
              <ErrorState message="Couldn't load risk status." onRetry={() => status.refetch()} />
            </div>
          ) : status.data ? (
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Trading blocked</span>
                <Badge tone={status.data.tradingBlocked ? 'loss' : 'gain'}>
                  {status.data.tradingBlocked ? 'Blocked' : 'Trading allowed'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Kill switch</span>
                <Badge tone={status.data.killSwitchStatus === 'ACTIVE' ? 'gain' : 'loss'}>
                  {status.data.killSwitchStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Emergency stop</span>
                <Badge tone={status.data.emergencyStopActive ? 'loss' : 'gain'}>
                  {status.data.emergencyStopActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Cooldown</span>
                <Badge tone={status.data.cooldownActive ? 'warning' : 'neutral'}>
                  {status.data.cooldownActive ? 'Active' : 'None'}
                </Badge>
              </div>
              <p className="text-xs text-ink-400">As of {formatDateTime(status.data.asOf)}</p>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeading>Circuit Breakers</CardHeading>
          {status.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : status.data ? (
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {status.data.circuitBreakers.map((breaker) => (
                <li key={breaker.name} className="flex items-center justify-between">
                  <span className="text-ink-500">{breaker.name.replace('_', ' ')}</span>
                  <Badge tone={breakerTone[breaker.status]}>{breaker.status}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeading>Daily Snapshot</CardHeading>
          {snapshot.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : snapshot.isError ? (
            <div className="mt-4">
              <ErrorState message="Couldn't load risk snapshot." onRetry={() => snapshot.refetch()} />
            </div>
          ) : snapshot.data ? (
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-ink-400">Open trades</dt>
                <dd className="font-semibold text-ink-900">{snapshot.data.openTradeCount}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Total exposure</dt>
                <dd className="font-semibold text-ink-900">
                  {formatCurrency(snapshot.data.totalExposure)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Consecutive losses</dt>
                <dd className="font-semibold text-ink-900">{snapshot.data.consecutiveLosses}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Daily total P&amp;L</dt>
                <dd className="font-semibold text-ink-900">
                  {formatCurrency(snapshot.data.totalPnl)}
                </dd>
              </div>
            </dl>
          ) : null}
        </Card>
      </div>
    </>
  )
}
