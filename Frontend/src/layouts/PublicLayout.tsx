import { Outlet } from 'react-router-dom'
import { PublicHeader } from './PublicHeader'
import { PublicFooter } from './PublicFooter'
import { OrganizationJsonLd } from '@/components/seo/OrganizationJsonLd'

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationJsonLd />
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PublicHeader />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
