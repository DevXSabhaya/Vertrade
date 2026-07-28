import { apiFetch } from '@/lib/api-client'
import type { InstrumentExpiryChoice, ResolvedInstrument } from '@/types/trading'

export const instrumentService = {
  resolve(
    query: string,
    expiry?: string,
    signal?: AbortSignal,
  ): Promise<ResolvedInstrument> {
    const expiryParam = expiry ? `&expiry=${encodeURIComponent(expiry)}` : ''
    return apiFetch<ResolvedInstrument>(
      `/instruments/resolve?query=${encodeURIComponent(query)}${expiryParam}`,
      { signal },
    )
  },

  /** Lists every live expiry for a parsed underlying/strike/optionType — never throws on ambiguity, unlike resolve(). */
  expiries(query: string, signal?: AbortSignal): Promise<InstrumentExpiryChoice[]> {
    return apiFetch<InstrumentExpiryChoice[]>(
      `/instruments/expiries?query=${encodeURIComponent(query)}`,
      { signal },
    )
  },
}
