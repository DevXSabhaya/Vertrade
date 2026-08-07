/**
 * Deterministic execution-realism knobs for `PaperExecutor` — every value
 * here is a fixed, disclosed adjustment applied to a REAL market price (from
 * `MarketDataService` via `MarketPriceUpdatedEvent`), never a random or
 * invented one. Defaults to zero-effect (exact-price, full-fill, never
 * rejected) so every existing deterministic test keeps its exact
 * expectations unless it opts into this behavior explicitly.
 */
export interface PaperExecutionConfig {
  /**
   * Applied only to `MARKET` and `SL_M` fills — `LIMIT`/`SL` orders always
   * fill at their specified price, matching a real broker's guarantee for
   * limit-priced orders. Expressed in basis points (1 bps = 0.01%) of the
   * market price, applied unfavorably to the trader: a BUY fills slightly
   * above the tick price, a SELL slightly below it — exactly how real
   * slippage erodes a fill versus the quoted price.
   */
  readonly slippageBps: number;
  /**
   * An order whose quantity exceeds this fills only up to the threshold on
   * this attempt, leaving the remainder as `PARTIALLY_FILLED` — models a
   * broker/exchange unable to fill a very large order in one shot.
   * `Infinity` (the default) means every order fills in full.
   */
  readonly maxFillQuantity: number;
  /**
   * An order whose quantity exceeds this is rejected outright — models an
   * exchange-imposed per-order quantity cap (e.g. freeze quantity limits on
   * F&O contracts). `Infinity` (the default) means no order is ever
   * rejected for size.
   */
  readonly maxOrderQuantity: number;
  /**
   * A `LIMIT`/`SL` order whose price deviates from the current market price
   * by more than this percentage is rejected — models an exchange circuit
   * filter / price-band rejection. `Infinity` (the default) means no order
   * is ever rejected for price.
   */
  readonly priceBandPercent: number;
}

export const DEFAULT_PAPER_EXECUTION_CONFIG: PaperExecutionConfig = {
  slippageBps: 0,
  maxFillQuantity: Infinity,
  maxOrderQuantity: Infinity,
  priceBandPercent: Infinity,
};
