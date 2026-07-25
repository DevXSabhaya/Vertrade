import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import ResetPassword from './ResetPassword'
import ForgotPassword from './ForgotPassword'

describe('ResetPassword page', () => {
  it('redirects to the consolidated /forgot-password wizard', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/reset-password']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    )

    // The wizard's email-step heading confirms the redirect actually landed —
    // and lands at EMAIL_ENTRY, never a password-related screen, whether or
    // not a query string like ?token=... is appended to the URL.
    expect(await screen.findByText('Reset your password')).toBeInTheDocument()
  })

  it('redirects to EMAIL_ENTRY even with a token-like query string — a URL parameter can never authorize password reset', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/reset-password?token=forged-token-value']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(await screen.findByText('Reset your password')).toBeInTheDocument()
    expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
  })
})
