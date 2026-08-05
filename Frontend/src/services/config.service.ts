import { apiFetch } from '@/lib/api-client'
import type {
  BrokerAccountSummaryResponse,
  BrokerStatusResponse,
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

  brokerStatus(signal?: AbortSignal): Promise<BrokerStatusResponse> {
    return apiFetch<BrokerStatusResponse>('/config/broker-status', { signal })
  },

  connectBroker(): Promise<BrokerStatusResponse> {
    return apiFetch<BrokerStatusResponse>('/config/broker/connect', { method: 'POST' })
  },

  disconnectBroker(): Promise<BrokerStatusResponse> {
    return apiFetch<BrokerStatusResponse>('/config/broker/disconnect', { method: 'POST' })
  },

  reconnectBroker(accessToken: string): Promise<BrokerStatusResponse> {
    return apiFetch<BrokerStatusResponse>('/config/broker/reconnect', {
      method: 'POST',
      body: { accessToken },
    })
  },

  brokerAccountSummary(signal?: AbortSignal): Promise<BrokerAccountSummaryResponse> {
    return apiFetch<BrokerAccountSummaryResponse>('/config/broker-account-summary', { signal })
  },
}
