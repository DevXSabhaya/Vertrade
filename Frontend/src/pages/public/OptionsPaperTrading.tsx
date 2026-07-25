import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

export default function OptionsPaperTrading() {
  return (
    <>
      <Seo
        title="Options Paper Trading — Practice Options Strategies Free"
        description="Practice options trading with a free simulator: virtual balance, defined entries, stop-loss and target management, and full trade history — with no real-money risk."
        path="/options-paper-trading"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">Options Paper Trading</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          Options carry more risk and complexity than plain stock positions — which makes practice
          even more valuable. {branding.name} lets you paper trade options-style setups with a
          defined entry, stop-loss, and targets, using the exact same risk-checked order pipeline
          as every other paper trade.
        </p>

        <section className="mt-12 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-ink-900">Why practice options specifically</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">Higher risk per trade.</strong> Options can move
                fast and lose value quickly — practicing position sizing and stop discipline
                matters more here than with plain stock trades.
              </li>
              <li>
                <strong className="text-ink-900">Defined-risk entries.</strong> Every paper trade
                requires a stop-loss and at least one target before it's accepted, reinforcing the
                habit of knowing your risk before you enter.
              </li>
              <li>
                <strong className="text-ink-900">Learn without tuition fees.</strong> Options
                mistakes in a live account are expensive lessons — in a paper account, they're
                free lessons.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-900">How it works on {branding.name}</h2>
            <ol className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">1.</strong> Choose your instrument and direction.
              </li>
              <li>
                <strong className="text-ink-900">2.</strong> Set your quantity, entry price,
                stop-loss, and one or more profit targets.
              </li>
              <li>
                <strong className="text-ink-900">3.</strong> Your order runs through validation
                and risk management before it's accepted.
              </li>
              <li>
                <strong className="text-ink-900">4.</strong> Track the position and P&amp;L live,
                then exit manually or let your risk plan trigger the exit.
              </li>
            </ol>
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="font-semibold text-amber-800">A note on real options trading</h2>
          <p className="mt-2 text-sm text-amber-700">
            Real options trading involves additional real-world factors — like time decay,
            implied volatility, assignment risk, and liquidity — that a simplified paper trading
            environment does not fully model. {branding.name} is an educational practice tool, not
            a substitute for options-specific education or professional financial advice, and past
            or simulated performance is not indicative of future results.
          </p>
        </section>
      </Container>

      <CtaBanner
        heading="Practice your next options setup risk-free"
        description="Build the habit of defined-risk entries before you ever trade options with real money."
      />
    </>
  )
}
