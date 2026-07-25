import type { TrailingConfiguration } from './trailing-configuration.model';
import type { ExitReason } from './exit-reason.enum';

/**
 * Everything Phase 10 adds that the frozen `Trade` aggregate (Phase 5) has
 * no field for, keyed by `tradeId` and persisted separately — never merged
 * into `Trade`/`TradeSnapshot` itself. Composed together with a
 * `TradeSnapshot` at read time (see `TradeRecordComposer`) to build the
 * unified "Trade Aggregate" view the Phase 10 spec describes.
 */
export interface TradeExtension {
  readonly tradeId: string;
  readonly brokerPositionId: string | null;
  readonly brokerMetadata: Readonly<Record<string, unknown>>;
  readonly exitReason: ExitReason | null;
  readonly trailingEnabled: boolean;
  readonly trailingConfig: TrailingConfiguration | null;
  /** Quantity to book at each target index (parallel to Trade.targets) when Target Engine partial-exit is enabled; empty means "no partial exit plan — trail only," the Phase 5 default behavior. */
  readonly targetExitQuantities: readonly number[];
  /** The last stop loss step boundary TrailingManager's STEP strategy moved past — internal bookkeeping for that one strategy. */
  readonly lastTrailingStepPrice: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function defaultTradeExtension(
  tradeId: string,
  now: string,
): TradeExtension {
  return {
    tradeId,
    brokerPositionId: null,
    brokerMetadata: {},
    exitReason: null,
    trailingEnabled: false,
    trailingConfig: null,
    targetExitQuantities: [],
    lastTrailingStepPrice: null,
    createdAt: now,
    updatedAt: now,
  };
}
