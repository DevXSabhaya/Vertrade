import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { Button } from '@/components/ui/Button'
import { branding } from '@/config/branding'

const capabilities = [
  {
    title: 'Free virtual balance',
    description:
      'Every account starts with a real, configurable virtual balance — trade with it exactly like real capital, with nothing at stake.',
  },
  {
    title: 'Realistic order workflow',
    description:
      'Submit a trade with an entry, stop-loss, and one or more targets. Your order runs through the same validation and risk-management pipeline a live platform would use.',
  },
  {
    title: 'Stop-loss & target management',
    description:
      'Define your risk before you enter. Track how price moves against your stop-loss and targets in real time on the active trades screen.',
  },
  {
    title: 'Risk management built in',
    description:
      'Every trade is checked against account balance, exposure, and risk-per-trade limits before it is accepted — just like a real broker would enforce.',
  },
  {
    title: 'Positions & live P&L',
    description:
      'See open positions, realized and unrealized profit and loss, and account equity update as your paper trades play out.',
  },
  {
    title: 'Full trade history',
    description:
      'Every trade you close is recorded with entry, exit, P&L, and timestamps — so you can review and learn from your own trading pattern.',
  },
]

const steps = [
  {
    title: 'Create a free account',
    description: 'Register with your email in under a minute. No payment details, ever, for paper trading.',
  },
  {
    title: 'Get a virtual balance',
    description: 'Your paper trading account is created automatically with a virtual balance you can trade with immediately.',
  },
  {
    title: 'Place a paper trade',
    description: 'Pick an instrument, direction, quantity, entry, stop-loss, and targets — submit it like a real order.',
  },
  {
    title: 'Track, manage, and learn',
    description: 'Watch your position, manage risk, exit when ready, and review the outcome in your trade history.',
  },
]

export default function Home() {
  return (
    <>
      <Seo
        title={`${branding.name} — Free Paper Trading Simulator`}
        description="Practice stock and options trading with a free paper trading simulator. Virtual balance, realistic order and risk mechanics, stop-loss, targets, and full trade history."
        path="/"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: branding.name,
          applicationCategory: 'FinanceApplication',
          description: branding.longDescription,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      <section className="bg-gradient-to-b from-brand-50 to-white py-16 sm:py-24">
        <Container className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight text-ink-900 sm:text-5xl">
              Practice trading. <span className="text-brand-600">Master the markets.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink-600">
              {branding.name} is a free paper trading simulator for stocks and options. Trade with a
              virtual balance, manage real risk with stop-losses and targets, and build trading
              discipline — without risking a single real rupee.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register">
                <Button size="lg">Start Paper Trading Free</Button>
              </Link>
              <Link to="/how-paper-trading-works">
                <Button variant="secondary" size="lg">
                  Learn How Paper Trading Works
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-400">
              No real money is ever used. {branding.name} is for practice and education only.
            </p>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Paper Trading Account
            </p>
            <p className="mt-2 text-3xl font-bold text-ink-900">₹1,00,000.00</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-ink-400">Available</p>
                <p className="font-semibold text-ink-900">₹92,500.00</p>
              </div>
              <div>
                <p className="text-ink-400">Used Margin</p>
                <p className="font-semibold text-ink-900">₹7,500.00</p>
              </div>
              <div>
                <p className="text-ink-400">Realized P&amp;L</p>
                <p className="font-semibold text-gain-600">+₹2,340.00</p>
              </div>
              <div>
                <p className="text-ink-400">Unrealized P&amp;L</p>
                <p className="font-semibold text-gain-600">+₹410.00</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-ink-400">Illustrative example — your account starts fresh.</p>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <h2 className="text-center text-3xl font-bold text-ink-900">
            Everything you need to practice trading properly
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-500">
            {branding.name} isn't a toy simulator — it runs your paper trades through the same
            validation, risk-management, and lifecycle mechanics a real trading system uses.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => (
              <div key={capability.title} className="rounded-xl border border-ink-200 p-6">
                <h3 className="font-semibold text-ink-900">{capability.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{capability.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="bg-ink-50 py-16 sm:py-20">
        <Container>
          <h2 className="text-center text-3xl font-bold text-ink-900">How it works</h2>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{step.description}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl text-center">
          <h2 className="text-2xl font-bold text-ink-900">Paper trading vs. live trading</h2>
          <p className="mt-4 text-ink-600">
            Paper trading uses simulated orders and a virtual balance — nothing you do on{' '}
            {branding.name} touches real money or a real broker account. It's a practice
            environment for learning order mechanics, risk management, and trading discipline
            before ever risking real capital. {branding.name} does not provide investment advice
            and does not guarantee that paper trading results will match live-market outcomes.
          </p>
        </Container>
      </section>

      <CtaBanner />
    </>
  )
}
