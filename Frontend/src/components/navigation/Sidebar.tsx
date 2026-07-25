import { NavLink } from 'react-router-dom'
import { branding } from '@/config/branding'
import { navItems } from './nav-items'

export function Sidebar({ onNavigate }: { readonly onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <span className="text-lg font-bold text-ink-900">{branding.name}</span>
      </div>
      <nav aria-label="Application" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
