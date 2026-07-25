import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/store/auth-context'
import { getErrorMessage } from '@/lib/error-message'
import { branding } from '@/config/branding'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app'

  const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  /**
   * Client-side validation only — never reveals whether an account exists
   * or which of email/password was wrong. Only checks well-formedness
   * (empty fields, obviously-malformed email); a genuine credential
   * mismatch is only ever detectable by calling the backend, which always
   * answers with the same generic "Invalid email or password." regardless
   * of the actual cause, preventing account enumeration.
   */
  function validate(): string | null {
    if (email.trim().length === 0) return 'Please enter your email address.'
    if (!EMAIL_FORMAT.test(email.trim())) return 'Please enter a valid email address.'
    if (password.length === 0) return 'Please enter your password.'
    return null
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)

    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setIsSubmitting(true)
    try {
      await login({ email, password })
      navigate(redirectTo, { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Invalid email or password.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Log In"
        description={`Log in to your ${branding.name} paper trading account.`}
        path="/login"
        noIndex
      />
      <Container className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-ink-900">Log in</h1>
          <p className="mt-2 text-sm text-ink-500">Welcome back to your paper trading account.</p>

          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Link
              to="/forgot-password"
              className="self-end text-xs font-medium text-brand-600 hover:underline"
            >
              Forgot password?
            </Link>

            {formError && (
              <p role="alert" className="text-sm font-medium text-loss-600">
                {formError}
              </p>
            )}

            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
              Log in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            New here?{' '}
            <Link to="/register" className="font-medium text-brand-600 hover:underline">
              Create a free account
            </Link>
          </p>
        </div>
      </Container>
    </>
  )
}
