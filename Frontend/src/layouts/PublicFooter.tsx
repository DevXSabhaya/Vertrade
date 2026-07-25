import { Link } from 'react-router-dom'
import { branding } from '@/config/branding'

const columns = [
  {
    heading: 'Product',
    links: [
      { to: '/paper-trading', label: 'Paper Trading' },
      { to: '/paper-trading-simulator', label: 'Paper Trading Simulator' },
      { to: '/stock-market-simulator', label: 'Stock Market Simulator' },
      { to: '/virtual-trading', label: 'Virtual Trading' },
      { to: '/options-paper-trading', label: 'Options Paper Trading' },
      { to: '/pricing', label: 'Pricing' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { to: '/learn', label: 'Learn to Trade' },
      { to: '/how-paper-trading-works', label: 'How Paper Trading Works' },
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { to: '/privacy-policy', label: 'Privacy Policy' },
      { to: '/terms', label: 'Terms of Service' },
      { to: '/disclaimer', label: 'Risk Disclaimer' },
    ],
  },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div>
          <p className="text-lg font-bold text-ink-900">{branding.name}</p>
          <p className="mt-2 max-w-xs text-sm text-ink-500">{branding.shortDescription}</p>
        </div>
        {columns.map((column) => (
          <div key={column.heading}>
            <h3 className="text-sm font-semibold text-ink-900">{column.heading}</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="text-sm text-ink-500 hover:text-brand-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-200 px-4 py-4 text-center text-xs text-ink-400 sm:px-6">
        <p>
          &copy; {new Date().getFullYear()} {branding.legalName}. Paper trading only — no real money is
          ever traded. Not investment advice.
        </p>
      </div>
    </footer>
  )
}
