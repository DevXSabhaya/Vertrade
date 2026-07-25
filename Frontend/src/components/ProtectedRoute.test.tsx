import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route, MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { render } from '@testing-library/react'
import { ProtectedRoute } from './ProtectedRoute'
import { AuthProvider } from '@/store/auth-context'
import { createTestQueryClient } from '@/test/test-utils'
import { authService } from '@/services/auth.service'
import { setToken } from '@/lib/token-store'

vi.mock('@/services/auth.service')

function renderProtected(initialEntry: string) {
  const queryClient = createTestQueryClient()
  return render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<p>Login page</p>} />
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<p>Dashboard content</p>} />
              </Route>
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  it('redirects to /login when there is no session', async () => {
    renderProtected('/app')
    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })

  it('renders the protected content once a session is confirmed', async () => {
    setToken('valid-token')
    vi.mocked(authService.me).mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      displayName: 'Test User',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
    })

    renderProtected('/app')

    expect(await screen.findByText('Dashboard content')).toBeInTheDocument()
  })
})
