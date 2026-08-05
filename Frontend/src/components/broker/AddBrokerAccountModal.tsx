import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { BrokerMetadata, BrokerId } from '@/types/broker'

interface AddBrokerAccountModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly brokers: readonly BrokerMetadata[]
  readonly onSubmit: (input: {
    brokerId: BrokerId
    displayName: string
    clientId: string
    accessToken: string
  }) => Promise<void>
  readonly isSubmitting: boolean
}

type Step = 'select-broker' | 'credentials'

/**
 * Two-step onboarding: pick a broker from the platform's catalog, then
 * supply that broker's credentials. Deliberately does not brand-specific
 * every broker's credential form — every registered broker (implemented or
 * not) currently takes the same clientId/accessToken shape (see
 * `AddBrokerAccountDto` on the backend); a broker with a genuinely
 * different auth flow gets its own step here once it has a real adapter.
 */
export function AddBrokerAccountModal({
  isOpen,
  onClose,
  brokers,
  onSubmit,
  isSubmitting,
}: AddBrokerAccountModalProps) {
  const [step, setStep] = useState<Step>('select-broker')
  const [selectedBrokerId, setSelectedBrokerId] = useState<BrokerId | ''>('')
  const [displayName, setDisplayName] = useState('')
  const [clientId, setClientId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [error, setError] = useState('')

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId) ?? null

  function reset() {
    setStep('select-broker')
    setSelectedBrokerId('')
    setDisplayName('')
    setClientId('')
    setAccessToken('')
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function goToCredentials() {
    if (!selectedBrokerId) return
    setDisplayName((prev) => prev || (selectedBroker?.displayName ?? ''))
    setStep('credentials')
  }

  async function handleSubmit() {
    if (!selectedBrokerId) return
    setError('')
    try {
      await onSubmit({
        brokerId: selectedBrokerId,
        displayName: displayName.trim() || selectedBrokerId,
        clientId: clientId.trim(),
        accessToken: accessToken.trim(),
      })
      reset()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not save this broker account.')
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 'select-broker' ? 'Add a broker' : `Connect ${selectedBroker?.displayName ?? ''}`}
      footer={
        step === 'select-broker' ? (
          <>
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!selectedBrokerId} onClick={goToCredentials}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep('select-broker')}>
              Back
            </Button>
            <Button
              variant="primary"
              isLoading={isSubmitting}
              disabled={!clientId.trim() || !accessToken.trim() || !displayName.trim()}
              onClick={() => void handleSubmit()}
            >
              Save broker account
            </Button>
          </>
        )
      }
    >
      {step === 'select-broker' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-500">
            Choose which broker this account is for. You can save accounts for any broker on the
            list — only implemented brokers can actually be activated for trading.
          </p>
          <Select
            label="Broker"
            value={selectedBrokerId}
            onChange={(e) => setSelectedBrokerId(e.target.value as BrokerId | '')}
          >
            <option value="" disabled>
              Select a broker&hellip;
            </option>
            {brokers.map((broker) => (
              <option key={broker.id} value={broker.id}>
                {broker.displayName}
                {!broker.isImplemented ? ' (coming soon)' : ''}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!selectedBroker?.isImplemented && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {selectedBroker?.displayName} isn&apos;t live yet — you can still save this account
              now and activate it once support ships.
            </p>
          )}
          <Input
            label="Account nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. My primary account"
          />
          <Input
            label="Client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Broker-issued client/user id"
          />
          <Input
            label="Access token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Broker-issued access token"
            hint="Stored encrypted. Never shown again after saving."
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-loss-600">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
