import { useEffect, useRef, useState } from 'react'
import { instrumentService } from '@/services/instrument.service'
import { getErrorMessage } from '@/lib/error-message'
import type { InstrumentExpiryChoice } from '@/types/trading'

const DEBOUNCE_MS = 400

interface UseInstrumentExpiriesResult {
  /** Every live contract for the parsed underlying/strike/optionType, across every expiry — empty until a query resolves. */
  readonly choices: InstrumentExpiryChoice[]
  readonly isResolving: boolean
  readonly error: string | null
}

/**
 * Live preview for the "trading call" input (e.g. "BANKNIFTY 56800 PE"),
 * expiry-aware: calls `GET /instruments/expiries`, which never throws on
 * ambiguity, so a call matching more than one live expiry comes back as a
 * list instead of an error. Callers decide what to do with more than one
 * choice (show a picker); this hook never guesses which one the user meant.
 * Debounced so it doesn't hit the backend on every keystroke, and abortable
 * so a stale in-flight request can never overwrite a newer one.
 */
export function useInstrumentExpiries(query: string): UseInstrumentExpiriesResult {
  const [choices, setChoices] = useState<InstrumentExpiryChoice[]>([])
  const [isResolving, setIsResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = query.trim()
      if (trimmed.length === 0) {
        setChoices([])
        setError(null)
        setIsResolving(false)
        return
      }

      setIsResolving(true)
      setChoices([])
      setError(null)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      instrumentService
        .expiries(trimmed, controller.signal)
        .then((result) => {
          setChoices(result)
          setIsResolving(false)
          if (result.length === 0) {
            setError('No tradable contract found for this call.')
          }
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

  return { choices, isResolving, error }
}
