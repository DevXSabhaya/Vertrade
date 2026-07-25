import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import ActiveTrades from './ActiveTrades'
import { tradingService } from '@/services/trading.service'
import type { PaperTradeView } from '@/types/trading'

vi.mock('@/services/trading.service')

function openTrade(): PaperTradeView {
  return {
    id: 'trade-1',
    status: 'OPEN',
    tradeId: 'engine-trade-1',
    rawSymbol: 'RELIANCE',
    direction: 'LONG',
    quantity: 10,
    entryTriggerPrice: 100,
    initialStopLoss: 95,
    reservedAmount: 1000,
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    trade: null,
  }
}

describe('ActiveTrades page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an empty state when there are no active trades', async () => {
    vi.mocked(tradingService.active).mockResolvedValue([])
    renderWithProviders(<ActiveTrades />, { initialEntries: ['/app/active-trades'] })

    expect(await screen.findByText('No active trades')).toBeInTheDocument()
  })

  it('shows a loading state before data arrives', () => {
    vi.mocked(tradingService.active).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<ActiveTrades />, { initialEntries: ['/app/active-trades'] })

    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('requires confirmation before exiting a trade, and calls exit only on confirm', async () => {
    vi.mocked(tradingService.active).mockResolvedValue([openTrade()])
    vi.mocked(tradingService.exit).mockResolvedValue({ ...openTrade(), status: 'CLOSED' })
    const user = userEvent.setup()
    renderWithProviders(<ActiveTrades />, { initialEntries: ['/app/active-trades'] })

    // Both the mobile card and desktop table render (jsdom doesn't evaluate
    // the Tailwind responsive classes that hide one or the other) — either
    // "Exit" button drives the same confirmation flow.
    const [firstExitButton] = await screen.findAllByRole('button', { name: 'Exit' })
    expect(firstExitButton).toBeDefined()
    await user.click(firstExitButton as HTMLElement)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(tradingService.exit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm Exit' }))

    await vi.waitFor(() => {
      expect(tradingService.exit).toHaveBeenCalledWith('trade-1')
    })
  })

  it('closing the confirmation dialog without confirming never calls exit', async () => {
    vi.mocked(tradingService.active).mockResolvedValue([openTrade()])
    const user = userEvent.setup()
    renderWithProviders(<ActiveTrades />, { initialEntries: ['/app/active-trades'] })

    const [firstExitButton] = await screen.findAllByRole('button', { name: 'Exit' })
    expect(firstExitButton).toBeDefined()
    await user.click(firstExitButton as HTMLElement)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(tradingService.exit).not.toHaveBeenCalled()
  })
})
