import { Link } from 'react-router-dom'
import { Container } from './Container'
import { Button } from '@/components/ui/Button'

export function CtaBanner({
  heading = 'Start practicing risk-free, in minutes.',
  description = 'Create a free account and get a virtual balance instantly. No card, no risk, no pressure.',
}: {
  readonly heading?: string
  readonly description?: string
}) {
  return (
    <section className="bg-ink-950 py-16 text-white">
      <Container className="flex flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">{heading}</h2>
        <p className="max-w-xl text-ink-300">{description}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link to="/register">
            <Button size="lg">Start Paper Trading Free</Button>
          </Link>
          <Link to="/how-paper-trading-works">
            <Button variant="secondary" size="lg" className="bg-transparent text-white border-white/30 hover:bg-white/10">
              Learn How Paper Trading Works
            </Button>
          </Link>
        </div>
      </Container>
    </section>
  )
}
