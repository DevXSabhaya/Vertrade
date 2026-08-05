import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import Account from './Account'
import { accountService } from '@/services/account.service'
import { configService } from '@/services/config.service'
import type { BrokerStatusResponse } from '@/types/config'

vi.mock('@/services/account.service')
vi.mock('@/services/config.service')

function accountSummary() {
  return {
    userId: 'u1',
    initialBalance: 100_000,
    availableBalance: 90_000,
    reservedMargin: 10_000,
    realizedPnl: 0,
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    equity: 100_000,
    unrealizedPnl: 0,
    totalPnl: 0,
  }
}

function brokerStatus(overrides: Partial<BrokerStatusResponse> = {}): BrokerStatusResponse {
  return {
    tradingMode: 'PAPER',
    brokerName: 'dhan',
    connected: false,
    authStatus: 'UNKNOWN',
    clientCode: null,
    marketDataCapability: 'UNKNOWN',
    orderExecutionCapability: 'UNKNOWN',
    lastSuccessfulConnectionAt: null,
    lastHealthCheckAt: null,
    tokenExpiresAt: null,
    lastRefreshedAt: null,
    authState: 'DISCONNECTED',
    ...overrides,
  } as BrokerStatusResponse
}

describe('Account page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configService.tradingMode).mockResolvedValue({
      tradingMode: 'PAPER',
      defaultTradingMode: 'PAPER',
    })
    vi.mocked(configService.brokerStatus).mockResolvedValue(brokerStatus())
    vi.mocked(configService.brokerAccountSummary).mockResolvedValue({
      supported: false,
      reason: 'Paper trading has no broker account — nothing to summarize.',
      availableBalance: null,
      usedMargin: null,
      availableMargin: null,
      todaysRealizedPnl: null,
      unrealizedPnl: null,
    })
  })

  it('requires confirmation before resetting the paper balance', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    vi.mocked(accountService.resetBalance).mockResolvedValue({
      userId: 'u1',
      initialBalance: 100_000,
      availableBalance: 100_000,
      reservedMargin: 0,
      realizedPnl: 0,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const user = userEvent.setup()
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    await user.click(await screen.findByRole('button', { name: 'Reset Paper Balance' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(accountService.resetBalance).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm Reset' }))

    await vi.waitFor(() => {
      expect(accountService.resetBalance).toHaveBeenCalledTimes(1)
    })
  })

  it('shows realized/unrealized/total P&L from the unified account response', async () => {
    vi.mocked(accountService.summary).mockResolvedValue({
      ...accountSummary(),
      realizedPnl: 500,
      unrealizedPnl: -120,
      totalPnl: 380,
    })
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    expect(await screen.findByText('Realized P&L')).toBeInTheDocument()
    expect(screen.getByText('Unrealized P&L')).toBeInTheDocument()
    expect(screen.getByText('Total P&L')).toBeInTheDocument()
  })

  it('cancelling the confirmation never calls reset', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    const user = userEvent.setup()
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    await user.click(await screen.findByRole('button', { name: 'Reset Paper Balance' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(accountService.resetBalance).not.toHaveBeenCalled()
  })

  it('shows broker connection status sourced from the backend, never a hardcoded value', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    vi.mocked(configService.tradingMode).mockResolvedValue({ tradingMode: 'LIVE', defaultTradingMode: 'PAPER' })
    vi.mocked(configService.brokerStatus).mockResolvedValue(
      brokerStatus({
        tradingMode: 'LIVE',
        connected: true,
        authStatus: 'HEALTHY',
        clientCode: 'ABC123',
        marketDataCapability: 'HEALTHY',
        orderExecutionCapability: 'HEALTHY',
        lastSuccessfulConnectionAt: '2026-01-01T09:00:00.000Z',
        lastHealthCheckAt: '2026-01-01T09:05:00.000Z',
        authState: 'AUTHENTICATED',
      }),
    )
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    expect((await screen.findAllByText('Connected')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Authenticated').length).toBeGreaterThan(0)
    expect(screen.getByText('ABC123')).toBeInTheDocument()
  })

  it('shows paper mode as never connected to a real broker', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    expect(await screen.findByText('Not connected')).toBeInTheDocument()
    expect(
      screen.getByText(/Paper trading never connects to a real broker/),
    ).toBeInTheDocument()
  })

  it('shows connect/disconnect/reconnect controls but never shows an account summary in PAPER mode', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    await screen.findByText('Not connected')
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect Broker' })).toBeInTheDocument()
    expect(screen.queryByText('Account Summary')).not.toBeInTheDocument()
  })

  it('shows connect/disconnect controls and calls the backend action in LIVE mode', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    vi.mocked(configService.tradingMode).mockResolvedValue({ tradingMode: 'LIVE', defaultTradingMode: 'PAPER' })
    vi.mocked(configService.brokerStatus).mockResolvedValue(
      brokerStatus({ tradingMode: 'LIVE', connected: false }),
    )
    vi.mocked(configService.connectBroker).mockResolvedValue(
      brokerStatus({ tradingMode: 'LIVE', connected: true, clientCode: 'ABC123' }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    const connectButton = await screen.findByRole('button', { name: 'Connect' })
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled()

    await user.click(connectButton)

    await vi.waitFor(() => {
      expect(configService.connectBroker).toHaveBeenCalledTimes(1)
    })
  })

  it('shows the real broker account summary in LIVE mode, marking unsupported fields clearly rather than fabricating them', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    vi.mocked(configService.tradingMode).mockResolvedValue({ tradingMode: 'LIVE', defaultTradingMode: 'PAPER' })
    vi.mocked(configService.brokerStatus).mockResolvedValue(
      brokerStatus({ tradingMode: 'LIVE', connected: true }),
    )
    vi.mocked(configService.brokerAccountSummary).mockResolvedValue({
      supported: true,
      reason: null,
      availableBalance: 45000.5,
      usedMargin: 2000,
      availableMargin: null,
      todaysRealizedPnl: 1200.75,
      unrealizedPnl: null,
    })
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    expect(await screen.findByText('Account Summary')).toBeInTheDocument()
    expect(screen.getByText('₹45,000.50')).toBeInTheDocument()
    expect(screen.getAllByText('Unsupported')).toHaveLength(2)
  })

  describe('Trading Mode selector', () => {
    it('shows the current mode and disables the button matching it', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      const paperButton = await screen.findByRole('button', { name: 'Paper Trading' })
      const liveButton = screen.getByRole('button', { name: 'Live Trading' })
      expect(paperButton).toBeDisabled()
      expect(liveButton).not.toBeDisabled()
    })

    it('requires confirmation before switching to Live, and calls the backend on confirm', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(configService.setTradingMode).mockResolvedValue({
        tradingMode: 'LIVE',
        defaultTradingMode: 'PAPER',
      })
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(configService.setTradingMode).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      await vi.waitFor(() => {
        expect(configService.setTradingMode).toHaveBeenCalledWith({ mode: 'LIVE' })
      })
    })

    it('cancelling the confirmation never calls the backend', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(configService.setTradingMode).not.toHaveBeenCalled()
    })

    it('surfaces the backend safety rejection and leaves the mode unchanged (no silent fallback)', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(configService.setTradingMode).mockRejectedValue(
        new Error('Cannot switch to LIVE mode: no Dhan broker credentials are configured.'),
      )
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      expect(
        await screen.findByText(/no Dhan broker credentials are configured/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Paper Trading' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Live Trading' })).not.toBeDisabled()
    })
  })
})
