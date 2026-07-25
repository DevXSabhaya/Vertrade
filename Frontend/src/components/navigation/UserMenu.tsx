import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/store/auth-context'

export function UserMenu() {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-full border border-ink-200 py-1 pl-1 pr-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {initial}
        </span>
        <span className="hidden sm:inline">{user.displayName}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-ink-200 bg-white py-1 shadow-lg"
        >
          <p className="truncate px-4 py-2 text-xs text-ink-400">{user.email}</p>
          <Link
            to="/app/settings"
            role="menuitem"
            className="block px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
            onClick={() => setIsOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="block w-full px-4 py-2 text-left text-sm text-loss-600 hover:bg-loss-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
