import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/**
 * A netted position across every open "lot" (trade) on the same
 * instrument — the "Professional Position Book" view: one row per
 * instrument, not one row per trade. See `aggregateNetPositions`.
 */
export interface NetPosition {
  readonly instrumentToken: string;
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly direction: TradeDirection;
  /** Always positive — `direction` carries the side. */
  readonly netQuantity: number;
  /** Volume-weighted average entry price across every lot on the net side. */
  readonly averagePrice: number;
  readonly totalRealizedPnl: number;
  readonly totalUnrealizedPnl: number;
  readonly totalCharges: number;
  readonly netPnl: number;
  /** How many individual trades were combined into this one net position. */
  readonly lotCount: number;
  readonly tradeIds: readonly string[];
}
