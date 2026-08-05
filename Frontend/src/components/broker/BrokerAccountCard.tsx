import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BrokerStatusBadge } from './BrokerStatusBadge'
import { formatDateTime } from '@/lib/format'
import type { BrokerAccount } from '@/types/broker'

interface BrokerAccountCardProps {
  readonly account: BrokerAccount
  readonly brokerDisplayName: string
  readonly onActivate: () => void
  readonly onReconnect: () => void
  readonly onDisconnect: () => void
  readonly onRemove: () => void
  readonly isBusy: boolean
}

/**
 * One saved broker account. Action set is driven entirely by
 * `runtimeStatus` — never by a client-side guess about what the backend
 * will allow, since `BrokerAccountService` is the actual source of truth
 * for what each action does (activate/reconnect/disconnect/remove).
 */
export function BrokerAccountCard({
  account,
  brokerDisplayName,
  onActivate,
  onReconnect,
  onDisconnect,
  onRemove,
  isBusy,
}: BrokerAccountCardProps) {
  const isImplemented = account.runtimeStatus !== 'NOT_IMPLEMENTED'
  const isConnected = account.runtimeStatus === 'CONNECTED'
  const needsReauth = account.runtimeStatus === 'REAUTH_REQUIRED'

  return (
    <Card className={account.isActive ? 'border-brand-300 ring-1 ring-brand-100' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">{account.displayName}</p>
          <p className="text-xs text-ink-500">{brokerDisplayName}</p>
        </div>
        <BrokerStatusBadge status={account.runtimeStatus} />
      </div>

      <dl className="mt-4 flex flex-col gap-2 text-xs">
        <div className="flex justify-between">
          <dt className="text-ink-500">Active</dt>
          <dd className="font-medium text-ink-900">{account.isActive ? 'Yes' : 'No'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-500">Last connected</dt>
          <dd className="font-medium text-ink-900">
            {account.lastConnectedAt ? formatDateTime(account.lastConnectedAt) : '—'}
          </dd>
        </div>
        {account.lastError && (
          <div className="mt-1 rounded-md bg-loss-50 px-2 py-1.5 text-loss-600">
            {account.lastError}
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
        {!isImplemented ? (
          <p className="text-xs text-ink-400">
            This broker&apos;s integration isn&apos;t live yet — saved for when it is.
          </p>
        ) : isConnected ? (
          <Button size="sm" variant="secondary" isLoading={isBusy} onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : needsReauth ? (
          <Button size="sm" variant="primary" isLoading={isBusy} onClick={onReconnect}>
            Reconnect
          </Button>
        ) : (
          <Button size="sm" variant="primary" isLoading={isBusy} onClick={onActivate}>
            Activate
          </Button>
        )}
        <Button size="sm" variant="ghost" isLoading={isBusy} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </Card>
  )
}
