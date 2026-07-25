import { TradeDirection } from './trade-direction.enum';

/**
 * The single source of truth for the unrealized-PnL formula. Extracted out
 * of `Trade.getUnrealizedPnl()` (Phase 5) so Phase 10's PnLService — which
 * only ever has a `TradeSnapshot` read model, never a live `Trade`
 * instance — can compute the identical figure without duplicating the
 * formula. Both callers must produce the same number for the same inputs.
 */
export function calculateUnrealizedPnl(
  direction: TradeDirection,
  entryFillPrice: number | null,
  filledQuantity: number,
  openQuantity: number,
  markPrice: number,
): number | null {
  if (entryFillPrice === null || filledQuantity === 0) {
    return null;
  }
  const directionSign = direction === TradeDirection.LONG ? 1 : -1;
  // `+ 0` normalizes a possible `-0` (e.g. a break-even SHORT mark) to `0`.
  return directionSign * (markPrice - entryFillPrice) * openQuantity + 0;
}

/**
 * PnL already locked in by every exit fill so far — the running total the
 * aggregate keeps as `exitProceeds`/`exitedQuantity`. Identical formula
 * `Trade.applyExitOrderResponse()` uses to set `realizedPnl` on full close;
 * extracted so it can also be read mid-trade, after a partial exit, from a
 * `TradeSnapshot` alone (Phase 10's PnLService — "Booked PnL" — has no live
 * `Trade` instance to call a method on).
 */
export function calculateBookedPnl(
  direction: TradeDirection,
  entryFillPrice: number | null,
  exitProceeds: number,
  exitedQuantity: number,
): number | null {
  if (entryFillPrice === null || exitedQuantity === 0) {
    return null;
  }
  const directionSign = direction === TradeDirection.LONG ? 1 : -1;
  return directionSign * (exitProceeds - entryFillPrice * exitedQuantity) + 0;
}
