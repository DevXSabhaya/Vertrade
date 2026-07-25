import { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/** Notional exposure of one position: price × quantity. Used identically for a proposed trade and an already-open one. */
export function calculateExposure(price: number, quantity: number): number {
  return price * quantity;
}

/** Points at risk between entry and stop loss, always >= 0 for a correctly-defined trade (TradeValidationEngine's StopLossRule already guarantees the stop loss sits on the losing side of entry). */
export function calculatePointRisk(
  direction: TradeDirection,
  entryPrice: number,
  stopLoss: number,
): number {
  const directionSign = direction === TradeDirection.LONG ? 1 : -1;
  return directionSign * (entryPrice - stopLoss);
}

/** Total rupee amount at risk if the stop loss is hit exactly. */
export function calculateRupeeRisk(
  pointRisk: number,
  quantity: number,
): number {
  return pointRisk * quantity;
}

/** Rupee risk expressed as a percentage of a capital base (e.g. `RiskPolicy.dailyRiskCapital` or `availableCapital`). Returns 0 when the capital base is non-positive rather than dividing by zero. */
export function calculateRiskPercentage(
  rupeeRisk: number,
  capitalBase: number,
): number {
  if (capitalBase <= 0) {
    return 0;
  }
  return (rupeeRisk / capitalBase) * 100;
}
