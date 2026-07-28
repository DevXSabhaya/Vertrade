import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PriceChart } from './PriceChart'

describe('PriceChart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a placeholder when no instrument is selected', () => {
    render(
      <PriceChart hasInstrument={false} history={[]} isConnected={false} sourceMode="PAPER" />,
    )
    expect(screen.getByText('No instrument selected')).toBeInTheDocument()
  })

  it('shows a brief waiting state immediately after subscribing, not an error', () => {
    render(<PriceChart hasInstrument history={[]} isConnected={true} sourceMode="PAPER" />)
    expect(screen.getByText('Waiting for the first price tick…')).toBeInTheDocument()
    expect(screen.queryByText('No live data received yet')).not.toBeInTheDocument()
  })

  it('shows a distinct "no live data" state after ticks never arrive for a while, instead of loading forever', () => {
    render(<PriceChart hasInstrument history={[]} isConnected={true} sourceMode="PAPER" />)

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(screen.getByText('No live data received yet')).toBeInTheDocument()
  })

  it('never times out once real price history has arrived', () => {
    render(
      <PriceChart
        hasInstrument
        isConnected={true}
        sourceMode="PAPER"
        history={[{ price: 176, timestamp: '2026-01-01T00:00:00.000Z' }]}
      />,
    )

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(screen.queryByText('No live data received yet')).not.toBeInTheDocument()
    expect(screen.getByText('₹176.00')).toBeInTheDocument()
  })

  it('resets the no-data timer when the connection drops and reconnects', () => {
    const { rerender } = render(
      <PriceChart hasInstrument history={[]} isConnected={true} sourceMode="PAPER" />,
    )

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    rerender(<PriceChart hasInstrument history={[]} isConnected={false} sourceMode="PAPER" />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    rerender(<PriceChart hasInstrument history={[]} isConnected={true} sourceMode="PAPER" />)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    // 10s since the most recent reconnect — under the 15s threshold — so
    // still the brief waiting state, not the timed-out one.
    expect(screen.queryByText('No live data received yet')).not.toBeInTheDocument()
  })

  describe('live vs paper source labeling', () => {
    const tickTime = '2026-01-01T00:00:00.000Z'
    const oneTick = [{ price: 176, timestamp: tickTime }]

    beforeEach(() => {
      // Pin "now" just after the tick so staleness never accidentally kicks
      // in for tests that aren't about staleness.
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
    })

    it('never shows "Live" in PAPER mode — a simulated price must never be mistaken for a real one', () => {
      render(
        <PriceChart hasInstrument isConnected={true} sourceMode="PAPER" history={oneTick} />,
      )
      expect(screen.getByText('Simulated (Paper)')).toBeInTheDocument()
      expect(screen.queryByText('Live')).not.toBeInTheDocument()
    })

    it('shows "Live" only in LIVE mode while connected', () => {
      render(<PriceChart hasInstrument isConnected={true} sourceMode="LIVE" history={oneTick} />)
      expect(screen.getByText('Live')).toBeInTheDocument()
    })

    it('shows "Reconnecting…" regardless of source mode while disconnected', () => {
      render(<PriceChart hasInstrument isConnected={false} sourceMode="LIVE" history={oneTick} />)
      expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
      expect(screen.queryByText('Live')).not.toBeInTheDocument()
    })
  })

  it('shows the last-updated time of the most recent tick', () => {
    vi.setSystemTime(new Date('2026-01-01T09:15:35.000Z'))
    render(
      <PriceChart
        hasInstrument
        isConnected={true}
        sourceMode="LIVE"
        history={[{ price: 176, timestamp: '2026-01-01T09:15:30.000Z' }]}
      />,
    )
    expect(screen.getByText(/Updated/)).toBeInTheDocument()
  })

  describe('change / percent change', () => {
    it('shows the change and percent change since the first tick in the window, signed and never a guessed prior-close value', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
      render(
        <PriceChart
          hasInstrument
          isConnected={true}
          sourceMode="LIVE"
          history={[
            { price: 100, timestamp: '2026-01-01T00:00:00.000Z' },
            { price: 110, timestamp: '2026-01-01T00:00:02.000Z' },
          ]}
        />,
      )

      expect(screen.getByText(/\+₹10\.00 \(\+10\.00%\)/)).toBeInTheDocument()
    })

    it('shows a negative change in loss styling', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
      render(
        <PriceChart
          hasInstrument
          isConnected={true}
          sourceMode="LIVE"
          history={[
            { price: 100, timestamp: '2026-01-01T00:00:00.000Z' },
            { price: 90, timestamp: '2026-01-01T00:00:02.000Z' },
          ]}
        />,
      )

      expect(screen.getByText(/-₹10\.00 \(-10\.00%\)/)).toBeInTheDocument()
    })

    it('shows no change indicator for a single-tick window — nothing to compare against yet', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'))
      render(
        <PriceChart
          hasInstrument
          isConnected={true}
          sourceMode="LIVE"
          history={[{ price: 176, timestamp: '2026-01-01T00:00:00.000Z' }]}
        />,
      )

      expect(screen.queryByText(/%\)/)).not.toBeInTheDocument()
    })
  })

  describe('stale data', () => {
    const tick = [{ price: 176, timestamp: '2026-01-01T00:00:00.000Z' }]

    it('shows the price as current, not stale, immediately after a fresh tick', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
      render(<PriceChart hasInstrument isConnected={true} sourceMode="LIVE" history={tick} />)

      expect(screen.getByText('Live')).toBeInTheDocument()
      expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    })

    it('marks a connected stream as Stale once its last tick is older than the threshold — never shows it as still "Live"', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'))
      render(<PriceChart hasInstrument isConnected={true} sourceMode="LIVE" history={tick} />)
      expect(screen.getByText('Live')).toBeInTheDocument()

      act(() => {
        vi.setSystemTime(new Date('2026-01-01T00:00:12.000Z'))
        vi.advanceTimersByTime(2_000)
      })

      expect(screen.getByText('Stale')).toBeInTheDocument()
      expect(screen.queryByText('Live')).not.toBeInTheDocument()
      // The last known price is still shown — stale, not hidden.
      expect(screen.getByText('₹176.00')).toBeInTheDocument()
    })

    it('never reports staleness while disconnected — that state is already "Reconnecting…"', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:20.000Z'))
      render(<PriceChart hasInstrument isConnected={false} sourceMode="LIVE" history={tick} />)

      expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
      expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    })
  })
})
