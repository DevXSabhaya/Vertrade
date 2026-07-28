import { useEffect, useMemo, useState } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { PricePoint } from '@/hooks/useInstrumentPriceStream'
import { formatCurrency, formatPnlClass, formatTime } from '@/lib/format'
import type { TradingMode } from '@/types/trading'

/** How long to show the brief "waiting for the first tick" state before treating it as "market data isn't flowing" instead of an infinite spinner. */
const NO_DATA_TIMEOUT_MS = 15_000
/** How long a connected stream can go without a new tick before its last price is shown as stale rather than current — well above the mock provider's ~1s tick cadence, so normal jitter never trips it. */
const STALE_THRESHOLD_MS = 10_000

interface PriceChartProps {
  readonly history: readonly PricePoint[]
  readonly isConnected: boolean
  readonly entryPrice?: number | null
  readonly stopLoss?: number | null
  readonly currentStopLoss?: number | null
  readonly targets?: readonly number[]
  readonly hasInstrument: boolean
  /**
   * Which stream this deployment's backend is actually running —
   * PAPER always means simulated/mock data (`MockMarketDataProvider`),
   * LIVE means the real broker feed. The badge below is the one place a
   * user could otherwise mistake a PAPER-mode simulated price for a real
   * "Live" one, so it must always reflect the backend's real mode, never
   * default to implying "Live".
   */
  readonly sourceMode: TradingMode
}

const WIDTH = 600
const HEIGHT = 220
const PADDING = 12

/**
 * A minimal, dependency-free live price line chart — plain SVG over the real
 * `/realtime` price stream (`useInstrumentPriceStream`), never a fabricated
 * client-side price engine. Design is intentionally basic per Phase 15's
 * priority (functional correctness over visual polish): a price line, a
 * current-price dot, and horizontal reference lines for entry/stop-loss/
 * targets so a trade's price action is visible at a glance.
 */
export function PriceChart({
  history,
  isConnected,
  entryPrice,
  stopLoss,
  currentStopLoss,
  targets = [],
  hasInstrument,
  sourceMode,
}: PriceChartProps) {
  const { points, min, max, latest, latestTimestamp, firstPrice } = useMemo(() => {
    if (history.length === 0) {
      return {
        points: '',
        min: 0,
        max: 0,
        latest: null as number | null,
        latestTimestamp: null as string | null,
        firstPrice: null as number | null,
      }
    }
    const prices = history.map((p) => p.price)
    const referenceValues = [
      entryPrice,
      stopLoss,
      currentStopLoss,
      ...targets,
    ].filter((v): v is number => typeof v === 'number')
    const allValues = [...prices, ...referenceValues]
    const dataMin = Math.min(...allValues)
    const dataMax = Math.max(...allValues)
    const range = dataMax - dataMin || 1

    const toXY = (price: number, index: number): [number, number] => {
      const x =
        PADDING + (index / Math.max(1, history.length - 1)) * (WIDTH - PADDING * 2)
      const y =
        HEIGHT - PADDING - ((price - dataMin) / range) * (HEIGHT - PADDING * 2)
      return [x, y]
    }

    const pointsStr = prices
      .map((price, index) => toXY(price, index).join(','))
      .join(' ')

    return {
      points: pointsStr,
      min: dataMin,
      max: dataMax,
      latest: prices[prices.length - 1] ?? null,
      latestTimestamp: history[history.length - 1]?.timestamp ?? null,
      firstPrice: prices[0] ?? null,
      toXY,
    }
  }, [history, entryPrice, stopLoss, currentStopLoss, targets])

  // Change/percent change since the first tick in the currently-held window
  // (not "since previous close" — the broker feed carries no such reference
  // price, so showing one would mean guessing it). Requires at least two
  // points — with only one, "change" would just be a meaningless 0.00%
  // rather than genuinely absent information.
  const change =
    latest !== null && firstPrice !== null && history.length > 1
      ? latest - firstPrice
      : null
  const percentChange =
    change !== null && firstPrice !== null && firstPrice !== 0
      ? (change / firstPrice) * 100
      : null

  // A connected stream that has gone quiet for a while is showing a stale
  // last price, not a current one — `now` only ticks while that's even
  // possible to detect (connected with at least one prior tick).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isConnected || history.length === 0) return
    const interval = window.setInterval(() => setNow(Date.now()), 2_000)
    return () => window.clearInterval(interval)
  }, [isConnected, history.length])
  const isStale =
    isConnected &&
    latestTimestamp !== null &&
    now - new Date(latestTimestamp).getTime() > STALE_THRESHOLD_MS

  // True while connected with no data yet — the one state this timeout
  // should ever measure a continuous stretch of.
  const isWaitingForFirstTick = isConnected && history.length === 0
  const [trackedWaiting, setTrackedWaiting] = useState(isWaitingForFirstTick)
  const [timedOut, setTimedOut] = useState(false)
  // Reset synchronously during render (not in an effect body) the instant
  // that stretch ends — either real data arrived or the connection dropped,
  // in which case a fresh wait starts once it reconnects.
  if (isWaitingForFirstTick !== trackedWaiting) {
    setTrackedWaiting(isWaitingForFirstTick)
    setTimedOut(false)
  }

  useEffect(() => {
    if (!isWaitingForFirstTick) return
    const timer = window.setTimeout(() => setTimedOut(true), NO_DATA_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [isWaitingForFirstTick])

  if (!hasInstrument) {
    return (
      <EmptyState
        title="No instrument selected"
        description="Resolve a trading call above to see its live price chart."
      />
    )
  }

  if (history.length === 0) {
    if (timedOut) {
      return (
        <EmptyState
          title="No live data received yet"
          description="The connection is open, but no price ticks have arrived for this instrument. Market data may be disconnected or this instrument may not be actively streaming."
        />
      )
    }
    return (
      <div className="rounded-xl border border-ink-200 p-4">
        <p className="mb-3 text-xs text-ink-500">
          {isConnected ? 'Waiting for the first price tick…' : 'Connecting to live market data…'}
        </p>
        <SkeletonRows rows={3} />
      </div>
    )
  }

  const priceToY = (price: number): number => {
    const range = max - min || 1
    return HEIGHT - PADDING - ((price - min) / range) * (HEIGHT - PADDING * 2)
  }

  const referenceLines: { label: string; price: number; className: string }[] = []
  if (typeof entryPrice === 'number') {
    referenceLines.push({ label: 'Entry', price: entryPrice, className: 'stroke-ink-400' })
  }
  if (typeof stopLoss === 'number') {
    referenceLines.push({ label: 'SL', price: stopLoss, className: 'stroke-loss-500' })
  }
  if (typeof currentStopLoss === 'number' && currentStopLoss !== stopLoss) {
    referenceLines.push({
      label: 'Trailing SL',
      price: currentStopLoss,
      className: 'stroke-amber-500',
    })
  }
  targets.forEach((target, index) => {
    referenceLines.push({
      label: `T${index + 1}`,
      price: target,
      className: 'stroke-gain-500',
    })
  })

  const isLiveSource = sourceMode === 'LIVE'
  // Connected but PAPER never says "Live" — that word is reserved for a
  // real broker feed, so a simulated PAPER-mode price can never be mistaken
  // for one. Staleness overrides both: a quiet-too-long connected stream is
  // never shown as "current" regardless of source.
  const statusLabel = !isConnected
    ? 'Reconnecting…'
    : isStale
      ? 'Stale'
      : isLiveSource
        ? 'Live'
        : 'Simulated (Paper)'
  const statusColorClass = !isConnected
    ? 'text-ink-400'
    : isStale
      ? 'text-loss-600'
      : isLiveSource
        ? 'text-gain-600'
        : 'text-amber-600'
  const statusDotClass = !isConnected
    ? 'bg-ink-300'
    : isStale
      ? 'bg-loss-500'
      : isLiveSource
        ? 'bg-gain-500'
        : 'bg-amber-500'

  return (
    <div className="rounded-xl border border-ink-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusColorClass}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} aria-hidden="true" />
          {statusLabel}
        </span>
        <div className="flex items-center gap-2">
          {latestTimestamp && (
            <span className="text-[11px] text-ink-400">
              Updated {formatTime(latestTimestamp)}
            </span>
          )}
          {change !== null && percentChange !== null && (
            <span className={`text-xs font-medium ${formatPnlClass(change)}`}>
              {change >= 0 ? '+' : ''}
              {formatCurrency(change)} ({change >= 0 ? '+' : ''}
              {percentChange.toFixed(2)}%)
            </span>
          )}
          {latest !== null && (
            <span className="text-sm font-semibold text-ink-900">{formatCurrency(latest)}</span>
          )}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="Live price chart"
      >
        {referenceLines.map((line) => (
          <g key={line.label}>
            <line
              x1={PADDING}
              x2={WIDTH - PADDING}
              y1={priceToY(line.price)}
              y2={priceToY(line.price)}
              className={line.className}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={WIDTH - PADDING}
              y={priceToY(line.price) - 3}
              textAnchor="end"
              className="fill-ink-400 text-[9px]"
            >
              {line.label} {formatCurrency(line.price)}
            </text>
          </g>
        ))}
        <polyline points={points} fill="none" className="stroke-brand-600" strokeWidth={2} />
        {latest !== null && (
          <circle
            cx={WIDTH - PADDING}
            cy={priceToY(latest)}
            r={3.5}
            className="fill-brand-600"
          />
        )}
      </svg>
    </div>
  )
}
