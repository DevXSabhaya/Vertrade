import { Helmet } from 'react-helmet-async'
import { branding } from '@/config/branding'

/**
 * Rendered once, globally, on every public page (via `PublicLayout`) — sitewide
 * Organization + WebSite structured data doesn't belong on each page's own
 * `<Seo structuredData>` prop, which is reserved for page-specific schema
 * (FAQPage, SoftwareApplication, etc.).
 */
export function OrganizationJsonLd() {
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: branding.name,
    url: branding.url,
    description: branding.shortDescription,
    email: branding.supportEmail,
  }

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: branding.name,
    url: branding.url,
    description: branding.shortDescription,
  }

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(organization)}</script>
      <script type="application/ld+json">{JSON.stringify(website)}</script>
    </Helmet>
  )
}
