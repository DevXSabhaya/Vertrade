import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

const faqs = [
  {
    question: 'Is paper trading really free?',
    answer:
      `Yes. Creating a ${branding.name} account and trading with your virtual balance is free. There is no card required and no hidden fee for the core paper trading experience.`,
  },
  {
    question: 'Do I need real money to start?',
    answer:
      'No. Your account is funded with a virtual balance automatically when you register. You never connect a bank account, card, or broker.',
  },
  {
    question: 'Can I lose real money paper trading?',
    answer:
      'No. Paper trading only ever affects your virtual balance. Nothing you do sends an order to a real exchange or broker.',
  },
  {
    question: 'How realistic is the simulation?',
    answer:
      `Your paper trades pass through the same trade validation, risk-management, and order-lifecycle logic a live trading pipeline uses — so the mechanics of entering, managing, and exiting a trade closely mirror a real platform, even though execution is simulated.`,
  },
]

export default function PaperTrading() {
  return (
    <>
      <Seo
        title="Free Paper Trading — Practice With a Virtual Balance"
        description="Paper trading lets you practice buying and selling stocks with a virtual balance and zero real-money risk. Learn how paper trading works and start free."
        path="/paper-trading"
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }}
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">Paper Trading, Explained</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          Paper trading is the practice of simulating trades using a virtual balance instead of
          real money. It lets you learn how orders, positions, and risk management actually work
          before you ever risk real capital.
        </p>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-xl font-bold text-ink-900">Why traders use paper trading</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">Learn without risk.</strong> Mistakes cost you
                nothing but time — a far better way to learn order types, stop-losses, and
                position sizing than learning with real money.
              </li>
              <li>
                <strong className="text-ink-900">Test a strategy.</strong> Run a trading idea
                through many market conditions before committing real capital to it.
              </li>
              <li>
                <strong className="text-ink-900">Build discipline.</strong> Practicing consistent
                risk management — always using a stop-loss, sizing positions sensibly — becomes a
                habit before it has real financial consequences.
              </li>
              <li>
                <strong className="text-ink-900">Understand platform mechanics.</strong> Get
                comfortable with how orders, targets, and exits behave before trading live.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-ink-900">
              What a {branding.name} paper trade actually does
            </h2>
            <ol className="mt-4 flex flex-col gap-3 text-sm text-ink-600">
              <li>
                <strong className="text-ink-900">1. You submit an order</strong> — instrument,
                direction, quantity, entry price, stop-loss, and one or more targets.
              </li>
              <li>
                <strong className="text-ink-900">2. It's validated</strong> — the same trade
                validation rules a real order would go through check that the request is
                well-formed and tradeable.
              </li>
              <li>
                <strong className="text-ink-900">3. Risk is checked</strong> — the trade is
                measured against your available virtual balance and configured risk limits before
                it's accepted.
              </li>
              <li>
                <strong className="text-ink-900">4. It's simulated-executed</strong> — a paper
                executor fills the order against available price data, and the position enters
                your active trades list.
              </li>
              <li>
                <strong className="text-ink-900">5. You manage and exit it</strong> — track
                unrealized P&amp;L, then exit manually or let your stop-loss/target logic close it.
              </li>
            </ol>
          </section>
        </div>

        <section className="mt-16">
          <h2 className="text-xl font-bold text-ink-900">Frequently asked questions</h2>
          <dl className="mt-6 flex flex-col gap-6">
            {faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-semibold text-ink-900">{faq.question}</dt>
                <dd className="mt-1 text-sm text-ink-600">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-16 border-t border-ink-100 pt-10">
          <h2 className="text-xl font-bold text-ink-900">Explore further</h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link to="/how-paper-trading-works" className="text-brand-600 hover:underline">
                How paper trading works, step by step
              </Link>
            </li>
            <li>
              <Link to="/stock-market-simulator" className="text-brand-600 hover:underline">
                Stock market simulator
              </Link>
            </li>
            <li>
              <Link to="/virtual-trading" className="text-brand-600 hover:underline">
                What is virtual trading?
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

      <CtaBanner />
    </>
  )
}
