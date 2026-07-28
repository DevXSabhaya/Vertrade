import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradingMode } from '@modules/trading-engine/domain/trading-mode.type';
import type { TradeLifecycleStage } from './trade-lifecycle-stage.enum';
import type { TrailingConfiguration } from './trailing-configuration.model';
import type { ExitReason } from './exit-reason.enum';

/** Re-exported for existing callers — canonical definition now lives in `trading-engine/domain` since `Trade`/`CreateTradeParams` need it directly (see that file's own docstring). */
export type { TradingMode };

/**
 * The unified "Trade Aggregate" read model the Phase 10 spec describes —
 * every field it lists, composed from the frozen `TradeSnapshot` (Phase 5,
 * unmodified) plus this module's own `TradeExtension`, never a second
 * persisted copy of Trade's own source-of-truth fields. Built by
 * `TradeRecordComposer` on every read; never stored as-is.
 */
export interface TradeRecord {
  readonly tradeId: string;
  readonly signalId: string | null;
  readonly brokerOrderId: string | null;
  readonly brokerPositionId: string | null;
  readonly instrument: string;
  readonly exchange: string;
  readonly token: string;
  readonly direction: TradeDirection;
  readonly entryPrice: number;
  readonly quantity: number;
  readonly filledQuantity: number;
  readonly openQuantity: number;
  readonly exitedQuantity: number;
  readonly averagePrice: number | null;
  readonly exitPrice: number | null;
  readonly status: TradeState;
  readonly lifecycleStage: TradeLifecycleStage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly targets: readonly number[];
  readonly currentTarget: number | null;
  readonly stopLoss: number;
  readonly currentStopLoss: number;
  readonly trailingEnabled: boolean;
  readonly trailingConfiguration: TrailingConfiguration | null;
  readonly riskReward: number | null;
  readonly realizedPnl: number | null;
  readonly unrealizedPnl: number | null;
  readonly exitReason: ExitReason | null;
  readonly brokerMetadata: Readonly<Record<string, unknown>>;
  readonly mode: TradingMode;
  /** Milliseconds since `createdAt`; measured against the last known tick/evaluation time, not wall-clock `Date.now()`, so it stays deterministic under a fake clock in tests. */
  readonly positionDurationMs: number;
}
