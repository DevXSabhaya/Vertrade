import { apiFetch } from '@/lib/api-client'
import type { RiskSnapshot, RiskStatus } from '@/types/risk'

/**
 * `/risk/*` (Phase 11) is platform-wide, not scoped per user — it predates
 * per-user authentication (Phase 12) and describes the whole system's
 * safety state (kill switch, circuit breakers, daily loss limits), not this
 * user's personal risk. The Risk page must present it as such.
 */
export const riskService = {
  status(signal?: AbortSignal): Promise<RiskStatus> {
    return apiFetch<RiskStatus>('/risk/status', { signal })
  },

  snapshot(signal?: AbortSignal): Promise<RiskSnapshot> {
    return apiFetch<RiskSnapshot>('/risk/snapshot', { signal })
  },
}
