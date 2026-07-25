import type { MismatchLevel } from './mismatch-level.enum';

export type ComparedField =
  | 'tradingSymbol'
  | 'exchange'
  | 'instrumentToken'
  | 'side'
  | 'quantity'
  | 'averagePrice'
  | 'filledQuantity'
  | 'pendingQuantity'
  | 'stopLoss'
  | 'targets'
  | 'trailingStopLoss'
  | 'tradeState'
  | 'orderState'
  | 'positionState';

export interface PositionMismatch {
  readonly field: ComparedField;
  readonly level: MismatchLevel;
  readonly localValue: string;
  readonly brokerValue: string;
  readonly description: string;
}
