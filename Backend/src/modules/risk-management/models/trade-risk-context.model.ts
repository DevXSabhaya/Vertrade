import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';

/** Everything RiskEvaluationService needs about the trade being proposed — a broker-independent, already-resolved shape, mirroring how TradeValidationEngine hands off to the Trading Engine. */
export interface TradeRiskContext {
  readonly rawSymbol: string;
  readonly instrumentToken: string;
  readonly tradingSymbol: string;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly targets: readonly number[];
}
