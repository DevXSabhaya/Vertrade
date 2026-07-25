import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

export default function VirtualTrading() {
  return (
    <>
      <Seo
        title="Virtual Trading — Trade With a Virtual Balance, Not Real Money"
        description="Virtual trading lets you buy and sell with a virtual balance instead of real money. Understand how virtual trading works and what it can (and can't) teach you."
        path="/virtual-trading"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">What Is Virtual Trading?</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          Virtual trading means placing trades against a virtual balance — a number the platform
          tracks for you — instead of real cash in a real brokerage account. Every buy, sell, gain,
          and loss is simulated, so the outcome only affects your virtual balance, never your
          actual finances.
        </p>

        <section className="mt-12 grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold text-ink-900">What virtual trading is good for</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">Learning the mechanics.</strong> Order entry,
                stop-losses, targets, and position tracking — all without financial consequence.
              </li>
              <li>
                <strong className="text-ink-900">Testing an approach.</strong> Try out a sizing
                rule or entry idea across many trades before committing real capital.
              </li>
              <li>
                <strong className="text-ink-900">Getting comfortable with a platform.</strong>{' '}
                Know exactly how a trade behaves on {branding.name} before ever considering live
                trading elsewhere.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-900">What virtual trading can't fully teach</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">The emotional weight of real risk.</strong>{' '}
                Trading real money carries psychological pressure that a virtual balance simply
                doesn't replicate.
              </li>
              <li>
                <strong className="text-ink-900">Real-world execution friction.</strong> Slippage,
                liquidity limits, and timing in live markets can differ from simulated fills.
              </li>
              <li>
                <strong className="text-ink-900">Guaranteed future performance.</strong> A strong
                virtual track record does not guarantee the same results with real capital in real
                markets.
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-ink-200 bg-ink-50 p-6">
          <h2 className="font-semibold text-ink-900">Virtual trading on {branding.name}</h2>
          <p className="mt-2 text-sm text-ink-600">
            Your account gets a virtual balance automatically on sign-up. From there, every trade
            you place — quantity, entry, stop-loss, targets — is checked by the same validation
            and risk-management logic a live pipeline would use, then simulated-filled. Your
            available balance, used margin, and realized/unrealized P&amp;L update exactly like a
            real account would, just without real money changing hands.
          </p>
        </section>

        <section className="mt-16 border-t border-ink-100 pt-10">
          <h2 className="text-xl font-bold text-ink-900">Continue learning</h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link to="/paper-trading" className="text-brand-600 hover:underline">
                What is paper trading?
              </Link>
            </li>
            <li>
              <Link to="/paper-trading-simulator" className="text-brand-600 hover:underline">
                Paper trading simulator
              </Link>
            </li>
            <li>
              <Link to="/learn" className="text-brand-600 hover:underline">
                Learn to trade
              </Link>
            </li>
          </ul>
        </section>
      </Container>

      <CtaBanner heading="Get your virtual balance in under a minute" />
    </>
  )
}
