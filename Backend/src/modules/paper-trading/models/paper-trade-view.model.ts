import type { TradeDirection } from '@modules/trading-engine/domain/trade-direction.enum';
import type { TradeRecord } from '@modules/trade-lifecycle/models/trade-record.model';
import type { TrailingConfiguration } from '@modules/trade-lifecycle/models/trailing-configuration.model';
import type { PaperTradeStatus } from './paper-trade-status.enum';

/**
 * The single shape every `/paper/trades/*` read endpoint returns, whether
 * the underlying Trading Engine trade exists yet or not (Phase 12, Part 4) —
 * `PENDING` rows carry only what the user submitted; `OPEN`/`CLOSED` rows are
 * enriched with the live `TradeRecord` the existing Trade Lifecycle module
 * already composes.
 */
export interface PaperTradeView {
  readonly id: string;
  readonly status: PaperTradeStatus;
  readonly tradeId: string | null;
  readonly rawSymbol: string;
  readonly direction: TradeDirection;
  readonly quantity: number;
  readonly entryTriggerPrice: number;
  readonly initialStopLoss: number;
  readonly isMarketOrder: boolean;
  readonly trailingConfig: TrailingConfiguration | null;
  readonly reservedAmount: number;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly trade: TradeRecord | null;
}
