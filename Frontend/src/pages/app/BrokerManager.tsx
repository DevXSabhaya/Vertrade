import { useState } from 'react'
import { Seo } from '@/components/seo/Seo'
import { Card, CardHeading } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { AddBrokerAccountModal } from '@/components/broker/AddBrokerAccountModal'
import { BrokerAccountCard } from '@/components/broker/BrokerAccountCard'
import {
  useActivateBrokerAccount,
  useAddBrokerAccount,
  useBrokerAccounts,
  useBrokers,
  useDisconnectBrokerAccount,
  useRemoveBrokerAccount,
  useReconnectBrokerAccount,
} from '@/hooks/useBrokerAccounts'
import { getErrorMessage } from '@/lib/error-message'
import type { BrokerAccount } from '@/types/broker'

/**
 * Phase 3: the multi-broker account catalog. Separate from Account.tsx's
 * existing "Broker Connection" card, which remains the single-session
 * env-credential-driven LIVE/PAPER toggle — this page is where a user
 * saves/activates/removes any number of broker accounts across every
 * broker the platform knows about.
 */
export default function BrokerManager() {
  const brokers = useBrokers()
  const accounts = useBrokerAccounts()
  const addAccount = useAddBrokerAccount()
  const activateAccount = useActivateBrokerAccount()
  const reconnectAccount = useReconnectBrokerAccount()
  const disconnectAccount = useDisconnectBrokerAccount()
  const removeAccount = useRemoveBrokerAccount()
  const toast = useToast()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)

  const brokerDisplayName = (brokerId: string): string =>
    brokers.data?.find((b) => b.id === brokerId)?.displayName ?? brokerId

  async function handleAdd(input: Parameters<typeof addAccount.mutateAsync>[0]) {
    await addAccount.mutateAsync(input)
    toast.show('Broker account saved.', 'success')
  }

  async function handleActivate(account: BrokerAccount) {
    setBusyAccountId(account.accountId)
    try {
      await activateAccount.mutateAsync(account.accountId)
      toast.show(`${account.displayName} activated.`, 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not activate this broker account.'), 'error')
    } finally {
      setBusyAccountId(null)
    }
  }

  async function handleReconnect(account: BrokerAccount) {
    setBusyAccountId(account.accountId)
    try {
      await reconnectAccount.mutateAsync(account.accountId)
      toast.show(`${account.displayName} reconnected.`, 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not reconnect this broker account.'), 'error')
    } finally {
      setBusyAccountId(null)
    }
  }

  async function handleDisconnect(account: BrokerAccount) {
    setBusyAccountId(account.accountId)
    try {
      await disconnectAccount.mutateAsync(account.accountId)
      toast.show(`${account.displayName} disconnected.`, 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not disconnect this broker account.'), 'error')
    } finally {
      setBusyAccountId(null)
    }
  }

  async function handleRemove() {
    if (!pendingRemoveId) return
    setBusyAccountId(pendingRemoveId)
    try {
      await removeAccount.mutateAsync(pendingRemoveId)
      toast.show('Broker account removed.', 'success')
    } catch (error) {
      toast.show(getErrorMessage(error, 'Could not remove this broker account.'), 'error')
    } finally {
      setBusyAccountId(null)
      setPendingRemoveId(null)
    }
  }

  return (
    <>
      <Seo title="Broker Manager" description="Manage your saved broker accounts." path="/app/brokers" noIndex />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Broker Manager</h1>
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          Add broker
        </Button>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-ink-500">
        Save credentials for any supported broker, then activate one at a time for Live trading.
        Paper trading works without any broker connected — Market Data is independent of which
        broker (if any) is active.
      </p>

      <Card className="mt-6">
        <CardHeading>Saved Accounts</CardHeading>
        <div className="mt-4">
          {accounts.isLoading ? (
            <SkeletonRows rows={3} />
          ) : accounts.isError ? (
            <ErrorState message="Couldn't load your broker accounts." onRetry={() => accounts.refetch()} />
          ) : !accounts.data || accounts.data.length === 0 ? (
            <EmptyState
              title="No broker accounts saved yet"
              description="Add a broker account to enable Live trading. Paper trading doesn't require one."
              action={
                <Button size="sm" onClick={() => setIsAddOpen(true)}>
                  Add your first broker
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.data.map((account) => (
                <BrokerAccountCard
                  key={account.accountId}
                  account={account}
                  brokerDisplayName={brokerDisplayName(account.brokerId)}
                  isBusy={busyAccountId === account.accountId}
                  onActivate={() => void handleActivate(account)}
                  onReconnect={() => void handleReconnect(account)}
                  onDisconnect={() => void handleDisconnect(account)}
                  onRemove={() => setPendingRemoveId(account.accountId)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      <AddBrokerAccountModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        brokers={brokers.data ?? []}
        onSubmit={handleAdd}
        isSubmitting={addAccount.isPending}
      />

      <Modal
        isOpen={pendingRemoveId !== null}
        onClose={() => setPendingRemoveId(null)}
        title="Remove this broker account?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingRemoveId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={removeAccount.isPending}
              onClick={() => void handleRemove()}
            >
              Remove
            </Button>
          </>
        }
      >
        This permanently deletes the saved account and its credentials. If it&apos;s currently
        active, it will be disconnected first. This cannot be undone.
      </Modal>
    </>
  )
}
