import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/test-utils'
import RiskStatus from './RiskStatus'
import { riskService } from '@/services/risk.service'

vi.mock('@/services/risk.service')

describe('RiskStatus page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state before data arrives', () => {
    vi.mocked(riskService.status).mockReturnValue(new Promise(() => {}))
    vi.mocked(riskService.snapshot).mockReturnValue(new Promise(() => {}))
    renderWithProviders(<RiskStatus />, { initialEntries: ['/app/risk'] })

    expect(screen.getByText('Risk Status')).toBeInTheDocument()
  })

  it('renders real trading-status data once loaded', async () => {
    vi.mocked(riskService.status).mockResolvedValue({
      killSwitchStatus: 'ACTIVE',
      emergencyStopActive: false,
      cooldownActive: false,
      circuitBreakers: [
        {
          name: 'BROKER',
          status: 'CLOSED',
          consecutiveFailures: 0,
          openedAt: null,
          lastFailureAt: null,
          lastSuccessAt: null,
        },
      ],
      tradingBlocked: false,
      asOf: '2026-01-01T00:00:00.000Z',
    })
    vi.mocked(riskService.snapshot).mockResolvedValue({
      asOf: '2026-01-01T00:00:00.000Z',
      dailyRealizedPnl: 0,
      dailyUnrealizedPnl: 0,
      totalPnl: 0,
      openTradeCount: 2,
      openPositionCount: 2,
      totalExposure: 5000,
      availableCapital: 100_000,
      usedCapital: 5000,
      currentRisk: 250,
      consecutiveLosses: 0,
      killSwitchStatus: 'ACTIVE',
      emergencyStopActive: false,
      circuitBreakers: [],
    })

    renderWithProviders(<RiskStatus />, { initialEntries: ['/app/risk'] })

    expect(await screen.findByText('Trading allowed')).toBeInTheDocument()
    expect(screen.getByText('BROKER')).toBeInTheDocument()
  })

  it('shows an error state with retry when the status call fails', async () => {
    vi.mocked(riskService.status).mockRejectedValue(new Error('network down'))
    vi.mocked(riskService.snapshot).mockResolvedValue({
      asOf: '2026-01-01T00:00:00.000Z',
      dailyRealizedPnl: 0,
      dailyUnrealizedPnl: 0,
      totalPnl: 0,
      openTradeCount: 0,
      openPositionCount: 0,
      totalExposure: 0,
      availableCapital: 0,
      usedCapital: 0,
      currentRisk: 0,
      consecutiveLosses: 0,
      killSwitchStatus: 'ACTIVE',
      emergencyStopActive: false,
      circuitBreakers: [],
    })

    renderWithProviders(<RiskStatus />, { initialEntries: ['/app/risk'] })

    expect(await screen.findByText("Couldn't load risk status.")).toBeInTheDocument()
  })
})
