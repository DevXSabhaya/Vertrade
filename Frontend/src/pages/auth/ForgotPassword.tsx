import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { authService } from '@/services/auth.service'
import { getErrorMessage } from '@/lib/error-message'
import { branding } from '@/config/branding'

type Step = 'email' | 'code' | 'password' | 'done'

/**
 * Only `email`/`code` are ever persisted — deliberately never `password` or
 * `done`, and `resetToken` is never written to storage at all. A
 * server-issued `resetToken` is short-lived, single-use authorization: if it
 * survived a remount (page refresh, or navigating away from and back to
 * /forgot-password, or a stale second tab), the wizard would resume
 * straight at the new-password screen with no fresh OTP verification in
 * this session — exactly the "Forgot Password opens Set a new password"
 * bug. Restricting persistence to `email`/`code` makes that state
 * unreachable by construction: the *only* way to ever reach `password` is
 * the in-memory `setStep('password')` call inside `handleVerifyCode`,
 * immediately after a real backend verification response.
 */
interface PersistedState {
  readonly step: 'email' | 'code'
  readonly email: string
  readonly cooldownEndsAt: number | null
  /** Backend-issued UTC ISO timestamp — the OTP countdown's only source of truth (RESET_TOKEN_TTL_MINUTES = 15 minutes server-side). */
  readonly codeExpiresAt: string | null
}

const STORAGE_KEY = 'vertrade.passwordResetWizard'

function loadStoredState(): PersistedState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState> & { step?: unknown }
    if (parsed.step !== 'code') return null
    if (typeof parsed.email !== 'string' || parsed.email.length === 0) return null
    return {
      step: 'code',
      email: parsed.email,
      cooldownEndsAt: typeof parsed.cooldownEndsAt === 'number' ? parsed.cooldownEndsAt : null,
      codeExpiresAt: typeof parsed.codeExpiresAt === 'string' ? parsed.codeExpiresAt : null,
    }
  } catch {
    return null
  }
}

function saveStoredState(state: PersistedState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function clearStoredState(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

/** "z***@gmail.com" — never the full address, shown as context during the code/password steps. */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`
}

/**
 * The complete password-reset state machine, enforced client-side and
 * re-validated server-side at every step:
 *
 *   EMAIL_ENTRY -> (submit email) -> OTP_VERIFICATION
 *   OTP_VERIFICATION -> (correct, non-expired OTP) -> PASSWORD_RESET_AUTHORIZED -> NEW_PASSWORD
 *   NEW_PASSWORD -> (successful reset) -> SUCCESS
 *
 * There is no code path that sets `step` to `'password'` other than a
 * successful `verifyResetCode` response inside this same component
 * instance — no default, no persisted value, no URL parameter is ever
 * read into it. The backend is the actual authority: `resetToken` is
 * opaque here and only meaningful because `/auth/reset-password` verifies
 * it server-side (hashed, single-use, short-lived) — this component holding
 * it in memory is a UX convenience, not the security boundary.
 */
export default function ForgotPassword() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>(() => loadStoredState()?.step ?? 'email')
  const [email, setEmail] = useState(() => loadStoredState()?.email ?? '')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(
    () => loadStoredState()?.cooldownEndsAt ?? null,
  )
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(
    () => loadStoredState()?.codeExpiresAt ?? null,
  )
  const [codeSecondsRemaining, setCodeSecondsRemaining] = useState(0)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendNotice, setResendNotice] = useState<string | null>(null)

  useEffect(() => {
    if (step === 'code') {
      saveStoredState({ step, email, cooldownEndsAt, codeExpiresAt })
    } else {
      // Covers 'email' (nothing to resume), and — critically — 'password'
      // and 'done': neither is ever allowed to be resumable, so any
      // storage from an earlier code-step visit is dropped the moment the
      // wizard advances past it.
      clearStoredState()
    }
  }, [step, email, cooldownEndsAt, codeExpiresAt])

  useEffect(() => {
    const tick = () => {
      const remaining = cooldownEndsAt
        ? Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000))
        : 0
      setCooldownRemaining(remaining)
    }
    tick()
    if (!cooldownEndsAt) return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [cooldownEndsAt])

  // The OTP countdown itself: recomputed every tick from the backend's
  // `codeExpiresAt` timestamp, so a page refresh (which reloads
  // `codeExpiresAt` from sessionStorage, not a paused local timer) still
  // shows the correct remaining time — and the backend independently
  // rejects the code once it's actually expired regardless of what this
  // display shows.
  useEffect(() => {
    const tick = () => {
      const remaining = codeExpiresAt
        ? Math.max(0, Math.round((new Date(codeExpiresAt).getTime() - Date.now()) / 1000))
        : 0
      setCodeSecondsRemaining(remaining)
    }
    tick()
    if (!codeExpiresAt) return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [codeExpiresAt])

  const isCodeExpired = step === 'code' && codeExpiresAt !== null && codeSecondsRemaining <= 0

  function formatCodeCountdown(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  async function handleSendCode(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setIsSubmitting(true)
    try {
      const result = await authService.forgotPassword({ email })
      setCooldownEndsAt(Date.now() + result.cooldownSeconds * 1000)
      setCodeExpiresAt(result.codeExpiresAt)
      setStep('code')
    } catch (error) {
      setFormError(getErrorMessage(error, 'Something went wrong. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    setFormError(null)
    setResendNotice(null)
    setIsResending(true)
    try {
      const result = await authService.resendResetCode({ email })
      setCooldownEndsAt(Date.now() + result.cooldownSeconds * 1000)
      setCodeExpiresAt(result.codeExpiresAt)
      setCode('')
      setResendNotice('New verification code sent to your email.')
    } catch (error) {
      setFormError(
        getErrorMessage(error, 'Could not resend the code. Please try again.'),
      )
    } finally {
      setIsResending(false)
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    // The backend independently rejects an expired code regardless of this
    // check — this is purely to avoid an unnecessary round trip once the
    // client already knows (from the backend-issued `codeExpiresAt`) that
    // the code can no longer be valid.
    if (isCodeExpired) {
      setFormError('This verification code has expired. Please request a new code.')
      return
    }
    setIsSubmitting(true)
    try {
      const result = await authService.verifyResetCode({ email, code })
      // The ONLY place `step` is ever set to 'password' — immediately after
      // a real, successful backend verification response in this same
      // component instance. Never persisted (see the effect above), never
      // defaulted, never read from a URL parameter.
      setResetToken(result.resetToken)
      setStep('password')
    } catch (error) {
      setFormError(
        getErrorMessage(error, 'Invalid verification code. Please check the code and try again.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetPassword(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (newPassword !== confirmPassword) {
      setFormError('Passwords do not match.')
      return
    }
    if (newPassword.length < 8) {
      setFormError('Password must be at least 8 characters.')
      return
    }
    if (!resetToken) {
      // Defense in depth — `step` cannot legitimately be 'password' without
      // `resetToken` also having just been set in the same render cycle
      // (see handleVerifyCode), but never trust that alone: if this ever
      // fires, treat it as unauthorized and bounce to the start.
      setFormError('Your session has expired. Please request a new code.')
      setStep('email')
      return
    }

    setIsSubmitting(true)
    try {
      await authService.resetPassword({ email, resetToken, newPassword })
      // The backend invalidates the session token (and any other pending
      // reset state for this user) on a successful reset — single-use is
      // enforced server-side. Clearing it here too means even this same
      // browser tab can't attempt to resubmit it.
      setResetToken(null)
      clearStoredState()
      setStep('done')
    } catch (error) {
      setFormError(
        getErrorMessage(
          error,
          'Your session has expired. Please request a new code.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Used by both "Change email" (from the code step) and "Use a different email" (from the expired state) — always the same transition: back to EMAIL_ENTRY with a clean slate. */
  function changeEmail() {
    clearStoredState()
    setStep('email')
    setEmail('')
    setCode('')
    setResetToken(null)
    setCooldownEndsAt(null)
    setCodeExpiresAt(null)
    setFormError(null)
    setResendNotice(null)
  }

  return (
    <>
      <Seo
        title="Forgot Password"
        description={`Reset your ${branding.name} account password.`}
        path="/forgot-password"
        noIndex
      />
      <Container className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-sm">
          {step === 'email' && (
            <>
              <h1 className="text-2xl font-bold text-ink-900">Reset your password</h1>
              <p className="mt-2 text-sm text-ink-500">
                Enter your account email and we'll send you a verification code.
              </p>
              <form className="mt-8 flex flex-col gap-4" onSubmit={handleSendCode} noValidate>
                <Input
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-loss-600">
                    {formError}
                  </p>
                )}
                <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
                  Send verification code
                </Button>
              </form>
            </>
          )}

          {step === 'code' && (
            <>
              <h1 className="text-2xl font-bold text-ink-900">Enter the verification code</h1>
              <p className="mt-2 text-sm text-ink-500">
                Enter the 6-digit code sent to <strong>{maskEmail(email)}</strong>.
              </p>
              {!isCodeExpired && codeExpiresAt && (
                <p className="mt-2 text-sm text-ink-500">
                  Code expires in{' '}
                  <span className="font-medium text-ink-900">
                    {formatCodeCountdown(codeSecondsRemaining)}
                  </span>
                </p>
              )}
              {isCodeExpired && (
                <div className="mt-4 rounded-lg border border-loss-200 bg-loss-50 p-4">
                  <p role="alert" className="text-sm font-medium text-loss-700">
                    This verification code has expired.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      isLoading={isResending}
                      disabled={cooldownRemaining > 0}
                      onClick={() => void handleResend()}
                      className="w-full"
                    >
                      {cooldownRemaining > 0 ? `Resend code in ${cooldownRemaining}s` : 'Resend code'}
                    </Button>
                    <Button type="button" variant="secondary" onClick={changeEmail} className="w-full">
                      Use a different email
                    </Button>
                  </div>
                </div>
              )}
              {!isCodeExpired && (
                <form className="mt-8 flex flex-col gap-4" onSubmit={handleVerifyCode} noValidate>
                  <Input
                    label="Verification code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    maxLength={6}
                    required
                    autoFocus
                  />
                  {resendNotice && (
                    <p className="text-sm font-medium text-brand-700">{resendNotice}</p>
                  )}
                  {formError && (
                    <p role="alert" className="text-sm font-medium text-loss-600">
                      {formError}
                    </p>
                  )}
                  <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
                    Verify code
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    isLoading={isResending}
                    disabled={cooldownRemaining > 0}
                    onClick={() => void handleResend()}
                    className="w-full"
                  >
                    {cooldownRemaining > 0
                      ? `Resend code in ${cooldownRemaining}s`
                      : 'Resend code'}
                  </Button>
                </form>
              )}
              <p className="mt-6 text-center text-sm text-ink-500">
                Wrong email?{' '}
                <button
                  type="button"
                  onClick={changeEmail}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Change email
                </button>
              </p>
            </>
          )}

          {step === 'password' && resetToken && (
            <>
              <h1 className="text-2xl font-bold text-ink-900">Set a new password</h1>
              <p className="mt-2 text-sm text-ink-500">
                Choose a new password for <strong>{maskEmail(email)}</strong>.
              </p>
              <form
                className="mt-8 flex flex-col gap-4"
                onSubmit={handleResetPassword}
                noValidate
              >
                <Input
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  required
                />
                <Input
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  required
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-loss-600">
                    {formError}
                  </p>
                )}
                <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
                  Reset password
                </Button>
              </form>
            </>
          )}

          {step === 'done' && (
            <>
              <h1 className="text-2xl font-bold text-ink-900">Password reset successfully</h1>
              <div className="mt-6 rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
                <p className="font-semibold">Your password has been reset successfully.</p>
                <p className="mt-2">You can now log in with your new password.</p>
              </div>
              <Button
                type="button"
                className="mt-6 w-full"
                onClick={() => navigate('/login', { replace: true })}
              >
                Go to log in
              </Button>
            </>
          )}

          {step !== 'done' && (
            <p className="mt-6 text-center text-sm text-ink-500">
              <Link to="/login" className="font-medium text-brand-600 hover:underline">
                Back to log in
              </Link>
            </p>
          )}
        </div>
      </Container>
    </>
  )
}
