import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { CtaBanner } from '@/components/marketing/CtaBanner'
import { branding } from '@/config/branding'

export default function About() {
  return (
    <>
      <Seo
        title="About Us"
        description={`Learn why ${branding.name} exists: to give traders a genuinely realistic, risk-free way to practice trading before committing real capital.`}
        path="/about"
      />

      <Container className="py-16 sm:py-20">
        <h1 className="text-4xl font-extrabold text-ink-900">About {branding.name}</h1>

        <div className="mt-8 flex flex-col gap-6 text-ink-600">
          <p>
            Most people are told to "practice before you trade with real money" — but few tools
            actually let you practice in a way that resembles the real thing. Either the
            simulation is too simplistic to teach real habits, or the platform pushes you toward
            real-money trading before you're ready.
          </p>
          <p>
            {branding.name} was built to close that gap: a paper trading platform that puts you
            through the same validation, risk-management, and order-lifecycle mechanics a real
            trading system uses — entirely with a virtual balance, entirely free, and with zero
            real-money risk.
          </p>
          <p>
            Our goal is simple: help people build real trading discipline — sizing positions
            sensibly, always defining a stop-loss, understanding how P&amp;L actually behaves — in
            an environment where mistakes are lessons, not losses.
          </p>
          <p>
            {branding.name} is an educational and practice tool. It does not provide investment
            advice, does not manage real funds, and does not guarantee that results in a paper
            account will be repeated with real capital in live markets.
          </p>
        </div>
      </Container>

      <CtaBanner heading="Come practice with us" />
    </>
  )
}
