import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TrailingConfiguration } from '@modules/trade-lifecycle/models/trailing-configuration.model';
import type { PaperTradeStatus } from './paper-trade-status.enum';

/**
 * The ownership record is the public identity of a paper trade throughout
 * its whole life (Phase 12, Part 5) — its own `id` never changes, even
 * though the underlying Trading Engine `tradeId` doesn't exist yet while
 * `status` is `PENDING`. This is the row every `/paper/trades/*` endpoint
 * scopes its query by `userId` against; the Trading Engine/Trade Lifecycle
 * aggregates themselves are never modified to carry a `userId` field.
 */
export interface PaperTradeOwnership {
  readonly id: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly queueItemId: string;
  readonly tradeId: string | null;
  readonly status: PaperTradeStatus;
  readonly reservedAmount: number;
  readonly rawSymbol: string;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly isMarketOrder: boolean;
  readonly trailingConfig: TrailingConfiguration | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
