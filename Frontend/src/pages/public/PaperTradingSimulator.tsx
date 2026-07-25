import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

const workflow = [
  {
    title: 'Define your trade',
    body: 'Pick an instrument, direction, quantity, entry price, stop-loss, and one or more profit targets — the same inputs a real order ticket asks for.',
  },
  {
    title: 'The simulator validates it',
    body: 'Your order is checked for correctness and measured against your virtual balance and configured risk limits before it is ever accepted.',
  },
  {
    title: 'It fills in the simulator',
    body: 'A paper executor fills the order using available price data — no real exchange, no real broker, no real money.',
  },
  {
    title: 'You manage the position',
    body: 'Track unrealized profit and loss live, watch your stop-loss and targets, and exit manually whenever you choose.',
  },
  {
    title: 'Review the result',
    body: 'Every closed trade lands in your history with entry, exit, P&L, and timestamps, so you can study your own decisions.',
  },
]

export default function PaperTradingSimulator() {
  return (
    <>
      <Seo
        title="Paper Trading Simulator — Practice Orders, Risk, and Exits"
        description="A paper trading simulator that mirrors real order, risk-management, and trade-lifecycle mechanics — practice the full trade workflow with a free virtual balance."
        path="/paper-trading-simulator"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">Paper Trading Simulator</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          A paper trading simulator is software that lets you place, manage, and close simulated
          trades the same way a real trading platform would — without ever touching real money.
          {` ${branding.name}`}'s simulator runs every paper trade through the same order,
          validation, and risk-management workflow a live platform uses.
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink-900">Inside the simulator: one trade, start to finish</h2>
          <ol className="mt-6 flex flex-col gap-6">
            {workflow.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-ink-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16 grid gap-6 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-200 p-6">
            <h3 className="font-semibold text-ink-900">Stop-loss &amp; targets</h3>
            <p className="mt-2 text-sm text-ink-500">
              Every trade requires a defined stop-loss and at least one profit target before
              submission — building disciplined risk habits from trade one.
            </p>
          </div>
          <div className="rounded-xl border border-ink-200 p-6">
            <h3 className="font-semibold text-ink-900">Multiple targets</h3>
            <p className="mt-2 text-sm text-ink-500">
              Add more than one target to practice scaling out of a position instead of exiting
              all at once.
            </p>
          </div>
          <div className="rounded-xl border border-ink-200 p-6">
            <h3 className="font-semibold text-ink-900">Full trade lifecycle</h3>
            <p className="mt-2 text-sm text-ink-500">
              Watch a trade move from pending to open to closed, with real status at every step —
              not a single "trade complete" popup.
            </p>
          </div>
        </section>

        <section className="mt-16 border-t border-ink-100 pt-10">
          <h2 className="text-xl font-bold text-ink-900">Related pages</h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link to="/paper-trading" className="text-brand-600 hover:underline">
                What is paper trading?
              </Link>
            </li>
            <li>
              <Link to="/stock-market-simulator" className="text-brand-600 hover:underline">
                Stock market simulator
              </Link>
            </li>
            <li>
              <Link to="/how-paper-trading-works" className="text-brand-600 hover:underline">
                How paper trading works
              </Link>
            </li>
          </ul>
        </section>
      </Container>

      <CtaBanner heading="Try the simulator with your first paper trade" />
    </>
  )
}
