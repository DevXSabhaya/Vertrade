import type { TradeDirection } from './trade-direction.enum';
import type { TradeState } from './trade-state.enum';
import type { OrderLifecycleStatus } from './order-lifecycle-status.enum';
import type { TradingMode } from './trading-mode.type';

export interface TradeHistoryEntry {
  readonly state: TradeState;
  readonly occurredAt: string;
  readonly reason?: string;
}

/**
 * An immutable, fully-copied read model of a Trade at a point in time — never
 * a live reference into the aggregate's internal arrays/objects, so callers
 * can never mutate engine state by mutating a snapshot.
 */
export interface TradeSnapshot {
  readonly id: string;
  readonly direction: TradeDirection;
  readonly state: TradeState;
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly instrumentToken: string;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly currentStopLoss: number;
  readonly targets: readonly number[];
  readonly mode: TradingMode;
  readonly remainingTargets: readonly number[];
  readonly entryOrderId: string | null;
  readonly entryOrderLifecycle: OrderLifecycleStatus | null;
  readonly entryFillPrice: number | null;
  readonly filledQuantity: number;
  readonly exitOrderId: string | null;
  readonly exitOrderLifecycle: OrderLifecycleStatus | null;
  readonly exitedQuantity: number;
  /** Running sum of (fillPrice * filledQuantity) across every exit fill so far — needed to resume a partial exit correctly on recovery. */
  readonly exitProceeds: number;
  readonly openQuantity: number;
  readonly exitPrice: number | null;
  readonly realizedPnl: number | null;
  readonly isAwaitingExit: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly history: readonly TradeHistoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
