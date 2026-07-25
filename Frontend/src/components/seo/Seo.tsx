import { Helmet } from 'react-helmet-async'
import { branding } from '@/config/branding'

interface SeoProps {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly noIndex?: boolean
  readonly structuredData?: Record<string, unknown>
}

/** Every public page renders this once — the single place page metadata is assembled, so titles/descriptions/canonicals/OG tags stay consistent without copy-pasting `<Helmet>` blocks everywhere. */
export function Seo({ title, description, path, noIndex = false, structuredData }: SeoProps) {
  const fullTitle = `${title} | ${branding.name}`
  const canonical = `${branding.url}${path}`

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={branding.name} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={`${branding.url}${branding.socialImage}`} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={branding.twitterHandle} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={`${branding.url}${branding.socialImage}`} />

      {structuredData && (
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      )}
    </Helmet>
  )
}
