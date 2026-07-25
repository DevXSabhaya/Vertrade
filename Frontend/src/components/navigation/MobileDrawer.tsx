import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface MobileDrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly children: ReactNode
}

/** Same accessible-dialog discipline as `Modal` (focus trap, Escape, restore focus) but slides in from the left as a navigation drawer instead of a centered dialog. */
export function MobileDrawer({ isOpen, onClose, children }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    triggerRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-ink-950/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 w-72 max-w-[80vw] overflow-y-auto bg-white shadow-xl outline-none"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
