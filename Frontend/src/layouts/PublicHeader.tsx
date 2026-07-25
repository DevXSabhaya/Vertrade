import { NavLink, Link } from 'react-router-dom'
import { useState } from 'react'
import { branding } from '@/config/branding'
import { useAuth } from '@/store/auth-context'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { to: '/paper-trading', label: 'Paper Trading' },
  { to: '/stock-market-simulator', label: 'Stock Simulator' },
  { to: '/options-paper-trading', label: 'Options' },
  { to: '/how-paper-trading-works', label: 'How It Works' },
  { to: '/pricing', label: 'Pricing' },
]

export function PublicHeader() {
  const { isAuthenticated } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" className="text-lg font-bold text-ink-900">
          {branding.name}
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors hover:text-brand-600 ${
                  isActive ? 'text-brand-600' : 'text-ink-600'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <Link to="/app">
              <Button size="sm">Go to Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-ink-700 hover:text-brand-600">
                Log in
              </Link>
              <Link to="/register">
                <Button size="sm">Start Paper Trading Free</Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="block h-0.5 w-6 bg-ink-900" />
          <span className="mt-1.5 block h-0.5 w-6 bg-ink-900" />
          <span className="mt-1.5 block h-0.5 w-6 bg-ink-900" />
        </button>
      </div>

      {isMenuOpen && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-ink-200 md:hidden">
          <ul className="flex flex-col gap-1 px-4 py-3">
            {navLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className="block rounded-md px-2 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li className="mt-2 flex gap-2">
              {isAuthenticated ? (
                <Link to="/app" className="w-full">
                  <Button size="sm" className="w-full">
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" className="w-full">
                    <Button variant="secondary" size="sm" className="w-full">
                      Log in
                    </Button>
                  </Link>
                  <Link to="/register" className="w-full">
                    <Button size="sm" className="w-full">
                      Sign up
                    </Button>
                  </Link>
                </>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
