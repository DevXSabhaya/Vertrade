import { useState } from 'react'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/marketing/Container'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { branding } from '@/config/branding'

export default function Contact() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')

  const mailtoHref = `mailto:${branding.supportEmail}?subject=${encodeURIComponent(
    `Message from ${name || 'a visitor'}`,
  )}&body=${encodeURIComponent(`${message}\n\nFrom: ${name} (${email})`)}`

  return (
    <>
      <Seo
        title="Contact Us"
        description={`Get in touch with the ${branding.name} team — questions, feedback, or support requests about the paper trading platform.`}
        path="/contact"
      />

      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-xl">
          <h1 className="text-4xl font-extrabold text-ink-900">Contact Us</h1>
          <p className="mt-4 text-ink-600">
            Have a question, found a bug, or want to share feedback? We'd like to hear from you.
            Fill out the form below to open a pre-filled email to our support team.
          </p>

          <form
            className="mt-8 flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault()
              window.location.href = mailtoHref
            }}
          >
            <Input
              label="Your name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              label="Your email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-message" className="text-sm font-medium text-ink-700">
                Message
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-brand-500"
              />
            </div>
            <Button type="submit">Send message</Button>
            <p className="text-xs text-ink-400">
              Submitting opens your email client addressed to {branding.supportEmail}.
            </p>
          </form>
        </div>
      </Container>
    </>
  )
}
