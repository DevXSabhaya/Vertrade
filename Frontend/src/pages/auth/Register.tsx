import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/store/auth-context'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/error-message'
import { branding } from '@/config/branding'

interface FieldErrors {
  email?: string
  password?: string
  displayName?: string
}

function validate(email: string, password: string, displayName: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.'
  }
  if (displayName.trim().length < 1) {
    errors.displayName = 'Enter your name.'
  }
  return errors
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const errors = validate(email, password, displayName)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await register({ email, password, displayName })
      toast.show(`Welcome to ${branding.name}! Your paper account is ready.`, 'success')
      navigate('/app', { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Registration failed. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Create Your Free Account"
        description={`Sign up for ${branding.name} and start paper trading with a free virtual balance in minutes.`}
        path="/register"
        noIndex
      />
      <Container className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-ink-900">Create your free account</h1>
          <p className="mt-2 text-sm text-ink-500">
            No card required. Your paper trading balance is ready instantly.
          </p>

          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <Input
              label="Full name"
              autoComplete="name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              error={fieldErrors.displayName}
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={fieldErrors.password}
              hint="At least 8 characters."
            />

            {formError && (
              <p role="alert" className="text-sm font-medium text-loss-600">
                {formError}
              </p>
            )}

            <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
              Start Paper Trading Free
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </Container>
    </>
  )
}
