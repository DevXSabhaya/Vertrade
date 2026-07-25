import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import type { QueueItemSnapshot } from '@modules/order-queue/models/queue-item-snapshot';

/** A broker-independent instrument identity, persisted so recovery can re-subscribe without depending on live Market Data state. */
export interface RecoveryMarketSubscription {
  readonly exchange: string;
  readonly tradingSymbol: string;
  readonly instrumentToken: string;
}

export interface RecoveryLastTick {
  readonly instrumentToken: string;
  readonly price: number;
  readonly at: string;
}

/**
 * The composite point-in-time record Recovery persists and rehydrates from
 * (Part 4 of the Phase 9 spec). Every field is a plain, already-serializable
 * read model — never a live reference into Trading Engine / Order Queue
 * internals.
 */
export interface RecoverySnapshot {
  readonly id: string;
  readonly capturedAt: string;
  readonly trades: readonly TradeSnapshot[];
  readonly queueItems: readonly QueueItemSnapshot[];
  readonly idempotencyKeys: readonly string[];
  readonly marketSubscriptions: readonly RecoveryMarketSubscription[];
  /** Trade-count-by-state summary — a cheap way to sanity-check recovery without walking every trade. */
  readonly engineStateSummary: Readonly<Record<string, number>>;
  readonly brokerSessionClientCode: string | null;
  readonly lastTick: RecoveryLastTick | null;
}
