import { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { branding } from '@/config/branding'
import { Sidebar } from '@/components/navigation/Sidebar'
import { MobileDrawer } from '@/components/navigation/MobileDrawer'
import { ConnectionStatus } from '@/components/navigation/ConnectionStatus'
import { ModeIndicator } from '@/components/navigation/ModeIndicator'
import { NotificationsMenu } from '@/components/navigation/NotificationsMenu'
import { UserMenu } from '@/components/navigation/UserMenu'

export function AppLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  return (
    <div className="min-h-screen bg-ink-50">
      <a href="#app-main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-200 bg-white md:block">
        <Sidebar />
      </aside>

      <MobileDrawer isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)}>
        <Sidebar onNavigate={() => setIsMobileNavOpen(false)} />
      </MobileDrawer>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 border-b border-ink-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md border border-ink-200 md:hidden"
                aria-label="Open navigation menu"
                aria-expanded={isMobileNavOpen}
                onClick={() => setIsMobileNavOpen(true)}
              >
                <span className="block h-0.5 w-5 bg-ink-900" />
              </button>
              <Link to="/app" className="text-lg font-bold text-ink-900 md:hidden">
                {branding.name}
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <ModeIndicator />
              <div className="hidden sm:block">
                <ConnectionStatus />
              </div>
              <NotificationsMenu />
              <UserMenu />
            </div>
          </div>
        </header>

        <main id="app-main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
