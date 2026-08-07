import { apiFetch } from '@/lib/api-client'
import type {
  SelectBrokerRequest,
  SetTradingModeRequest,
  TradingModeResponse,
} from '@/types/config'

export const configService = {
  tradingMode(signal?: AbortSignal): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode', { signal })
  },

  setTradingMode(body: SetTradingModeRequest): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode', { method: 'POST', body })
  },

  selectBroker(body: SelectBrokerRequest): Promise<TradingModeResponse> {
    return apiFetch<TradingModeResponse>('/config/trading-mode/broker', {
      method: 'POST',
      body,
    })
  },
}
