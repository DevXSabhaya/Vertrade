export type TradingMode = 'PAPER' | 'LIVE'

export interface TradingModeResponse {
  readonly tradingMode: TradingMode
  /** The env-configured (`TRADING_MODE`) boot-time default — surfaced so the UI can show when the persisted mode has been switched away from it. */
  readonly defaultTradingMode: TradingMode
}

export interface SetTradingModeRequest {
  readonly mode: TradingMode
}
