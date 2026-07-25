import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { branding } from '@/config/branding'

export default function Terms() {
  return (
    <>
      <Seo
        title="Terms of Service"
        description={`The terms that govern your use of ${branding.name}'s free paper trading platform.`}
        path="/terms"
      />

      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold text-ink-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-ink-400">Last updated: July 21, 2026</p>

          <div className="mt-8 flex flex-col gap-6 text-sm text-ink-600">
            <section>
              <h2 className="text-lg font-semibold text-ink-900">1. The service</h2>
              <p className="mt-2">
                {branding.name} provides a free paper trading simulator that lets you practice
                placing simulated trades using a virtual balance. No real money, real securities,
                or real brokerage account is involved at any point.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">2. Eligibility</h2>
              <p className="mt-2">
                You must provide accurate registration information and keep your account
                credentials confidential. You are responsible for all activity under your account.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">3. Acceptable use</h2>
              <p className="mt-2">
                You agree not to misuse the platform — including attempting to access another
                user's account or data, disrupting the service, or using the platform for any
                unlawful purpose.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">4. No investment advice</h2>
              <p className="mt-2">
                Nothing on {branding.name}, including any market data, price behavior, or
                simulated results, constitutes investment, financial, or trading advice. See our{' '}
                <a href="/disclaimer" className="text-brand-600 underline">
                  Risk Disclaimer
                </a>{' '}
                for details.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">5. Service availability</h2>
              <p className="mt-2">
                We aim to keep {branding.name} available and reliable but do not guarantee
                uninterrupted access. Features may change, and paper account data is provided for
                practice purposes, not as a permanent financial record.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">6. Termination</h2>
              <p className="mt-2">
                We may suspend or terminate accounts that violate these terms. You may stop using
                the service and request account deletion at any time.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">7. Limitation of liability</h2>
              <p className="mt-2">
                {branding.name} is provided "as is" for educational and practice purposes. We are
                not liable for any decisions made based on paper trading activity, including any
                real-world trading decisions you make after using the platform.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">8. Contact</h2>
              <p className="mt-2">
                Questions about these terms can be sent to{' '}
                <a href={`mailto:${branding.supportEmail}`} className="text-brand-600 underline">
                  {branding.supportEmail}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </Container>
    </>
  )
}
