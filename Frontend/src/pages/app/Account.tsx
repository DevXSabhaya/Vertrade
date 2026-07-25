import { useState } from 'react'
import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import { useAccountSummary, useResetPaperBalance } from '@/hooks/useAccount'
import { useAuth } from '@/store/auth-context'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { getErrorMessage } from '@/lib/error-message'

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
