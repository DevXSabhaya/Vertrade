import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import History from './History'
import { tradingService } from '@/services/trading.service'
import type { PaperTradeView } from '@/types/trading'

vi.mock('@/services/trading.service')

function closedTrade(overrides: Partial<PaperTradeView> = {}): PaperTradeView {
  return {
    id: 'trade-1',
    status: 'CLOSED',
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
    ...overrides,
  }
}

describe('History page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an empty state when there is no trade history', async () => {
    vi.mocked(tradingService.history).mockResolvedValue([])
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    expect(await screen.findByText('No trades found')).toBeInTheDocument()
  })

  it('renders trades returned by the backend', async () => {
    vi.mocked(tradingService.history).mockResolvedValue([closedTrade()])
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    expect(await screen.findByText('RELIANCE')).toBeInTheDocument()
  })

  it('requests the initial page with no filters applied', async () => {
    vi.mocked(tradingService.history).mockResolvedValue([])
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    await waitFor(() => {
      expect(tradingService.history).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 20, offset: 0, status: undefined, instrument: undefined }),
        expect.anything(),
      )
    })
  })

  it('sends the status filter to the backend — filtering is server-side, not client-side', async () => {
    vi.mocked(tradingService.history).mockResolvedValue([])
    const user = userEvent.setup()
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    await user.selectOptions(screen.getByLabelText('Status'), 'FAILED')

    await waitFor(() => {
      expect(tradingService.history).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
        expect.anything(),
      )
    })
  })

  it('sends the debounced symbol search to the backend as the instrument filter', async () => {
    vi.mocked(tradingService.history).mockResolvedValue([])
    const user = userEvent.setup()
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    await user.type(screen.getByLabelText('Search symbol'), 'NIFTY')

    await waitFor(
      () => {
        expect(tradingService.history).toHaveBeenCalledWith(
          expect.objectContaining({ instrument: 'NIFTY' }),
          expect.anything(),
        )
      },
      { timeout: 2000 },
    )
  })

  it('resets to the first page when a filter changes', async () => {
    vi.mocked(tradingService.history).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => closedTrade({ id: `trade-${i}` })),
    )
    const user = userEvent.setup()
    renderWithProviders(<History />, { initialEntries: ['/app/history'] })

    await screen.findAllByText('RELIANCE')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(tradingService.history).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 20 }),
        expect.anything(),
      )
    })

    await user.selectOptions(screen.getByLabelText('Status'), 'CLOSED')

    await waitFor(() => {
      expect(tradingService.history).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 0, status: 'CLOSED' }),
        expect.anything(),
      )
    })
  })
})
