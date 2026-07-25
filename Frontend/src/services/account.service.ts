import { apiFetch } from '@/lib/api-client'
import type { PaperAccount, PnlSummary } from '@/types/account'

export const accountService = {
  /** Both `/account` and `/account/summary` return the unified PnlSummary shape (available balance, used margin, realized/unrealized/total P&L) — no second request needed just to show P&L next to the balance. `/paper/pnl` below remains a narrower, P&L-only view. */
  get(signal?: AbortSignal): Promise<PnlSummary> {
    return apiFetch<PnlSummary>('/account', { signal })
  },

  summary(signal?: AbortSignal): Promise<PnlSummary> {
    return apiFetch<PnlSummary>('/account/summary', { signal })
  },

  resetBalance(): Promise<PaperAccount> {
    return apiFetch<PaperAccount>('/account/reset-paper-balance', { method: 'POST' })
  },

  pnl(signal?: AbortSignal): Promise<PnlSummary> {
    return apiFetch<PnlSummary>('/paper/pnl', { signal })
  },
}
