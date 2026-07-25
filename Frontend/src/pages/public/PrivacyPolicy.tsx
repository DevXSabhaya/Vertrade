import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { branding } from '@/config/branding'

export default function PrivacyPolicy() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description={`How ${branding.name} collects, uses, and protects your information.`}
        path="/privacy-policy"
      />

      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold text-ink-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-ink-400">Last updated: July 21, 2026</p>

          <div className="mt-8 flex flex-col gap-6 text-sm text-ink-600">
            <section>
              <h2 className="text-lg font-semibold text-ink-900">1. What we collect</h2>
              <p className="mt-2">
                When you create a {branding.name} account, we collect the email address and
                display name you provide, and we store a securely hashed version of your password
                — we never store your password in plain text. We also store the paper trading
                activity you generate: your virtual account balance, paper trades, and related
                trading history.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">2. How we use it</h2>
              <p className="mt-2">
                We use your account information to authenticate you, operate your paper trading
                account, and improve the product. We do not sell your personal information to
                third parties.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">3. What we never collect</h2>
              <p className="mt-2">
                {branding.name} is a paper trading simulator. We never ask for or store real bank
                account details, real brokerage credentials, or payment card information as part
                of the paper trading experience.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">4. Data security</h2>
              <p className="mt-2">
                Passwords are hashed using industry-standard algorithms before storage. Access to
                your account requires a signed authentication token, and every request is scoped
                to your own account — other users can never view or act on your data.
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">5. Your rights</h2>
              <p className="mt-2">
                You may request access to, correction of, or deletion of your account data at any
                time by contacting us at{' '}
                <a href={`mailto:${branding.supportEmail}`} className="text-brand-600 underline">
                  {branding.supportEmail}
                </a>
                .
              </p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink-900">6. Changes to this policy</h2>
              <p className="mt-2">
                We may update this policy from time to time. Material changes will be reflected on
                this page with an updated "last updated" date.
              </p>
            </section>
          </div>
        </div>
      </Container>
    </>
  )
}
