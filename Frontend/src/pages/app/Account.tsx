import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { useAccountSummary, useResetPaperBalance } from '@/hooks/useAccount'
import { useSelectBroker, useSetTradingMode, useTradingMode } from '@/hooks/useTradingMode'
import { useBrokerAccounts } from '@/hooks/useBrokerAccounts'
import { useAuth } from '@/store/auth-context'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/error-message'
import type { TradingMode } from '@/types/config'
import type { BrokerAccount } from '@/types/broker'

interface BrokerAccountPickerProps {
  readonly accounts: readonly BrokerAccount[]
  readonly selectedAccountId: string | null
  readonly onSelect: (accountId: string) => void
  readonly name: string
}

function BrokerAccountPicker({ accounts, selectedAccountId, onSelect, name }: BrokerAccountPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
        Select broker
      </span>
      <div className="flex flex-col gap-2 rounded-lg border border-ink-100 p-2">
        {accounts.map((account) => (
          <label
            key={account.accountId}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-ink-50"
          >
            <input
              type="radio"
              name={name}
              checked={selectedAccountId === account.accountId}
              onChange={() => onSelect(account.accountId)}
              className="h-4 w-4"
            />
            <span className="font-medium text-ink-900">{account.displayName}</span>
            <span className="text-xs text-ink-400">{account.brokerId}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * Lets the user switch their own trading mode
 * (`POST /config/trading-mode`) and, when Live, which of their own saved
 * broker accounts executes their trades. Every safety check — broker
 * ownership, real credential validation for the selected account — runs
 * server-side in `TradingModeService`; this component only surfaces the
 * result (success or the specific rejection reason). Switching modes only
 * affects trades created from this point on — any trade already in flight
 * keeps the executor/account it was pinned to at creation.
 */
function TradingModeCard() {
  const tradingMode = useTradingMode()
  const brokerAccounts = useBrokerAccounts()
  const setTradingMode = useSetTradingMode()
  const selectBroker = useSelectBroker()
  const toast = useToast()
  const [pendingTarget, setPendingTarget] = useState<TradingMode | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isChangeBrokerOpen, setIsChangeBrokerOpen] = useState(false)
  const [changeBrokerAccountId, setChangeBrokerAccountId] = useState<string | null>(null)

  const currentMode = tradingMode.data?.tradingMode
  const accounts = brokerAccounts.data ?? []

  function startSwitch(target: TradingMode) {
    if (target === 'LIVE' && accounts.length === 0) {
      toast.show('You need to connect a broker before enabling Live Trading.', 'error')
      return
    }
    setSelectedAccountId(target === 'LIVE' ? (accounts[0]?.accountId ?? null) : null)
    setPendingTarget(target)
  }

  async function confirmSwitch() {
    const target = pendingTarget
    if (!target) return
    try {
      await setTradingMode.mutateAsync({
        mode: target,
        ...(target === 'LIVE' && selectedAccountId ? { brokerAccountId: selectedAccountId } : {}),
      })
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

  async function confirmChangeBroker() {
    if (!changeBrokerAccountId) return
    try {
      await selectBroker.mutateAsync(changeBrokerAccountId)
      toast.show('Live broker updated.', 'success')
      setIsChangeBrokerOpen(false)
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not change broker.'), 'error')
    }
  }

  const selectedAccount = accounts.find(
    (account) => account.accountId === tradingMode.data?.selectedBrokerAccountId,
  )

  return (
    <Card>
      <CardHeading>Trading Mode</CardHeading>
      {tradingMode.isLoading || !tradingMode.data ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <>
          <p className="mt-2 text-xs text-ink-500">
            Controls which executor your new trades use. Paper trading never places real broker
            orders; Live trading requires a valid connected broker account of your own.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant={currentMode === 'PAPER' ? 'primary' : 'secondary'}
              disabled={currentMode === 'PAPER'}
              onClick={() => startSwitch('PAPER')}
            >
              Paper Trading
            </Button>
            <Button
              size="sm"
              variant={currentMode === 'LIVE' ? 'primary' : 'secondary'}
              disabled={currentMode === 'LIVE'}
              onClick={() => startSwitch('LIVE')}
            >
              Live Trading
            </Button>
          </div>
          {currentMode === 'LIVE' && tradingMode.data.selectedBrokerAccountId && (
            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3 text-xs">
              <span className="text-ink-500">
                Trading through{' '}
                <span className="font-medium text-ink-900">
                  {selectedAccount?.displayName ?? 'your selected broker'}
                </span>
              </span>
              <button
                type="button"
                className="font-medium text-brand-600 hover:text-brand-700"
                onClick={() => {
                  setChangeBrokerAccountId(tradingMode.data?.selectedBrokerAccountId ?? null)
                  setIsChangeBrokerOpen(true)
                }}
              >
                Change broker
              </button>
            </div>
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
              disabled={pendingTarget === 'LIVE' && !selectedAccountId}
              onClick={() => void confirmSwitch()}
            >
              Confirm
            </Button>
          </>
        }
      >
        {pendingTarget === 'LIVE' ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">
              New trades will place real orders through your selected broker using real money. The
              switch will be rejected if the selected account&apos;s credentials aren&apos;t valid
              right now.
            </p>
            <BrokerAccountPicker
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
              name="live-broker-account"
            />
          </div>
        ) : (
          <>
            New trades will run in the paper sandbox and never reach a real broker. Any trade
            already in progress is unaffected.
          </>
        )}
      </Modal>

      <Modal
        isOpen={isChangeBrokerOpen}
        onClose={() => setIsChangeBrokerOpen(false)}
        title="Change Live Broker"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsChangeBrokerOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={selectBroker.isPending}
              disabled={!changeBrokerAccountId}
              onClick={() => void confirmChangeBroker()}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            Every account stays connected — only the account your new trades execute through
            changes.
          </p>
          <BrokerAccountPicker
            accounts={accounts}
            selectedAccountId={changeBrokerAccountId}
            onSelect={setChangeBrokerAccountId}
            name="change-broker-account"
          />
        </div>
      </Modal>
    </Card>
  )
}

/**
 * Broker connection/session management lives entirely in Broker Manager
 * (`/app/brokers`) — the single, per-account-scoped location for
 * connect/reconnect/disconnect/remove (see item 6/10 of the broker
 * architecture refactor). This card is deliberately just a pointer there,
 * not a second broker UI.
 */
function BrokerManagementLinkCard() {
  return (
    <Card>
      <CardHeading>Broker Connections</CardHeading>
      <p className="mt-2 text-xs text-ink-500">
        Connect, reconnect, or disconnect your broker accounts from Broker Manager — the single
        place every saved broker connection is managed.
      </p>
      <Link
        to="/app/brokers"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Manage broker connections
        <span aria-hidden="true">&rarr;</span>
      </Link>
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
        <BrokerManagementLinkCard />
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
