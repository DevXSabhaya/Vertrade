export enum OrderPriceType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
  /** Stop-loss order: activates once the market crosses `triggerPrice`, then fills at `price` (a limit) — never worse than `price`, but may not fill at all if the market gaps past it. */
  SL = 'SL',
  /** Stop-loss-market order: activates once the market crosses `triggerPrice`, then fills at the prevailing market price — always fills once triggered, but is subject to slippage exactly like a MARKET order. */
  SL_M = 'SL_M',
}
