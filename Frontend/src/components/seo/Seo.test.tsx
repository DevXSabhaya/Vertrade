import { describe, expect, it } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { Seo } from './Seo'
import { branding } from '@/config/branding'

describe('Seo', () => {
  it('sets a unique title, description, and canonical URL', async () => {
    render(
      <HelmetProvider>
        <Seo title="Example Page" description="An example description." path="/example" />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(document.title).toBe(`Example Page | ${branding.name}`)
    })
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'An example description.',
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${branding.url}/example`,
    )
    expect(document.querySelector('meta[name="robots"]')).toBeNull()
  })

  it('adds a noindex,nofollow robots tag when noIndex is set', async () => {
    render(
      <HelmetProvider>
        <Seo title="Private Page" description="Private." path="/app" noIndex />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      )
    })
  })

  it('renders Open Graph and Twitter metadata', async () => {
    render(
      <HelmetProvider>
        <Seo title="Shareable" description="Share me." path="/shareable" />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
        `Shareable | ${branding.name}`,
      )
    })
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image',
    )
  })

  it('embeds structured data as JSON-LD when provided', async () => {
    render(
      <HelmetProvider>
        <Seo
          title="FAQ"
          description="Questions."
          path="/faq"
          structuredData={{ '@context': 'https://schema.org', '@type': 'FAQPage' }}
        />
      </HelmetProvider>,
    )

    await waitFor(() => {
      const script = document.querySelector('script[type="application/ld+json"]')
      expect(script).not.toBeNull()
      expect(JSON.parse(script?.textContent ?? '{}')).toMatchObject({ '@type': 'FAQPage' })
    })
  })
})
