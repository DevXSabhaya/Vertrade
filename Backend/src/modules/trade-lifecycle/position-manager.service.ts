import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { ConfigService } from '@core/config/config.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeStateTransitions } from '@modules/trading-engine/domain/trade-state-transitions';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { composeTradeRecord } from './domain/trade-record-composer';
import type { TradeRecord } from './models/trade-record.model';
import { TradeRecordNotFoundException } from './exceptions/trade-record-not-found.exception';

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
    private readonly configService: ConfigService,
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
      throw new TradeRecordNotFoundException(
        `No trade found with id ${tradeId}`,
      );
    }
    const snapshot = this.tradingEngineService.getTrade(tradeId);
    return this.composeOne(snapshot);
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
        this.configService.tradingMode,
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
      this.configService.tradingMode,
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
