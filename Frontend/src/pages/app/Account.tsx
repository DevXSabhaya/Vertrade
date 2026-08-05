import { useState } from 'react'
import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useAccountSummary, useResetPaperBalance } from '@/hooks/useAccount'
import {
  useBrokerAccountSummary,
  useBrokerStatus,
  useConnectBroker,
  useDisconnectBroker,
  useReconnectBroker,
  useSetTradingMode,
  useTradingMode,
} from '@/hooks/useTradingMode'
import { useAuth } from '@/store/auth-context'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/error-message'
import type { TradingMode } from '@/types/config'

const AUTH_STATUS_LABEL: Record<string, string> = {
  HEALTHY: 'Authenticated',
  WARNING: 'Degraded',
  DEGRADED: 'Degraded',
  DISCONNECTED: 'Disconnected',
  RECOVERING: 'Reconnecting',
  MAINTENANCE: 'Maintenance',
  UNKNOWN: 'Unknown',
}

/**
 * Lets the user switch the deployment's persisted trading mode
 * (`POST /config/trading-mode`). Every safety check — LIVE readiness,
 * broker credentials, live broker session — runs server-side in
 * `TradingModeService.setMode`; this component only surfaces the result
 * (success or the specific rejection reason), it never second-guesses or
 * retries around a failure. Switching modes only affects trades created
 * from this point on — any trade already in flight keeps the executor it
 * was pinned to at creation.
 */
function TradingModeCard() {
  const tradingMode = useTradingMode()
  const setTradingMode = useSetTradingMode()
  const toast = useToast()
  const [pendingTarget, setPendingTarget] = useState<TradingMode | null>(null)

  async function confirmSwitch() {
    const target = pendingTarget
    if (!target) return
    try {
      await setTradingMode.mutateAsync(target)
      toast.show(
        target === 'LIVE' ? 'Switched to Live Trading.' : 'Switched to Paper Trading.',
        'success',
      )
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not switch trading mode.'), 'error')
    } finally {
      setPendingTarget(null)
    }
  }

  const currentMode = tradingMode.data?.tradingMode

  return (
    <Card>
      <CardHeading>Trading Mode</CardHeading>
      {tradingMode.isLoading || !tradingMode.data ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <>
          <p className="mt-2 text-xs text-ink-500">
            Controls which executor every new trade in this deployment uses. Paper trading never
            places real broker orders; Live trading requires a valid broker connection.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant={currentMode === 'PAPER' ? 'primary' : 'secondary'}
              disabled={currentMode === 'PAPER'}
              onClick={() => setPendingTarget('PAPER')}
            >
              Paper Trading
            </Button>
            <Button
              size="sm"
              variant={currentMode === 'LIVE' ? 'primary' : 'secondary'}
              disabled={currentMode === 'LIVE'}
              onClick={() => setPendingTarget('LIVE')}
            >
              Live Trading
            </Button>
          </div>
          {tradingMode.data.defaultTradingMode !== currentMode && (
            <p className="mt-3 text-xs text-ink-400">
              Deployment default is {tradingMode.data.defaultTradingMode === 'LIVE' ? 'Live' : 'Paper'}
              ; this override is active until changed again.
            </p>
          )}
        </>
      )}

      <Modal
        isOpen={pendingTarget !== null}
        onClose={() => setPendingTarget(null)}
        title={pendingTarget === 'LIVE' ? 'Switch to Live Trading?' : 'Switch to Paper Trading?'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingTarget === 'LIVE' ? 'danger' : 'primary'}
              isLoading={setTradingMode.isPending}
              onClick={() => void confirmSwitch()}
            >
              Confirm
            </Button>
          </>
        }
      >
        {pendingTarget === 'LIVE' ? (
          <>
            New trades will place real orders through your connected broker using real money. The
            switch will be rejected if broker credentials aren&apos;t configured or a live broker
            session can&apos;t be established.
          </>
        ) : (
          <>
            New trades will run in the paper sandbox and never reach a real broker. Any trade
            already in progress is unaffected.
          </>
        )}
      </Modal>
    </Card>
  )
}

function BrokerConnectionCard() {
  const tradingMode = useTradingMode()
  const brokerStatus = useBrokerStatus()
  const accountSummary = useBrokerAccountSummary()
  const connectBroker = useConnectBroker()
  const disconnectBroker = useDisconnectBroker()
  const reconnectBroker = useReconnectBroker()
  const toast = useToast()

  const [isReconnectOpen, setIsReconnectOpen] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [reconnectError, setReconnectError] = useState('')

  async function handleConnect() {
    try {
      await connectBroker.mutateAsync()
      toast.show('Broker connected.', 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not connect the broker.'), 'error')
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectBroker.mutateAsync()
      toast.show('Broker disconnected.', 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not disconnect the broker.'), 'error')
    }
  }

  async function handleReconnect() {
    try {
      setReconnectError('')
      await reconnectBroker.mutateAsync(newToken.trim())
      toast.show('Broker reconnected successfully.', 'success')
      setIsReconnectOpen(false)
      setNewToken('')
    } catch (error) {
      setReconnectError(getErrorMessage(error, 'Could not reconnect the broker.'))
    }
  }

  return (
    <Card>
      <CardHeading>Broker Connection</CardHeading>
      {brokerStatus.isLoading || tradingMode.isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : brokerStatus.isError || !brokerStatus.data ? (
        <div className="mt-4">
          <ErrorState
            message="Couldn't load broker status."
            onRetry={() => brokerStatus.refetch()}
          />
        </div>
      ) : (
        <>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Mode</dt>
              <dd className="font-medium text-ink-900">
                {brokerStatus.data.tradingMode === 'LIVE' ? 'Live Trading' : 'Paper Trading'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Broker</dt>
              <dd className="font-medium text-ink-900">Dhan</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Connection</dt>
              <dd
                className={`inline-flex items-center gap-1.5 font-medium ${
                  brokerStatus.data.connected ? 'text-gain-600' : 'text-ink-500'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    brokerStatus.data.connected ? 'bg-gain-500' : 'bg-ink-300'
                  }`}
                  aria-hidden="true"
                />
                {brokerStatus.data.connected ? 'Connected' : 'Not connected'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Auth status</dt>
              <dd className="font-medium text-ink-900">
                {AUTH_STATUS_LABEL[brokerStatus.data.authStatus] ?? brokerStatus.data.authStatus}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Auth state</dt>
              <dd className={`font-medium ${
                brokerStatus.data.authState === 'AUTHENTICATED'
                  ? 'text-gain-600'
                  : brokerStatus.data.authState === 'REAUTH_REQUIRED'
                  ? 'text-loss-600 font-semibold'
                  : 'text-ink-900'
              }`}>
                {brokerStatus.data.authState === 'AUTHENTICATED' && 'Authenticated'}
                {brokerStatus.data.authState === 'REAUTH_REQUIRED' && 'Reauth Required'}
                {brokerStatus.data.authState === 'DISCONNECTED' && 'Disconnected'}
              </dd>
            </div>
            {brokerStatus.data.tokenExpiresAt && (
              <div className="flex justify-between">
                <dt className="text-ink-500">Token expires</dt>
                <dd className="font-medium text-ink-900">
                  {formatDateTime(brokerStatus.data.tokenExpiresAt)}
                </dd>
              </div>
            )}
            {brokerStatus.data.lastRefreshedAt && (
              <div className="flex justify-between">
                <dt className="text-ink-500">Last refreshed</dt>
                <dd className="font-medium text-ink-900">
                  {formatDateTime(brokerStatus.data.lastRefreshedAt)}
                </dd>
              </div>
            )}
            {brokerStatus.data.tradingMode === 'LIVE' && (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Market data</dt>
                  <dd className="font-medium text-ink-900">
                    {AUTH_STATUS_LABEL[brokerStatus.data.marketDataCapability] ??
                      brokerStatus.data.marketDataCapability}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Order execution</dt>
                  <dd className="font-medium text-ink-900">
                    {AUTH_STATUS_LABEL[brokerStatus.data.orderExecutionCapability] ??
                      brokerStatus.data.orderExecutionCapability}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Last connected</dt>
                  <dd className="font-medium text-ink-900">
                    {brokerStatus.data.lastSuccessfulConnectionAt
                      ? formatDateTime(brokerStatus.data.lastSuccessfulConnectionAt)
                      : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-500">Last health check</dt>
                  <dd className="font-medium text-ink-900">
                    {brokerStatus.data.lastHealthCheckAt
                      ? formatDateTime(brokerStatus.data.lastHealthCheckAt)
                      : '—'}
                  </dd>
                </div>
              </>
            )}
            {brokerStatus.data.clientCode && (
              <div className="flex justify-between">
                <dt className="text-ink-500">Client code</dt>
                <dd className="font-mono text-xs text-ink-900">{brokerStatus.data.clientCode}</dd>
              </div>
            )}
            {brokerStatus.data.tradingMode === 'PAPER' && (
              <p className="mt-1 text-xs text-ink-400">
                Paper trading never connects to a real broker — no live credentials are used while
                this mode is active.
              </p>
            )}
          </dl>

          {brokerStatus.data.authState === 'REAUTH_REQUIRED' && (
            <div className="mt-4 p-3 bg-loss-50 border border-loss-200 text-loss-600 rounded-lg text-xs font-medium flex flex-col gap-1">
              <span className="font-bold text-loss-700">Reconnect Required</span>
              <span>The broker session has expired or requires manual reconnection. Paste a new Dhan Access Token to restore Live trading capability.</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-5">
            <Button
              size="sm"
              isLoading={connectBroker.isPending}
              disabled={brokerStatus.data.connected || brokerStatus.data.authState === 'REAUTH_REQUIRED'}
              onClick={() => void handleConnect()}
            >
              {brokerStatus.data.connected ? 'Connected' : 'Connect'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              isLoading={disconnectBroker.isPending}
              disabled={!brokerStatus.data.connected}
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </Button>
            <Button
              size="sm"
              variant={brokerStatus.data.authState === 'REAUTH_REQUIRED' ? 'primary' : 'secondary'}
              onClick={() => setIsReconnectOpen(true)}
            >
              Reconnect Broker
            </Button>
          </div>

          {brokerStatus.data.tradingMode === 'LIVE' && (
            <div className="mt-5 border-t border-ink-100 pt-5">
              <h3 className="text-sm font-semibold text-ink-900">Account Summary</h3>
              {accountSummary.isLoading ? (
                <Skeleton className="mt-3 h-20 w-full" />
              ) : accountSummary.data && !accountSummary.data.supported ? (
                <p className="mt-2 text-xs text-ink-400">{accountSummary.data.reason}</p>
              ) : accountSummary.data ? (
                <dl className="mt-3 flex flex-col gap-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Available balance</dt>
                    <dd className="font-medium text-ink-900">
                      {accountSummary.data.availableBalance !== null
                        ? formatCurrency(accountSummary.data.availableBalance)
                        : 'Unsupported'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Used margin</dt>
                    <dd className="font-medium text-ink-900">
                      {accountSummary.data.usedMargin !== null
                        ? formatCurrency(accountSummary.data.usedMargin)
                        : 'Unsupported'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Available margin</dt>
                    <dd className="font-medium text-ink-900">
                      {accountSummary.data.availableMargin !== null
                        ? formatCurrency(accountSummary.data.availableMargin)
                        : 'Unsupported'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Today&apos;s realized P&amp;L</dt>
                    <dd className="font-medium text-ink-900">
                      {accountSummary.data.todaysRealizedPnl !== null
                        ? formatCurrency(accountSummary.data.todaysRealizedPnl)
                        : 'Unsupported'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Unrealized P&amp;L</dt>
                    <dd className="font-medium text-ink-900">
                      {accountSummary.data.unrealizedPnl !== null
                        ? formatCurrency(accountSummary.data.unrealizedPnl)
                        : 'Unsupported'}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={isReconnectOpen}
        onClose={() => {
          setIsReconnectOpen(false)
          setNewToken('')
          setReconnectError('')
        }}
        title="Reconnect Broker"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setIsReconnectOpen(false)
                setNewToken('')
                setReconnectError('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={reconnectBroker.isPending}
              disabled={!newToken.trim()}
              onClick={() => void handleReconnect()}
            >
              Reconnect
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            DhanHQ access tokens expire every 24 hours. Paste a fresh Dhan Access Token generated from your Dhan web console (My Profile &rarr; Access DhanHQ APIs) to restore live trading capability.
          </p>
          <Input
            label="Dhan Access Token"
            value={newToken}
            onChange={(e) => {
              setNewToken(e.target.value)
              setReconnectError('')
            }}
            placeholder="Paste your access token here..."
            error={reconnectError}
          />
        </div>
      </Modal>
    </Card>
  )
}

export default function Account() {
  const { user } = useAuth()
  const summary = useAccountSummary()
  const resetBalance = useResetPaperBalance()
  const toast = useToast()
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  async function handleReset() {
    try {
      await resetBalance.mutateAsync()
      toast.show('Your paper trading balance has been reset.', 'success')
      setIsConfirmOpen(false)
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not reset your balance.'), 'error')
      setIsConfirmOpen(false)
    }
  }

  return (
    <>
      <Seo title="Account" description="Your paper trading account settings." path="/app/account" noIndex />
      <h1 className="text-2xl font-bold text-ink-900">Account</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeading>Profile</CardHeading>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">Name</dt>
              <dd className="font-medium text-ink-900">{user?.displayName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Email</dt>
              <dd className="font-medium text-ink-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">Member since</dt>
              <dd className="font-medium text-ink-900">
                {user ? formatDateTime(user.createdAt) : '—'}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeading>Paper Trading Balance</CardHeading>
          {summary.isLoading ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : summary.isError ? (
            <div className="mt-4">
              <ErrorState message="Couldn't load your balance." onRetry={() => summary.refetch()} />
            </div>
          ) : summary.data ? (
            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-500">Initial balance</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(summary.data.initialBalance)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Available balance</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(summary.data.availableBalance)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Used margin</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(summary.data.reservedMargin)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Realized P&amp;L</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(summary.data.realizedPnl)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500">Unrealized P&amp;L</dt>
                <dd className="font-medium text-ink-900">
                  {formatCurrency(summary.data.unrealizedPnl)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink-100 pt-3">
                <dt className="font-medium text-ink-700">Total P&amp;L</dt>
                <dd className="font-semibold text-ink-900">
                  {formatCurrency(summary.data.totalPnl)}
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="mt-6 border-t border-ink-100 pt-5">
            <h3 className="text-sm font-semibold text-ink-900">Reset paper balance</h3>
            <p className="mt-1 text-xs text-ink-500">
              Resets your available balance back to the starting amount. This does not delete your
              trade history, and is blocked while you have pending or open trades.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-4"
              onClick={() => setIsConfirmOpen(true)}
            >
              Reset Paper Balance
            </Button>
          </div>
        </Card>

        <TradingModeCard />
        <BrokerConnectionCard />
      </div>

      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title="Reset your paper balance?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={resetBalance.isPending} onClick={() => void handleReset()}>
              Confirm Reset
            </Button>
          </>
        }
      >
        Your available balance will be restored to its starting amount. This cannot be undone, and
        will fail if you have any pending or open trades.
      </Modal>
    </>
  )
}
