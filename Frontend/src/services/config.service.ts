import { apiFetch } from '@/lib/api-client'
import type { TradingModeResponse } from '@/types/config'

export const configService = {
  tradingMode(signal?: AbortSignal): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode', { signal })
  },
}
