export enum TrailingStrategy {
  FIXED_POINTS = 'FIXED_POINTS',
  PERCENTAGE = 'PERCENTAGE',
  STEP = 'STEP',
  BREAK_EVEN = 'BREAK_EVEN',
  /**
   * Architecture only, per the Phase 10 spec. Computing a real ATR requires
   * a rolling window of historical high/low/close ticks — a market-data
   * time-series store this system does not have (Market Data, Phase 6,
   * only ever forwards the latest tick; nothing persists tick history).
   * The strategy enum value, the `TrailingConfiguration.atrMultiplier`
   * field, and this case in `TrailingCalculator` all exist so a later phase
   * can implement it without changing this module's public API — selecting
   * it today is a deliberate no-op (see `TrailingCalculator.compute()`).
   */
  ATR = 'ATR',
}
