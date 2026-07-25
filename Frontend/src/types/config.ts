export type TradingMode = 'PAPER' | 'LIVE'

export interface TradingModeResponse {
  readonly tradingMode: TradingMode
}
