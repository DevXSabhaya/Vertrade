import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { composeTradeRecord } from './domain/trade-record-composer';
import type { TradeRecord } from './models/trade-record.model';
import { TradeRecordNotFoundException } from './exceptions/trade-record-not-found.exception';
import { TRADE_HISTORY_REPOSITORY } from './trade-lifecycle.constants';
import type { ITradeHistoryRepository } from './interfaces/trade-history-repository.interface';

/**
 * The Phase 10 "Active Trade Repository" / position cache: everything the
 * Trading Engine's in-memory `trades` map already is the source of truth
 * for, composed with this module's extension/PnL data and cached by
 * `tradeId` so repeated reads (e.g. GET /positions/active polled by a
 * frontend) don't recompute PnL/extension lookups on every call. Cache
 * entries are invalidated — not incrementally patched — on any event that
 * names a `tradeId`, favoring correctness (always recompute from the
 * authoritative Trade snapshot on the next read) over micro-optimizing
 * away that recomputation.
 */
@Injectable()
export class PositionManager implements OnModuleInit {
  private readonly cache = new Map<string, TradeRecord>();

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly extensionStore: TradeExtensionStore,
    private readonly pnlService: PnLService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TRADE_HISTORY_REPOSITORY)
    private readonly historyRepository: ITradeHistoryRepository,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribeToAll((event) => this.onAnyEvent(event));
  }

  async getAllPositions(): Promise<TradeRecord[]> {
    return this.composeMany(this.tradingEngineService.getAllTrades());
  }

  async getActivePositions(): Promise<TradeRecord[]> {
    const active = this.tradingEngineService
      .getAllTrades()
      .filter((trade) => !TradeStateTransitions.isTerminal(trade.state));
    return this.composeMany(active);
  }

  async getPosition(tradeId: string): Promise<TradeRecord> {
    const cached = this.cache.get(tradeId);
    if (cached) {
      return cached;
    }
    if (!this.tradingEngineService.hasTrade(tradeId)) {
      // Not in the live engine — either it never existed, or it's a
      // terminal trade that TradingEngineService.pruneCompletedTrades()
      // already evicted from memory. Either way, TradeLifecycleService
      // durably archives every trade to TradeHistoryRepository the moment
      // it goes terminal, so a pruned (not merely nonexistent) trade is
      // still findable there — never lost, just no longer in RAM.
      const archived = await this.historyRepository.findById(tradeId);
      if (archived) {
        this.cache.set(tradeId, archived);
        return archived;
      }
      throw new TradeRecordNotFoundException(
        `No trade found with id ${tradeId}`,
      );
    }
    const snapshot = this.tradingEngineService.getTrade(tradeId);
    return this.composeOne(snapshot);
  }

  /**
   * Evicts terminal (non-active) cache entries older than `maxAgeMs` —
   * the `PositionManager`-local counterpart to
   * `TradingEngineService.pruneCompletedTrades()`. Without this, `cache`
   * grows without bound too: any endpoint that ever reads a terminal
   * trade (e.g. `GET /trades` before it was pruned from the live engine,
   * or the history fallback above) leaves a permanent entry here, since
   * a terminal trade never fires another event to invalidate it via
   * `onAnyEvent()`. An active trade is never pruned, regardless of age.
   */
  pruneCache(maxAgeMs: number): number {
    const now = this.clock.now().getTime();
    let removedCount = 0;

    for (const [tradeId, record] of this.cache) {
      if (!TradeStateTransitions.isTerminal(record.status)) {
        continue;
      }
      const ageMs = now - new Date(record.updatedAt).getTime();
      if (ageMs > maxAgeMs) {
        this.cache.delete(tradeId);
        removedCount += 1;
      }
    }

    return removedCount;
  }

  private async composeMany(
    snapshots: readonly TradeSnapshot[],
  ): Promise<TradeRecord[]> {
    const uncached = snapshots.filter((s) => !this.cache.has(s.id));
    const extensions = await this.extensionStore.getMany(
      uncached.map((s) => s.id),
    );
    const now = this.clock.now().getTime();

    for (const snapshot of uncached) {
      const extension = extensions.get(snapshot.id);
      if (!extension) {
        continue;
      }
      const record = composeTradeRecord(
        snapshot,
        extension,
        this.pnlService.getMarkPrice(snapshot.instrumentToken),
        now,
      );
      this.cache.set(snapshot.id, record);
    }

    return snapshots.map(
      (snapshot) => this.cache.get(snapshot.id) as TradeRecord,
    );
  }

  private async composeOne(snapshot: TradeSnapshot): Promise<TradeRecord> {
    const extension = await this.extensionStore.get(snapshot.id);
    const record = composeTradeRecord(
      snapshot,
      extension,
      this.pnlService.getMarkPrice(snapshot.instrumentToken),
      this.clock.now().getTime(),
    );
    this.cache.set(snapshot.id, record);
    return record;
  }

  private onAnyEvent(event: BaseEvent): void {
    const tradeId = (event as unknown as { tradeId?: unknown }).tradeId;
    if (typeof tradeId === 'string') {
      this.cache.delete(tradeId);
    }
  }
}
