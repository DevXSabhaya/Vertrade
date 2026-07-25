import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

const sections = [
  {
    title: '1. Your virtual account',
    body: `When you register, ${branding.name} automatically creates a paper trading account for you with a starting virtual balance. This balance behaves like real trading capital inside the app — you can use it, lose it, and grow it — but it is never real money and is never connected to a bank account or broker.`,
  },
  {
    title: '2. Placing a trade',
    body: 'You choose an instrument, a direction (long or short), a quantity, an entry price, a stop-loss, and at least one profit target. This mirrors how a disciplined trader defines risk before entering any position — you decide your risk and reward before you commit.',
  },
  {
    title: '3. Validation and risk management',
    body: 'Before your order is accepted, it passes through the same trade validation and risk-management checks a production trading system uses: is the instrument valid, is your quantity sane, does the position fit within your available virtual balance and configured risk limits. If a check fails, your order is rejected with a clear reason instead of silently disappearing.',
  },
  {
    title: '4. Simulated execution',
    body: "Once accepted, your order is queued and simulated-executed by a paper executor — no real order reaches any exchange or broker. The resulting position shows up on your Active Trades screen with live status.",
  },
  {
    title: '5. Managing the position',
    body: "While a trade is open, you can track its current status, entry, stop-loss, targets, and unrealized profit or loss. You can exit manually at any time, and every exit requires a clear confirmation so you never close a position by accident.",
  },
  {
    title: '6. Reviewing the outcome',
    body: 'Once a trade is closed — by your own exit or by hitting its stop-loss or target — it moves into your trade history along with its entry, exit, realized P&L, and timestamps, so you can review your decisions and improve over time.',
  },
]

export default function HowPaperTradingWorks() {
  return (
    <>
      <Seo
        title="How Paper Trading Works — Step-by-Step Guide"
        description="A clear, step-by-step explanation of how paper trading works on a virtual balance: order placement, risk checks, simulated execution, position management, and trade history."
        path="/how-paper-trading-works"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">How Paper Trading Works</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-600">
          From registration to a closed, reviewed trade — here's exactly what happens at every
          step of a {branding.name} paper trade.
        </p>

        <ol className="mt-12 flex flex-col gap-10">
          {sections.map((section) => (
            <li key={section.title} className="border-l-2 border-brand-200 pl-6">
              <h2 className="text-xl font-bold text-ink-900">{section.title}</h2>
              <p className="mt-2 max-w-2xl text-sm text-ink-600">{section.body}</p>
            </li>
          ))}
        </ol>
      </Container>

      <CtaBanner heading="Ready to place your first paper trade?" />
    </>
  )
}
