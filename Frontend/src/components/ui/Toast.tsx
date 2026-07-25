/* eslint-disable react-refresh/only-export-components -- the Provider + its `useToast` hook are one cohesive context module by design. */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastTone = 'success' | 'error' | 'info'

interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

interface ToastContextValue {
  show(message: string, tone?: ToastTone): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const toneClasses: Record<ToastTone, string> = {
  success: 'bg-gain-600',
  error: 'bg-loss-600',
  info: 'bg-ink-900',
}

let nextId = 1

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 4000)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
          role="status"
          aria-live="polite"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toneClasses[toast.tone]}`}
            >
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
