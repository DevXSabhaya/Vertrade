import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

const useCases = [
  {
    title: 'New investors',
    description:
      'Learn how buying and selling actually works, how orders fill, and how P&L moves — before opening a real brokerage account.',
  },
  {
    title: 'Active traders',
    description:
      'Backtest a new setup or strategy idea against live-feeling conditions without touching your real trading capital.',
  },
  {
    title: 'Students & educators',
    description:
      'Use a realistic, safe environment to teach or learn market mechanics, order types, and risk management in a classroom setting.',
  },
]

export default function StockMarketSimulator() {
  return (
    <>
      <Seo
        title="Stock Market Simulator — Practice Trading Stocks Free"
        description="A free stock market simulator with a virtual balance, realistic order flow, stop-loss and target management, and full position tracking. No real money required."
        path="/stock-market-simulator"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">Stock Market Simulator</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          {branding.name}'s stock market simulator gives you a virtual account and lets you place
          simulated buy and sell orders on stocks the same way you would on a real brokerage
          platform — entry price, quantity, stop-loss, and targets — with zero real-money risk.
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink-900">What the simulator covers</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-ink-200 p-6">
              <h3 className="font-semibold text-ink-900">Long and short positions</h3>
              <p className="mt-2 text-sm text-ink-500">
                Simulate buying stock expecting the price to rise, or selling short expecting it to
                fall — both directions are supported end-to-end.
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 p-6">
              <h3 className="font-semibold text-ink-900">Stop-loss & multi-target exits</h3>
              <p className="mt-2 text-sm text-ink-500">
                Define where you'll cut losses and where you'll take profit before you enter — the
                same discipline required in live trading.
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 p-6">
              <h3 className="font-semibold text-ink-900">Position & P&amp;L tracking</h3>
              <p className="mt-2 text-sm text-ink-500">
                Watch unrealized P&amp;L update on open positions, then review the realized outcome
                once a trade is closed.
              </p>
            </div>
            <div className="rounded-xl border border-ink-200 p-6">
              <h3 className="font-semibold text-ink-900">Risk-checked orders</h3>
              <p className="mt-2 text-sm text-ink-500">
                Every simulated order is checked against your available virtual balance and
                configured risk limits before it's accepted, exactly like a broker's risk engine.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-xl font-bold text-ink-900">Who uses a stock market simulator</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {useCases.map((useCase) => (
              <div key={useCase.title}>
                <h3 className="font-semibold text-ink-900">{useCase.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{useCase.description}</p>
              </div>
            ))}
          </div>
        </section>
      </Container>

      <CtaBanner
        heading="Simulate your first stock trade today"
        description="Create a free account, get a virtual balance, and place your first simulated trade in minutes."
      />
    </>
  )
}
