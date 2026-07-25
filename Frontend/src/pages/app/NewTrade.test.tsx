import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import NewTrade from './NewTrade'
import { tradingService } from '@/services/trading.service'
import { instrumentService } from '@/services/instrument.service'

vi.mock('@/services/trading.service')
vi.mock('@/services/instrument.service')
vi.mock('@/lib/socket-client', () => ({
  getSocket: () => ({
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }),
  disconnectSocket: vi.fn(),
}))

function samplePaperTradeView() {
  return {
    id: 'trade-1',
    status: 'PENDING' as const,
    tradeId: null,
    rawSymbol: 'RELIANCE',
    direction: 'LONG' as const,
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

function sampleResolvedInstrument() {
  return {
    exchange: 'NSE',
    segment: 'EQ',
    tradingSymbol: 'RELIANCE-EQ',
    instrumentToken: 'MOCK-EQ-RELIANCE',
    expiry: null,
    strike: null,
    optionType: null,
    tickSize: 0.05,
    lotSize: 1,
    precision: 2,
  }
}

describe('NewTrade page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows validation errors and never submits an invalid form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText('Enter a trading call.')).toBeInTheDocument()
    expect(screen.getByText('Enter a positive quantity.')).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()
  })

  it('blocks submission until the trading call resolves, then submits once it does', async () => {
    vi.mocked(instrumentService.resolve).mockResolvedValue(sampleResolvedInstrument())
    vi.mocked(tradingService.create).mockResolvedValue(samplePaperTradeView())
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    const submitButton = screen.getByRole('button', { name: 'Submit Paper Trade' })

    await user.type(screen.getByLabelText('Trading call'), 'reliance')
    expect(await screen.findByText('RELIANCE-EQ')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Quantity'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(tradingService.create).toHaveBeenCalledWith({
        rawSymbol: 'RELIANCE',
        direction: 'LONG',
        quantity: 10,
        entryTriggerPrice: 100,
        initialStopLoss: 95,
        targets: [110],
      })
    })
  })

  it('shows a clear resolver error and never submits an unresolved instrument', async () => {
    vi.mocked(instrumentService.resolve).mockRejectedValue(
      Object.assign(new Error('No instrument found for underlying "NOTREAL"'), {
        name: 'ApiError',
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'notreal')
    expect(await screen.findByText(/No instrument found/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Quantity'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText('Resolve this instrument before submitting.')).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()
  })

  it('shows the backend rejection message when submission fails', async () => {
    vi.mocked(instrumentService.resolve).mockResolvedValue(sampleResolvedInstrument())
    vi.mocked(tradingService.create).mockRejectedValue(
      Object.assign(new Error('Insufficient available balance to reserve ₹1000'), {
        name: 'ApiError',
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'RELIANCE')
    await screen.findByText('RELIANCE-EQ')
    await user.type(screen.getByLabelText('Quantity'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText(/Insufficient available balance/)).toBeInTheDocument()
  })

  it('computes a risk/reward preview from the entered values', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Quantity'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')

    expect(await screen.findByText('Risk (to stop-loss)')).toBeInTheDocument()
  })
})
