import { Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { branding } from '@/config/branding'

const topics = [
  {
    title: 'How paper trading works',
    description: 'A step-by-step walkthrough of the full trade lifecycle, from order to close.',
    to: '/how-paper-trading-works',
  },
  {
    title: 'What is paper trading?',
    description: 'The basics of practicing with a virtual balance and why traders use it.',
    to: '/paper-trading',
  },
  {
    title: 'What is virtual trading?',
    description: "Understand what a virtual balance can — and can't — teach you.",
    to: '/virtual-trading',
  },
  {
    title: 'Stock market simulator',
    description: 'Practice long and short stock positions with realistic order mechanics.',
    to: '/stock-market-simulator',
  },
  {
    title: 'Options paper trading',
    description: 'Why defined-risk practice matters even more for options.',
    to: '/options-paper-trading',
  },
  {
    title: 'Paper trading simulator',
    description: 'A closer look at the order, risk, and lifecycle mechanics under the hood.',
    to: '/paper-trading-simulator',
  },
]

const basics = [
  {
    heading: 'Start with a plan, not a guess',
    body: 'Before you place a trade, decide your entry, your stop-loss, and your target. Writing this down — even mentally — before you submit an order is the single habit paper trading is best for building.',
  },
  {
    heading: 'A stop-loss is not optional',
    body: "A stop-loss defines the price at which you accept you were wrong and exit. Trading without one means an open-ended loss — practicing with one every time, on every trade, is what makes the habit stick.",
  },
  {
    heading: 'Position size before conviction',
    body: "How much you trade matters more than how sure you feel. Consistently sizing positions relative to your account, rather than your confidence in a single idea, is what most new traders skip — and what paper trading is a safe place to practice.",
  },
  {
    heading: 'Review every closed trade',
    body: 'A trade history is only useful if you look at it. Reviewing your entries, exits, and P&L after the fact — win or lose — is how a pattern in your own decision-making becomes visible.',
  },
]

export default function Learn() {
  return (
    <>
      <Seo
        title="Learn to Trade — Free Paper Trading Education"
        description="Free educational resources on paper trading, virtual trading, stop-losses, targets, and risk management — start learning to trade with zero real-money risk."
        path="/learn"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">Learn to Trade</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          A short foundation in how paper trading works and the habits worth practicing before you
          ever risk real capital. Start here, then explore the linked topics below.
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink-900">Four habits worth practicing first</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {basics.map((item) => (
              <div key={item.heading} className="rounded-xl border border-ink-200 p-6">
                <h3 className="font-semibold text-ink-900">{item.heading}</h3>
                <p className="mt-2 text-sm text-ink-500">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-xl font-bold text-ink-900">Explore the topics</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => (
              <Link
                key={topic.to}
                to={topic.to}
                className="rounded-xl border border-ink-200 p-5 transition-colors hover:border-brand-300 hover:bg-brand-50"
              >
                <h3 className="font-semibold text-ink-900">{topic.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{topic.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-xl border border-ink-200 bg-ink-50 p-6 text-center">
          <p className="text-sm text-ink-600">
            Ready to put it into practice? Create a free {branding.name} account and place your
            first paper trade with a virtual balance.
          </p>
          <Link to="/register" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Start Paper Trading Free →
          </Link>
        </section>
      </Container>
    </>
  )
}
