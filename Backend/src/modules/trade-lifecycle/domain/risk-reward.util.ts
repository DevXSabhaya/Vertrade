import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/**
 * Risk:Reward computed from the trade's own definition (entry, initial stop
 * loss, first target) — a static property of how the trade was set up, not
 * something that changes as price moves. Returns `null` when risk is zero
 * (entry === stop loss, division by zero) or there is no first target.
 */
export function calculateRiskReward(
  direction: TradeDirection,
  entryTriggerPrice: number,
  initialStopLoss: number,
  firstTarget: number | undefined,
): number | null {
  if (firstTarget === undefined) {
    return null;
  }
  const directionSign = direction === TradeDirection.LONG ? 1 : -1;
  const risk = directionSign * (entryTriggerPrice - initialStopLoss);
  const reward = directionSign * (firstTarget - entryTriggerPrice);
  if (risk <= 0) {
    return null;
  }
  return reward / risk;
}
