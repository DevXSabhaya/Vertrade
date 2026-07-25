import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TradeState } from '@modules/trading-engine/domain/trade-state.enum';

/** The Engine's own view of a trade's position — built from a TradeSnapshot, never a live reference. */
export interface LocalPositionView {
  readonly tradeId: string;
  readonly tradingSymbol: string;
  readonly exchange: string;
  readonly instrumentToken: string;
  readonly side: TradeDirection;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly openQuantity: number;
  readonly averagePrice: number | null;
  readonly currentStopLoss: number;
  readonly targets: readonly number[];
  readonly remainingTargets: readonly number[];
  readonly tradeState: TradeState;
  readonly entryOrderId: string | null;
  readonly exitOrderId: string | null;
}
