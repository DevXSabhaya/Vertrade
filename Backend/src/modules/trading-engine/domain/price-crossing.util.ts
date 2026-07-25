import { TradeDirection } from './trade-direction.enum';

/**
 * All crossing rules are expressed generically in terms of direction so the
 * exact same logic handles LONG and SHORT trades — no hardcoded per-target
 * branching anywhere in the Engine.
 */
export const PriceCrossing = {
  hasCrossedEntry(
    direction: TradeDirection,
    price: number,
    entryTriggerPrice: number,
  ): boolean {
    return direction === TradeDirection.LONG
      ? price >= entryTriggerPrice
      : price <= entryTriggerPrice;
  },

  hasCrossedTarget(
    direction: TradeDirection,
    price: number,
    target: number,
  ): boolean {
    return direction === TradeDirection.LONG
      ? price >= target
      : price <= target;
  },

  hasCrossedStopLoss(
    direction: TradeDirection,
    price: number,
    stopLoss: number,
  ): boolean {
    return direction === TradeDirection.LONG
      ? price <= stopLoss
      : price >= stopLoss;
  },
};
