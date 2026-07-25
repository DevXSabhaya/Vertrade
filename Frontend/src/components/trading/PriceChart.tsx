import { useMemo } from 'react'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { PricePoint } from '@/hooks/useInstrumentPriceStream'
import { formatCurrency } from '@/lib/format'

interface PriceChartProps {
  readonly history: readonly PricePoint[]
  readonly isConnected: boolean
  readonly entryPrice?: number | null
  readonly stopLoss?: number | null
  readonly currentStopLoss?: number | null
  readonly targets?: readonly number[]
  readonly hasInstrument: boolean
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
}: PriceChartProps) {
  const { points, min, max, latest } = useMemo(() => {
    if (history.length === 0) {
      return { points: '', min: 0, max: 0, latest: null as number | null }
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
      toXY,
    }
  }, [history, entryPrice, stopLoss, currentStopLoss, targets])

  if (!hasInstrument) {
    return (
      <EmptyState
        title="No instrument selected"
        description="Resolve a trading call above to see its live price chart."
      />
    )
  }

  if (history.length === 0) {
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

  return (
    <div className="rounded-xl border border-ink-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${isConnected ? 'text-gain-600' : 'text-ink-400'}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-gain-500' : 'bg-ink-300'}`}
            aria-hidden="true"
          />
          {isConnected ? 'Live' : 'Reconnecting…'}
        </span>
        {latest !== null && (
          <span className="text-sm font-semibold text-ink-900">{formatCurrency(latest)}</span>
        )}
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
