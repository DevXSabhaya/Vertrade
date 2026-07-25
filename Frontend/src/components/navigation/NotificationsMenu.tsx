import { useEffect, useRef, useState } from 'react'
import { useTradeHistory } from '@/hooks/useTrades'
import { formatDateTime } from '@/lib/format'

/**
 * Real, user-scoped data only: your own recently failed/cancelled paper
 * trades. Deliberately does NOT use the backend's `/risk/events` or
 * `/risk/violations` endpoints — those are platform-wide (Phase 11 predates
 * per-user auth) and would leak other users' trade activity into this
 * user's notification feed.
 */
export function NotificationsMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const history = useTradeHistory({ limit: 5, offset: 0 })

  const notifications = (history.data ?? []).filter(
    (trade) => trade.status === 'FAILED' || trade.status === 'CANCELLED',
  )

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Notifications${notifications.length > 0 ? ` (${notifications.length} unread)` : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-ink-200 text-ink-600 hover:bg-ink-50"
      >
        <span aria-hidden="true">🔔</span>
        {notifications.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-loss-500 text-[10px] font-bold text-white">
            {notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-ink-200 bg-white py-2 shadow-lg"
        >
          <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Recent activity
          </p>
          {notifications.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">You're all caught up.</p>
          ) : (
            <ul className="flex flex-col">
              {notifications.map((trade) => (
                <li key={trade.id} className="px-4 py-2 text-sm">
                  <p className="text-ink-800">
                    {trade.rawSymbol} — {trade.status === 'FAILED' ? 'failed' : 'cancelled'}
                  </p>
                  {trade.failureReason && (
                    <p className="mt-0.5 text-xs text-ink-400">{trade.failureReason}</p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(trade.updatedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
