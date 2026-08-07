import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import NewTrade from './NewTrade'
import { tradingService } from '@/services/trading.service'
import { instrumentService } from '@/services/instrument.service'
import { configService } from '@/services/config.service'

vi.mock('@/services/trading.service')
vi.mock('@/services/instrument.service')
vi.mock('@/services/config.service')
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

function sampleResolvedEquity() {
  return {
    underlying: 'RELIANCE',
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
    currentPrice: null,
    lastUpdated: null,
  }
}

interface BankniftyOptionOverrides {
  instrumentToken?: string
  expiry?: string
}

function sampleBankniftyOption(overrides: BankniftyOptionOverrides = {}) {
  return {
    underlying: 'BANKNIFTY',
    exchange: 'NFO',
    segment: 'OPTIDX',
    tradingSymbol: 'BANKNIFTY202601156800PE',
    instrumentToken: 'MOCK-BANKNIFTY-56800-PE-30JUL',
    expiry: '2026-07-30T10:00:00.000Z',
    strike: 56800,
    optionType: 'PE' as const,
    tickSize: 0.05,
    lotSize: 15,
    precision: 2,
    currentPrice: 176.5,
    lastUpdated: '2026-01-01T09:15:00.000Z',
    ...overrides,
  }
}

describe('NewTrade page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configService.tradingMode).mockResolvedValue({ tradingMode: 'PAPER', selectedBrokerAccountId: null })
  })

  it('shows validation errors and never submits an invalid form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText('Enter a trading call.')).toBeInTheDocument()
    expect(screen.getByText('Enter a positive number of lots.')).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()
  })

  it('auto-selects the single matching contract (no picker needed) and submits the lots-derived total quantity', async () => {
    vi.mocked(instrumentService.expiries).mockResolvedValue([sampleResolvedEquity()])
    vi.mocked(tradingService.create).mockResolvedValue(samplePaperTradeView())
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    const submitButton = screen.getByRole('button', { name: 'Submit Paper Trade' })

    await user.type(screen.getByLabelText('Trading call'), 'reliance')
    expect(await screen.findByText('RELIANCE-EQ')).toBeInTheDocument()

    // Lot size 1 for a plain equity — 10 lots means 10 total quantity.
    await user.type(screen.getByLabelText('Number of lots'), '10')
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
    vi.mocked(instrumentService.expiries).mockRejectedValue(
      Object.assign(new Error('No instrument found for underlying "NOTREAL"'), {
        name: 'ApiError',
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'notreal')
    expect(await screen.findByText(/No instrument found/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Number of lots'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText('Resolve this instrument before submitting.')).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()
  })

  it('shows the backend rejection message when submission fails', async () => {
    vi.mocked(instrumentService.expiries).mockResolvedValue([sampleResolvedEquity()])
    vi.mocked(tradingService.create).mockRejectedValue(
      Object.assign(new Error('Insufficient available balance to reserve ₹1000'), {
        name: 'ApiError',
      }),
    )
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'RELIANCE')
    await screen.findByText('RELIANCE-EQ')
    await user.type(screen.getByLabelText('Number of lots'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    expect(await screen.findByText(/Insufficient available balance/)).toBeInTheDocument()
  })

  it('requires explicit live confirmation before submitting in LIVE mode, and sends liveTradingConfirmed once checked', async () => {
    vi.mocked(configService.tradingMode).mockResolvedValue({ tradingMode: 'LIVE', selectedBrokerAccountId: 'acc-1' })
    vi.mocked(instrumentService.expiries).mockResolvedValue([sampleResolvedEquity()])
    vi.mocked(tradingService.create).mockResolvedValue(samplePaperTradeView())
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    const submitButton = await screen.findByRole('button', { name: 'Submit Live Trade' })

    await user.type(screen.getByLabelText('Trading call'), 'reliance')
    expect(await screen.findByText('RELIANCE-EQ')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Number of lots'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')

    // Not confirmed yet — must be blocked, never silently submitted as-is.
    await user.click(submitButton)
    expect(
      await screen.findByText('Confirm this is a real, live order before submitting.'),
    ).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox'))
    await user.click(submitButton)

    await vi.waitFor(() => {
      expect(tradingService.create).toHaveBeenCalledWith(
        expect.objectContaining({ liveTradingConfirmed: true }),
      )
    })
  })

  it('resolves a real option call (BANKNIFTY 56800 PE) and shows its actual lot size and total quantity, never a hardcoded or guessed value', async () => {
    vi.mocked(instrumentService.expiries).mockResolvedValue([sampleBankniftyOption()])
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'BANKNIFTY 56800 PE')

    expect(await screen.findByText('BANKNIFTY202601156800PE')).toBeInTheDocument()
    expect(screen.getByText('56800')).toBeInTheDocument()
    expect(screen.getByText('PE')).toBeInTheDocument()
    // The lot size shown must be exactly what the backend resolved, not a
    // client-side guess — 15, not e.g. a stale/hardcoded 25 or 50.
    expect(screen.getByText('15')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Number of lots'), '2')
    // 2 lots * lot size 15 = 30 total quantity, shown as a hint.
    expect(screen.getByText(/total quantity 30/)).toBeInTheDocument()
  })

  it('requires an explicit expiry selection when a call matches more than one live expiry — never silently picks one', async () => {
    const earlier = sampleBankniftyOption({
      instrumentToken: 'MOCK-BANKNIFTY-56800-PE-30JUL',
      expiry: '2026-07-30T10:00:00.000Z',
    })
    const later = sampleBankniftyOption({
      instrumentToken: 'MOCK-BANKNIFTY-56800-PE-06AUG',
      expiry: '2026-08-06T10:00:00.000Z',
    })
    vi.mocked(instrumentService.expiries).mockResolvedValue([earlier, later])
    vi.mocked(tradingService.create).mockResolvedValue(samplePaperTradeView())
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    await user.type(screen.getByLabelText('Trading call'), 'BANKNIFTY 56800 PE')

    expect(
      await screen.findByText('Multiple expiries match this call — select the exact contract:'),
    ).toBeInTheDocument()
    // No exact contract resolved yet — the lot-size/quantity hint reflects that.
    expect(screen.getByText('Resolve an instrument to see its lot size.')).toBeInTheDocument()

    // Submitting before a choice is made must be blocked, not defaulted.
    await user.type(screen.getByLabelText('Number of lots'), '1')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')
    await user.type(screen.getByLabelText('Target 1'), '110')
    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))
    expect(
      await screen.findByText('Select the exact expiry before submitting.'),
    ).toBeInTheDocument()
    expect(tradingService.create).not.toHaveBeenCalled()

    const [choiceButton] = await screen.findAllByRole('button', { name: /Lot 15/ })
    await user.click(choiceButton as HTMLElement)

    expect(screen.getByText('MOCK-BANKNIFTY-56800-PE-30JUL')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Submit Paper Trade' }))

    await vi.waitFor(() => {
      expect(tradingService.create).toHaveBeenCalledWith(
        expect.objectContaining({ rawSymbol: 'BANKNIFTY 56800 PE', quantity: 15 }),
      )
    })
  })

  it('computes a risk/reward preview from the entered values', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NewTrade />, { initialEntries: ['/app/trade'] })

    vi.mocked(instrumentService.expiries).mockResolvedValue([sampleResolvedEquity()])
    await user.type(screen.getByLabelText('Trading call'), 'RELIANCE')
    await screen.findByText('RELIANCE-EQ')

    await user.type(screen.getByLabelText('Number of lots'), '10')
    await user.type(screen.getByLabelText('Entry price'), '100')
    await user.type(screen.getByLabelText('Stop loss'), '95')

    expect(await screen.findByText('Risk (to stop-loss)')).toBeInTheDocument()
  })
})
