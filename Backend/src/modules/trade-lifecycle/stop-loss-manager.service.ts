import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TrailingSLMovedEvent } from '@modules/trading-engine/events/trailing-sl-moved.event';
import { TradeExtensionStore } from './trade-extension.store';
import { TrailingStrategy } from './models/trailing-strategy.enum';
import type { TrailingConfiguration } from './models/trailing-configuration.model';
import type { TradeExtension } from './models/trade-extension.model';
import type { StopLossHistoryEntry } from './models/stop-loss-history-entry.model';

const MAX_HISTORY_PER_TRADE = 200;

/**
 * Owns stop-loss *configuration* (static vs. dynamic/trailing, including a
 * one-call break-even convenience) and the audit history of every stop-loss
 * move. Never moves a stop loss itself — that's `TrailingManager`'s job for
 * configured strategies, and `Trade`'s own always-on per-target rule
 * (Phase 5, `advancePrice()`) for the unconditional default. Both paths
 * publish the same `TrailingSLMovedEvent`, so this module cannot perfectly
 * attribute *which* one fired without deeper coupling to the tick
 * evaluation loop — history entries are recorded uniformly rather than
 * guessing.
 */
@Injectable()
export class StopLossManager implements OnModuleInit {
  private readonly historyByTrade = new Map<string, StopLossHistoryEntry[]>();

  constructor(
    private readonly extensionStore: TradeExtensionStore,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<TrailingSLMovedEvent>(
      TrailingSLMovedEvent.EVENT_NAME,
      (event) => this.recordMove(event),
    );
  }

  /** Enables configurable trailing with the given strategy — "Dynamic SL." */
  async configureTrailing(
    tradeId: string,
    config: TrailingConfiguration,
  ): Promise<TradeExtension> {
    return this.extensionStore.patch(tradeId, {
      trailingEnabled: true,
      trailingConfig: config,
    });
  }

  /** Disables configurable trailing — "Static SL": only Trade's own unconditional per-target rule still applies. */
  async disableTrailing(tradeId: string): Promise<TradeExtension> {
    return this.extensionStore.patch(tradeId, {
      trailingEnabled: false,
      trailingConfig: null,
    });
  }

  /** Convenience: configure the BREAK_EVEN strategy in one call. */
  async enableBreakEven(tradeId: string): Promise<TradeExtension> {
    return this.configureTrailing(tradeId, {
      strategy: TrailingStrategy.BREAK_EVEN,
    });
  }

  getHistory(tradeId: string): readonly StopLossHistoryEntry[] {
    return this.historyByTrade.get(tradeId) ?? [];
  }

  private recordMove(event: TrailingSLMovedEvent): void {
    const entries = this.historyByTrade.get(event.tradeId) ?? [];
    entries.push({
      tradeId: event.tradeId,
      previousStopLoss: event.previousStopLoss,
      newStopLoss: event.newStopLoss,
      source: 'ENGINE_DEFAULT',
      movedAt: this.clock.now().toISOString(),
    });
    if (entries.length > MAX_HISTORY_PER_TRADE) {
      entries.shift();
    }
    this.historyByTrade.set(event.tradeId, entries);
  }
}
