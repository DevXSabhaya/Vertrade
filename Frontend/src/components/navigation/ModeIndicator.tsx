import { useTradingMode } from '@/hooks/useTradingMode'

/**
 * Shows the deployment's actual current trading mode — sourced only from
 * `GET /config/trading-mode` (the backend's real executor-selection state),
 * never inferred or hardcoded client-side. Visible in the app header so it's
 * always in view before a trade is ever started (Phase 15 requirement).
 */
export function ModeIndicator() {
  const { data, isLoading } = useTradingMode()

  if (isLoading || !data) {
    return (
      <div className="h-6 w-16 animate-pulse rounded-full bg-ink-200" aria-hidden="true" />
    )
  }

  const isLive = data.tradingMode === 'LIVE'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
        isLive
          ? 'border-loss-500 bg-loss-50 text-loss-600'
          : 'border-brand-100 bg-brand-50 text-brand-700'
      }`}
      role="status"
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-loss-500' : 'bg-brand-500'}`}
        aria-hidden="true"
      />
      {isLive ? 'LIVE TRADING' : 'PAPER MODE'}
    </span>
  )
}
