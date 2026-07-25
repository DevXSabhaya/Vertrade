import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Button } from '@/components/ui/Button'
import { branding } from '@/config/branding'

const freeFeatures = [
  'Free virtual paper trading balance',
  'Unlimited paper trades',
  'Stop-loss & multi-target order management',
  'Real-time position & P&L tracking',
  'Full trade history',
  'Risk-management checks on every order',
]

const futureFeatures = [
  'Advanced analytics & strategy reports',
  'Multiple simultaneous paper accounts',
  'Priority support',
  'Early access to live-trading readiness tools',
]

export default function Pricing() {
  return (
    <>
      <Seo
        title="Pricing — Free Paper Trading, Forever"
        description="Paper trading on Vertrade is free. See what's included today and what premium tools are planned for the future — the core practice experience will always stay free."
        path="/pricing"
      />

      <Container className="py-16 sm:py-20">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-ink-900">Simple, honest pricing</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-600">
            The core paper trading experience on {branding.name} is free — today and going
            forward. We plan to introduce optional premium tools for advanced traders in the
            future, but practicing without risk should never require paying for it.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-brand-600 p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
              Free — Always
            </p>
            <p className="mt-2 text-4xl font-extrabold text-ink-900">
              $0<span className="text-base font-medium text-ink-400">/month</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-ink-600">
              {freeFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-gain-600">
                    ✓
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link to="/register" className="mt-8 block">
              <Button className="w-full">Start Paper Trading Free</Button>
            </Link>
          </div>

          <div className="rounded-2xl border border-ink-200 p-8 opacity-80">
            <p className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Premium — Coming Later
            </p>
            <p className="mt-2 text-4xl font-extrabold text-ink-900">TBD</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-ink-600">
              {futureFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-ink-400">
                    →
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-center text-xs text-ink-400">
              Not available yet — announced here first.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-ink-400">
          {branding.name} does not sell investment advice, does not manage real money, and does
          not require payment to access the core paper trading tools described on this page.
        </p>
      </Container>
    </>
  )
}
