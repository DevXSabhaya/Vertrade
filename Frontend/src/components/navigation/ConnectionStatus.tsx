import { useBackendHealth } from '@/hooks/useBackendHealth'

export function ConnectionStatus() {
  const health = useBackendHealth()
  const isConnected = health.isSuccess && health.data?.status === 'ok'
  const isChecking = health.isLoading

  const label = isChecking ? 'Checking…' : isConnected ? 'Connected' : 'Disconnected'
  const dotClass = isChecking ? 'bg-ink-300' : isConnected ? 'bg-gain-500' : 'bg-loss-500'

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-ink-200 px-3 py-1 text-xs font-medium text-ink-600"
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <span>{label}</span>
      <span className="sr-only">Backend connection: {label}</span>
    </div>
  )
}
