import { apiFetch } from '@/lib/api-client'
import type { SetTradingModeRequest, TradingModeResponse } from '@/types/config'

export const configService = {
  tradingMode(signal?: AbortSignal): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode', { signal })
  },

  setTradingMode(body: SetTradingModeRequest): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode', { method: 'POST', body })
  },
}
