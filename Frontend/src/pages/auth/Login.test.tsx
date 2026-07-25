import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import Login from './Login'
import { authService } from '@/services/auth.service'
import { setToken } from '@/lib/token-store'

vi.mock('@/services/auth.service')

describe('Login page', () => {
  beforeEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  it('submits credentials and shows a server-provided error on failure', async () => {
    vi.mocked(authService.login).mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { name: 'ApiError' }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('calls authService.login with the entered credentials', async () => {
    vi.mocked(authService.login).mockResolvedValue({
      accessToken: 'token-123',
      user: {
        id: 'u1',
        email: 'user@example.com',
        displayName: 'Test User',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: null,
      },
    })
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => {
      expect(authService.login).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'correct-password',
      })
    })
  })

  it('shows a client-side error and never calls the backend when email is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Password'), 'some-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your email address.',
    )
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('shows a client-side error and never calls the backend when password is empty', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Email'), 'user@example.com')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your password.',
    )
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('shows a client-side error and never calls the backend for a malformed email', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'some-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address.',
    )
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('shows the same generic error for wrong credentials as for any other auth failure (no enumeration)', async () => {
    vi.mocked(authService.login).mockRejectedValue(
      Object.assign(new Error('Invalid email or password'), { name: 'ApiError' }),
    )
    const user = userEvent.setup()
    renderWithProviders(<Login />, { initialEntries: ['/login'] })

    await user.type(screen.getByLabelText('Email'), 'nonexistent@example.com')
    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(authService.login).toHaveBeenCalledWith({
      email: 'nonexistent@example.com',
      password: 'whatever',
    })
  })
})
