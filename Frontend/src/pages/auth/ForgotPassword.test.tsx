import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/test-utils'
import ForgotPassword from './ForgotPassword'
import { authService } from '@/services/auth.service'

vi.mock('@/services/auth.service')

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const codeExpiresAt = () => new Date(Date.now() + FIFTEEN_MINUTES_MS).toISOString()

describe('ForgotPassword page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  describe('STATE 1 — EMAIL_ENTRY', () => {
    it('is the initial state: shows the email screen, never the new-password screen', () => {
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      expect(screen.getByText('Reset your password')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Send verification code' })).toBeInTheDocument()
      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
      expect(screen.queryByText('Enter the verification code')).not.toBeInTheDocument()
    })

    it('sends a reset code and never claims a specific outcome about account existence', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))

      expect(authService.forgotPassword).toHaveBeenCalledWith({ email: 'user@example.com' })
      // Moves straight to OTP_VERIFICATION — never reveals whether the account exists.
      expect(await screen.findByText('Enter the verification code')).toBeInTheDocument()
      expect(screen.getByText(/Enter the 6-digit code sent to/)).toBeInTheDocument()
    })

    it('shows a server error message on failure and stays on EMAIL_ENTRY', async () => {
      vi.mocked(authService.forgotPassword).mockRejectedValue(
        Object.assign(new Error('Too many password reset requests. Please try again later.'), {
          name: 'ApiError',
        }),
      )
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/too many password reset requests/i)
      expect(screen.getByLabelText('Email')).toBeInTheDocument()
    })
  })

  describe('STATE 2 — OTP_VERIFICATION', () => {
    it('shows a disabled resend button with a live countdown right after the code is sent, with no email field to re-enter', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
      expect(
        await screen.findByRole('button', { name: /Resend code in \d+s/ }),
      ).toBeDisabled()
    })

    it('rejects a wrong OTP and does NOT reach the new-password screen', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockRejectedValue(
        Object.assign(new Error('Invalid verification code. Please check the code and try again.'), {
          name: 'ApiError',
        }),
      )
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      await user.type(screen.getByLabelText('Verification code'), '000000')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(/invalid verification code/i)
      expect(screen.getByLabelText('Verification code')).toBeInTheDocument()
      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
    })

    it('only reaches the new-password screen after a successful backend verification', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockResolvedValue({
        resetToken: 'a'.repeat(64),
        expiresInSeconds: 600,
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      await user.type(screen.getByLabelText('Verification code'), '123456')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))

      expect(authService.verifyResetCode).toHaveBeenCalledWith({
        email: 'user@example.com',
        code: '123456',
      })
      expect(await screen.findByText('Set a new password')).toBeInTheDocument()
    })

    it('displays a code countdown derived from the backend-issued codeExpiresAt, not a hardcoded value', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      // ~5 minutes remaining, rendered as M:SS — never "a few seconds" and
      // never equal to the (much shorter) resend cooldown of 45s.
      expect(await screen.findByText(/Code expires in/)).toBeInTheDocument()
      expect(screen.getByText(/4:5\d|5:00/)).toBeInTheDocument()
    })

    it('recomputes the real remaining time from the persisted codeExpiresAt after a simulated refresh, instead of resetting a local timer', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      const user = userEvent.setup()
      const { unmount } = renderWithProviders(<ForgotPassword />, {
        initialEntries: ['/forgot-password'],
      })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      // Simulate a page refresh: unmount and remount. sessionStorage (not a
      // JS timer) is the only thing carrying `codeExpiresAt` across this.
      unmount()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      expect(await screen.findByText('Enter the verification code')).toBeInTheDocument()
      expect(screen.getByText(/Code expires in/)).toBeInTheDocument()
      expect(screen.getByText(/4:5\d|5:00/)).toBeInTheDocument()
    })

    it('"Change email" returns to EMAIL_ENTRY and clears the active reset challenge', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      await user.click(screen.getByRole('button', { name: 'Change email' }))

      expect(screen.getByText('Reset your password')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toHaveValue('')
      expect(sessionStorage.getItem('vertrade.passwordResetWizard')).toBeNull()
    })
  })

  describe('OTP_EXPIRED', () => {
    it('shows an expired state with BOTH Resend code and Use a different email, and blocks verification', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        // Already in the past — simulates the real 15-minute window elapsing.
        codeExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      expect(await screen.findByText('This verification code has expired.')).toBeInTheDocument()
      // No OTP input is offered at all once expired — nothing to submit.
      expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Resend code/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Use a different email' })).toBeInTheDocument()
      expect(authService.verifyResetCode).not.toHaveBeenCalled()
    })

    it('"Use a different email" from the expired state returns to EMAIL_ENTRY without requiring a refresh', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 0,
        codeExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('This verification code has expired.')

      await user.click(screen.getByRole('button', { name: 'Use a different email' }))

      expect(screen.getByText('Reset your password')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toHaveValue('')
    })

    it('resend from the expired state sends a new code without asking for the email again', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 0,
        codeExpiresAt: new Date(Date.now() - 1_000).toISOString(),
      })
      vi.mocked(authService.resendResetCode).mockResolvedValue({
        message: 'A new verification code has been sent to your email.',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('This verification code has expired.')

      await user.click(screen.getByRole('button', { name: 'Resend code' }))

      expect(authService.resendResetCode).toHaveBeenCalledWith({ email: 'user@example.com' })
      // A fresh 15-minute countdown replaces the expired state.
      expect(await screen.findByText(/Code expires in/)).toBeInTheDocument()
      expect(screen.queryByText('This verification code has expired.')).not.toBeInTheDocument()
    })
  })

  describe('RESEND', () => {
    it('resend uses the already-entered email without prompting for it again, and restarts the countdown from the new expiresAt', async () => {
      // cooldownSeconds: 0 lets the resend button become clickable
      // immediately, so this test can exercise the real click without
      // manipulating global timers (which was flaky and leaked into other
      // test files).
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 0,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.resendResetCode).mockResolvedValue({
        message: 'A new verification code has been sent to your email.',
        cooldownSeconds: 45,
        codeExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')

      const resendButton = await screen.findByRole('button', { name: 'Resend code' })
      await user.click(resendButton)

      expect(authService.resendResetCode).toHaveBeenCalledWith({ email: 'user@example.com' })
      expect(
        await screen.findByText('New verification code sent to your email.'),
      ).toBeInTheDocument()
      expect(screen.getByText(/4:5\d|5:00/)).toBeInTheDocument()
    })
  })

  describe('STATE 3 — PASSWORD_RESET_AUTHORIZED / NEW_PASSWORD', () => {
    it('resets the password after verification and shows success', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockResolvedValue({
        resetToken: 'a'.repeat(64),
        expiresInSeconds: 600,
      })
      vi.mocked(authService.resetPassword).mockResolvedValue({ message: 'Password reset successfully.' })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')
      await user.type(screen.getByLabelText('Verification code'), '123456')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))
      await screen.findByText('Set a new password')

      await user.type(screen.getByLabelText('New password'), 'brand-new-password')
      await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-password')
      await user.click(screen.getByRole('button', { name: 'Reset password' }))

      expect(authService.resetPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        resetToken: 'a'.repeat(64),
        newPassword: 'brand-new-password',
      })
      expect(await screen.findByText('Password reset successfully')).toBeInTheDocument()
      expect(screen.getByText('Your password has been reset successfully.')).toBeInTheDocument()
    })

    it('rejects mismatched passwords client-side without calling the backend', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockResolvedValue({
        resetToken: 'a'.repeat(64),
        expiresInSeconds: 600,
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')
      await user.type(screen.getByLabelText('Verification code'), '123456')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))
      await screen.findByText('Set a new password')

      await user.type(screen.getByLabelText('New password'), 'brand-new-password')
      await user.type(screen.getByLabelText('Confirm new password'), 'different-password')
      await user.click(screen.getByRole('button', { name: 'Reset password' }))

      expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
      expect(authService.resetPassword).not.toHaveBeenCalled()
    })
  })

  describe('INVALID TRANSITIONS — the actual regression this suite guards against', () => {
    it('EMAIL_ENTRY never renders the new-password screen', () => {
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })
      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    })

    it('does not authorize password reset just by requesting a code — no resetToken exists until OTP verification succeeds', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))

      expect(await screen.findByText('Enter the verification code')).toBeInTheDocument()
      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
      expect(authService.verifyResetCode).not.toHaveBeenCalled()
      expect(authService.resetPassword).not.toHaveBeenCalled()
    })

    it('a bare sessionStorage step="password" with no resetToken cannot render the new-password screen (tamper-proofing)', () => {
      sessionStorage.setItem(
        'vertrade.passwordResetWizard',
        JSON.stringify({
          step: 'password',
          email: 'attacker@example.com',
          resetToken: null,
          cooldownEndsAt: null,
          codeExpiresAt: null,
        }),
      )

      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
      expect(screen.getByText('Reset your password')).toBeInTheDocument()
    })

    it('THE ACTUAL REGRESSION: a stale sessionStorage entry from a completed prior visit (step "password" WITH a real-looking resetToken) does not resume at the new-password screen on mount', () => {
      // This is the exact shape a previous session would have left behind
      // under the old (buggy) persistence model: user verified an OTP,
      // reached the password step, and something (a real resetToken, a
      // completed/abandoned session, a second tab) left this in
      // sessionStorage. Mounting the wizard fresh — e.g. clicking "Forgot
      // password?" again from the login page — must never resume past
      // OTP_VERIFICATION from persisted state alone.
      sessionStorage.setItem(
        'vertrade.passwordResetWizard',
        JSON.stringify({
          step: 'password',
          email: 'user@example.com',
          resetToken: 'a'.repeat(64),
          cooldownEndsAt: null,
          codeExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }),
      )

      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      expect(screen.queryByText('Set a new password')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
      expect(screen.getByText('Reset your password')).toBeInTheDocument()
    })

    it('a stale "done" entry in sessionStorage does not resume at the success screen', () => {
      sessionStorage.setItem(
        'vertrade.passwordResetWizard',
        JSON.stringify({
          step: 'done',
          email: 'user@example.com',
          resetToken: null,
          cooldownEndsAt: null,
          codeExpiresAt: null,
        }),
      )

      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      expect(screen.queryByText('Password reset successfully')).not.toBeInTheDocument()
      expect(screen.getByText('Reset your password')).toBeInTheDocument()
    })

    it('a completed reset does not leave behind state that could resume a future mount past EMAIL_ENTRY', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockResolvedValue({
        resetToken: 'a'.repeat(64),
        expiresInSeconds: 600,
      })
      vi.mocked(authService.resetPassword).mockResolvedValue({ message: 'Password reset successfully.' })
      const user = userEvent.setup()
      const { unmount } = renderWithProviders(<ForgotPassword />, {
        initialEntries: ['/forgot-password'],
      })

      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      await screen.findByText('Enter the verification code')
      await user.type(screen.getByLabelText('Verification code'), '123456')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))
      await screen.findByText('Set a new password')
      await user.type(screen.getByLabelText('New password'), 'brand-new-password')
      await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-password')
      await user.click(screen.getByRole('button', { name: 'Reset password' }))
      await screen.findByText('Password reset successfully')

      expect(sessionStorage.getItem('vertrade.passwordResetWizard')).toBeNull()

      unmount()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })
      expect(screen.getByText('Reset your password')).toBeInTheDocument()
      expect(screen.queryByText('Password reset successfully')).not.toBeInTheDocument()
    })
  })

  describe('FULL END-TO-END FLOW', () => {
    it('runs the complete flow: email -> OTP -> verify -> new password -> success', async () => {
      vi.mocked(authService.forgotPassword).mockResolvedValue({
        message: 'ok',
        cooldownSeconds: 45,
        codeExpiresAt: codeExpiresAt(),
      })
      vi.mocked(authService.verifyResetCode).mockResolvedValue({
        resetToken: 'b'.repeat(64),
        expiresInSeconds: 600,
      })
      vi.mocked(authService.resetPassword).mockResolvedValue({ message: 'Password reset successfully.' })
      const user = userEvent.setup()
      renderWithProviders(<ForgotPassword />, { initialEntries: ['/forgot-password'] })

      // Step 1: EMAIL_ENTRY
      expect(screen.getByText('Reset your password')).toBeInTheDocument()
      await user.type(screen.getByLabelText('Email'), 'user@example.com')
      await user.click(screen.getByRole('button', { name: 'Send verification code' }))
      expect(authService.forgotPassword).toHaveBeenCalledWith({ email: 'user@example.com' })

      // Step 2: OTP_VERIFICATION is mandatory before anything password-related is shown
      await screen.findByText('Enter the verification code')
      expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
      await user.type(screen.getByLabelText('Verification code'), '654321')
      await user.click(screen.getByRole('button', { name: 'Verify code' }))
      expect(authService.verifyResetCode).toHaveBeenCalledWith({
        email: 'user@example.com',
        code: '654321',
      })

      // Step 3: NEW_PASSWORD, gated on the resetToken issued by verification
      await screen.findByText('Set a new password')
      await user.type(screen.getByLabelText('New password'), 'brand-new-password')
      await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-password')
      await user.click(screen.getByRole('button', { name: 'Reset password' }))
      expect(authService.resetPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        resetToken: 'b'.repeat(64),
        newPassword: 'brand-new-password',
      })

      // Step 4: SUCCESS
      expect(await screen.findByText('Password reset successfully')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Go to log in' }))
    })
  })
})
