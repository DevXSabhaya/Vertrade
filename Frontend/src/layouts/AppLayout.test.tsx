import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Routes, Route } from 'react-router-dom'
import { renderWithProviders } from '@/test/test-utils'
import { AppLayout } from './AppLayout'
import { authService } from '@/services/auth.service'
import { tradingService } from '@/services/trading.service'
import { healthService } from '@/services/health.service'
import { getToken, setToken } from '@/lib/token-store'

vi.mock('@/services/auth.service')
vi.mock('@/services/trading.service')
vi.mock('@/services/health.service')

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(tradingService.history).mockResolvedValue([])
    vi.mocked(healthService.check).mockResolvedValue({
      status: 'ok',
      database: 'connected',
      timestamp: '2026-01-01T00:00:00.000Z',
    })
  })

  it('logs the user out and clears the stored token', async () => {
    setToken('a-valid-token')
    vi.mocked(authService.me).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    })
    const user = userEvent.setup()

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<p>Dashboard content</p>} />
        </Route>
      </Routes>,
      { initialEntries: ['/app'] },
    )

    await screen.findByText('Test User')
    await user.click(screen.getByRole('button', { name: /Test User/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }))

    expect(getToken()).toBeNull()
  })

  it('shows the connection status once the health check resolves', async () => {
    setToken('a-valid-token')
    vi.mocked(authService.me).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    })

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<p>Dashboard content</p>} />
        </Route>
      </Routes>,
      { initialEntries: ['/app'] },
    )

    expect(await screen.findByText('Connected')).toBeInTheDocument()
  })
})
