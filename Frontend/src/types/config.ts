export type TradingMode = 'PAPER' | 'LIVE'

export interface TradingModeResponse {
  readonly tradingMode: TradingMode
  /** The env-configured (`TRADING_MODE`) boot-time default — surfaced so the UI can show when the persisted mode has been switched away from it. */
  readonly defaultTradingMode: TradingMode
}

export interface SetTradingModeRequest {
  readonly mode: TradingMode
}

export type BrokerAuthStatus =
  | 'HEALTHY'
  | 'WARNING'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'RECOVERING'
  | 'MAINTENANCE'
  | 'UNKNOWN'

export interface BrokerStatusResponse {
  readonly tradingMode: TradingMode
  readonly brokerName: string
  readonly connected: boolean
  readonly authStatus: BrokerAuthStatus
  readonly clientCode: string | null
  readonly marketDataCapability: BrokerAuthStatus
  readonly orderExecutionCapability: BrokerAuthStatus
  readonly lastSuccessfulConnectionAt: string | null
  readonly lastHealthCheckAt: string | null
}

export interface BrokerAccountSummaryResponse {
  readonly supported: boolean
  readonly reason: string | null
  readonly availableBalance: number | null
  readonly usedMargin: number | null
  readonly availableMargin: number | null
  readonly todaysRealizedPnl: number | null
  readonly unrealizedPnl: number | null
}
