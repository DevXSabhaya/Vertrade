import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { branding } from '@/config/branding'

export default function Disclaimer() {
  return (
    <>
      <Seo
        title="Risk Disclaimer"
        description={`Important information about the limitations of paper trading and simulated results on ${branding.name}.`}
        path="/disclaimer"
      />

      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold text-ink-900">Risk Disclaimer</h1>
          <p className="mt-2 text-sm text-ink-400">Last updated: July 21, 2026</p>

          <div className="mt-8 flex flex-col gap-6 text-sm text-ink-600">
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-800">
                {branding.name} is a paper trading simulator. No real money, real securities, or
                real brokerage account is ever involved.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Not investment advice</h2>
              <p className="mt-2">
                Nothing on {branding.name} — including instrument data, simulated fills, or your
                own paper trading results — constitutes investment, financial, legal, or tax
                advice. You should not make real-money investment decisions based solely on
                activity in a paper trading account.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Simulated results have limits</h2>
              <p className="mt-2">
                Paper trading cannot fully replicate real markets. Simulated execution does not
                account for real-world factors such as slippage, liquidity constraints, exact
                order-book depth, market impact, and emotional pressure that come with trading
                real capital. Past or simulated performance is not indicative of future results,
                real or simulated.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">No guarantee of profit</h2>
              <p className="mt-2">
                We make no claims that success in paper trading will translate into success when
                trading with real money. Trading real capital carries a real risk of loss, up to
                and including the total loss of invested capital.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-ink-900">Do your own research</h2>
              <p className="mt-2">
                If you decide to trade with real money in the future, we strongly encourage you to
                do your own research and, where appropriate, consult a licensed financial advisor
                before making any real investment decisions.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </>
  )
}
