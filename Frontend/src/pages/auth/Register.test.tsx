import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import Register from './Register'
import { authService } from '@/services/auth.service'
import { setToken } from '@/lib/token-store'

vi.mock('@/services/auth.service')

describe('Register page', () => {
  beforeEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  it('shows validation errors and never calls the API for an invalid form', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Register />, { initialEntries: ['/register'] })

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Start Paper Trading Free' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(authService.register).not.toHaveBeenCalled()
  })

  it('submits a valid form to the register API', async () => {
    vi.mocked(authService.register).mockResolvedValue({
      accessToken: 'token-abc',
      user: {
        id: 'u1',
        email: 'new@example.com',
        displayName: 'New User',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: null,
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<Register />, { initialEntries: ['/register'] })

    await user.type(screen.getByLabelText('Full name'), 'New User')
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), 'a-strong-password')
    await user.click(screen.getByRole('button', { name: 'Start Paper Trading Free' }))

    await vi.waitFor(() => {
      expect(authService.register).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'a-strong-password',
        displayName: 'New User',
      })
    })
  })
})
