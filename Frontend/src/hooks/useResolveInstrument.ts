import { useEffect, useRef, useState } from 'react'
import { instrumentService } from '@/services/instrument.service'
import { getErrorMessage } from '@/lib/error-message'
import type { ResolvedInstrument } from '@/types/trading'

const DEBOUNCE_MS = 400

interface UseResolveInstrumentResult {
  readonly resolved: ResolvedInstrument | null
  readonly isResolving: boolean
  readonly error: string | null
}

/**
 * Live preview for the "trading call" input (e.g. "SENSEX 77200 CE") —
 * debounced so it doesn't hit the backend on every keystroke, and abortable
 * so a stale in-flight request can never overwrite a newer one. Never
 * fabricates a resolution client-side: `resolved` is only ever exactly what
 * `GET /instruments/resolve` returned. Every state update happens inside a
 * callback (the debounce timer or a fetch promise), never synchronously in
 * the effect body itself, so the previous result/error intentionally stays
 * on screen until the debounce fires rather than flashing empty on every
 * keystroke.
 */
export function useResolveInstrument(query: string): UseResolveInstrumentResult {
  const [resolved, setResolved] = useState<ResolvedInstrument | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim()
      if (trimmed.length === 0) {
        setResolved(null)
        setError(null)
        setIsResolving(false)
        return
      }

      setIsResolving(true)
      setResolved(null)
      setError(null)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      instrumentService
        .resolve(trimmed, controller.signal)
        .then((result) => {
          setResolved(result)
          setIsResolving(false)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setError(getErrorMessage(err, 'Could not resolve this instrument.'))
          setIsResolving(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      abortRef.current?.abort()
    }
  }, [query])

  return { resolved, isResolving, error }
}
