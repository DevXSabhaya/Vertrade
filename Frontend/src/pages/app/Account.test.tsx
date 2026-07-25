import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import Account from './Account'
import { accountService } from '@/services/account.service'

vi.mock('@/services/account.service')

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

describe('Account page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
