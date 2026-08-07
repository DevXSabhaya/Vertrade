export type TradingMode = 'PAPER' | 'LIVE'

export interface TradingModeResponse {
  readonly tradingMode: TradingMode
  /** The caller's own selected broker account for Live trading — always null in Paper mode. */
  readonly selectedBrokerAccountId: string | null
}

export interface SetTradingModeRequest {
  readonly mode: TradingMode
  /** Required when switching to LIVE — the caller's own broker account to trade through. */
  readonly brokerAccountId?: string
}

export interface SelectBrokerRequest {
  readonly brokerAccountId: string
}
