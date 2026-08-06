import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import BrokerManager from './BrokerManager'
import { brokerService } from '@/services/broker.service'

vi.mock('@/services/broker.service')

const DHAN_METADATA = {
  id: 'DHAN' as const,
  displayName: 'Dhan',
  capabilities: ['EQUITY' as const, 'FNO' as const],
  featureFlags: {
    supportsBracketOrders: false,
    supportsGtt: false,
    supportsOptionChain: true,
    supportsMarketData: true,
  },
  isImplemented: true,
}

const ANGEL_ONE_METADATA = {
  id: 'ANGEL_ONE' as const,
  displayName: 'Angel One',
  capabilities: [],
  featureFlags: {
    supportsBracketOrders: false,
    supportsGtt: false,
    supportsOptionChain: false,
    supportsMarketData: false,
  },
  isImplemented: false,
}

describe('BrokerManager page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(brokerService.listBrokers).mockResolvedValue([DHAN_METADATA, ANGEL_ONE_METADATA])
  })

  it('shows an empty state with a call to action when no accounts are saved', async () => {
    vi.mocked(brokerService.listAccounts).mockResolvedValue([])
    renderWithProviders(<BrokerManager />, { initialEntries: ['/app/brokers'] })

    expect(await screen.findByText('No broker accounts saved yet')).toBeInTheDocument()
  })

  it('renders saved accounts with their runtime status', async () => {
    vi.mocked(brokerService.listAccounts).mockResolvedValue([
      {
        accountId: 'acc-1',
        userId: 'user-1',
        brokerId: 'DHAN',
        displayName: 'My Dhan',
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastConnectedAt: '2026-01-01T00:00:00.000Z',
        lastError: null,
        runtimeStatus: 'CONNECTED',
      },
    ])

    renderWithProviders(<BrokerManager />, { initialEntries: ['/app/brokers'] })

    expect(await screen.findByText('My Dhan')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument()
  })

  it('walks through the add-broker flow: select broker, enter credentials, submit', async () => {
    vi.mocked(brokerService.listAccounts).mockResolvedValue([])
    vi.mocked(brokerService.addAccount).mockResolvedValue({
      accountId: 'acc-new',
      userId: 'user-1',
      brokerId: 'DHAN',
      displayName: 'My Dhan',
      isActive: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastConnectedAt: null,
      lastError: null,
      runtimeStatus: 'NOT_CONNECTED',
    })

    const user = userEvent.setup()
    renderWithProviders(<BrokerManager />, { initialEntries: ['/app/brokers'] })

    await user.click(await screen.findByRole('button', { name: 'Add broker' }))
    await screen.findByText('Choose which broker this account is for. You can save accounts for any broker on the list — only implemented brokers can actually be activated for trading.', { exact: false })

    await user.selectOptions(screen.getByLabelText('Broker'), 'DHAN')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'CLIENT1' } })
    fireEvent.change(screen.getByLabelText('Access token'), { target: { value: 'TOKEN1' } })
    await user.click(screen.getByRole('button', { name: 'Save broker account' }))

    await waitFor(() => {
      expect(brokerService.addAccount).toHaveBeenCalledWith(
        expect.objectContaining({ brokerId: 'DHAN', clientId: 'CLIENT1', accessToken: 'TOKEN1' }),
      )
    })
  })

  it('shows a not-implemented broker as saveable but never activatable', async () => {
    vi.mocked(brokerService.listAccounts).mockResolvedValue([
      {
        accountId: 'acc-2',
        userId: 'user-1',
        brokerId: 'ANGEL_ONE',
        displayName: 'My Angel One',
        isActive: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastConnectedAt: null,
        lastError: null,
        runtimeStatus: 'NOT_IMPLEMENTED',
      },
    ])

    renderWithProviders(<BrokerManager />, { initialEntries: ['/app/brokers'] })

    expect(await screen.findByText('My Angel One')).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
