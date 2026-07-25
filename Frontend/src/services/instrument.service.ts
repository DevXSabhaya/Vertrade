import { apiFetch } from '@/lib/api-client'
import type { ResolvedInstrument } from '@/types/trading'

export const instrumentService = {
  resolve(query: string, signal?: AbortSignal): Promise<ResolvedInstrument> {
    return apiFetch<ResolvedInstrument>(
      `/instruments/resolve?query=${encodeURIComponent(query)}`,
      { signal },
    )
  },
}
