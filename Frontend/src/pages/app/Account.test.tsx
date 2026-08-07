import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import Account from './Account'
import { accountService } from '@/services/account.service'
import { configService } from '@/services/config.service'
import { brokerService } from '@/services/broker.service'
import type { BrokerAccount } from '@/types/broker'

vi.mock('@/services/account.service')
vi.mock('@/services/config.service')
vi.mock('@/services/broker.service')

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

function brokerAccount(overrides: Partial<BrokerAccount> = {}): BrokerAccount {
  return {
    accountId: 'acc-1',
    userId: 'u1',
    brokerId: 'DHAN',
    displayName: 'My Dhan',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastConnectedAt: '2026-01-01T00:00:00.000Z',
    lastError: null,
    runtimeStatus: 'CONNECTED',
    ...overrides,
  }
}

describe('Account page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(configService.tradingMode).mockResolvedValue({
      tradingMode: 'PAPER',
      selectedBrokerAccountId: null,
    })
    vi.mocked(brokerService.listAccounts).mockResolvedValue([])
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

  it('points to Broker Manager as the single place to manage broker connections, instead of duplicating broker status here', async () => {
    vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
    renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

    const link = await screen.findByRole('link', { name: /Manage broker connections/ })
    expect(link).toHaveAttribute('href', '/app/brokers')
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

    it('blocks switching to Live with no connected broker, without opening the confirm dialog', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(brokerService.listAccounts).mockResolvedValue([])
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(
        await screen.findByText('You need to connect a broker before enabling Live Trading.'),
      ).toBeInTheDocument()
      expect(configService.setTradingMode).not.toHaveBeenCalled()
    })

    it('requires selecting a broker before switching to Live, and calls the backend with the selected account', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(brokerService.listAccounts).mockResolvedValue([brokerAccount()])
      vi.mocked(configService.setTradingMode).mockResolvedValue({
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
      })
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(await screen.findByText('My Dhan')).toBeInTheDocument()
      expect(configService.setTradingMode).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      await vi.waitFor(() => {
        expect(configService.setTradingMode).toHaveBeenCalledWith({
          mode: 'LIVE',
          brokerAccountId: 'acc-1',
        })
      })
    })

    it('cancelling the confirmation never calls the backend', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(brokerService.listAccounts).mockResolvedValue([brokerAccount()])
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(configService.setTradingMode).not.toHaveBeenCalled()
    })

    it('surfaces the backend safety rejection and leaves the mode unchanged (no silent fallback)', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(brokerService.listAccounts).mockResolvedValue([brokerAccount()])
      vi.mocked(configService.setTradingMode).mockRejectedValue(
        new Error('Cannot switch to LIVE mode: broker authentication failed.'),
      )
      const user = userEvent.setup()
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      await user.click(await screen.findByRole('button', { name: 'Live Trading' }))
      await user.click(screen.getByRole('button', { name: 'Confirm' }))

      expect(
        await screen.findByText(/Cannot switch to LIVE mode: broker authentication failed/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Paper Trading' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Live Trading' })).not.toBeDisabled()
    })

    it('offers a "Change broker" affordance while Live with an active account', async () => {
      vi.mocked(accountService.summary).mockResolvedValue(accountSummary())
      vi.mocked(brokerService.listAccounts).mockResolvedValue([brokerAccount()])
      vi.mocked(configService.tradingMode).mockResolvedValue({
        tradingMode: 'LIVE',
        selectedBrokerAccountId: 'acc-1',
      })
      renderWithProviders(<Account />, { initialEntries: ['/app/account'] })

      expect(await screen.findByText('My Dhan')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Change broker' })).toBeInTheDocument()
    })
  })
})
