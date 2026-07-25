import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { TradeState } from '@modules/trading-engine/domain/trade-state.enum';
import type { TradeSnapshot } from '@modules/trading-engine/domain/trade-snapshot';
import { TradeExtensionStore } from './trade-extension.store';
import { TrailingCalculator } from './domain/trailing-calculator';
import type { TradeExtension } from './models/trade-extension.model';
import { StopLossMovedEvent } from './events';

/**
 * Phase 10's configurable Trailing Stop Engine — evaluates every tick
 * against every ACTIVE trade whose extension has opted in
 * (`trailingEnabled: true`). A trade with no trailing configured is
 * completely untouched by this class; `Trade`'s own unconditional
 * per-target trailing rule (Phase 5) keeps applying to it exactly as
 * before. `Trade.moveStopLoss()` — not this class — is what actually
 * enforces "never move the stop loss backward"; a rejected/no-op proposal
 * here is silently dropped, never logged as an error.
 *
 * Caches each trade's extension in memory (same invalidate-on-any-event
 * pattern as `PositionManager`) so a burst of ticks doesn't hit Mongo once
 * per trade per tick for the (usually large) majority of trades that don't
 * have trailing configured at all.
 */
@Injectable()
export class TrailingManager implements OnModuleInit {
  private readonly logger = new Logger(TrailingManager.name);
  private readonly extensionCache = new Map<string, TradeExtension>();

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly extensionStore: TradeExtensionStore,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) => {
        void this.onTick(event);
      },
    );
    this.eventBus.subscribeToAll((event) => this.invalidateOnEvent(event));
  }

  private async onTick(event: MarketPriceUpdatedEvent): Promise<void> {
    const matching = this.tradingEngineService
      .getAllTrades()
      .filter(
        (trade) =>
          trade.instrumentToken === event.instrumentToken &&
          trade.state === TradeState.ACTIVE &&
          trade.entryFillPrice !== null,
      );

    for (const trade of matching) {
      await this.evaluate(trade, event.price);
    }
  }

  private async evaluate(
    trade: TradeSnapshot,
    markPrice: number,
  ): Promise<void> {
    const extension = await this.extensionFor(trade.id);
    if (!extension.trailingEnabled || !extension.trailingConfig) {
      return;
    }

    const proposal = TrailingCalculator.compute(extension.trailingConfig, {
      direction: trade.direction,
      entryFillPrice: trade.entryFillPrice as number,
      currentStopLoss: trade.currentStopLoss,
      markPrice,
      lastTrailingStepPrice: extension.lastTrailingStepPrice,
    });
    if (proposal === null) {
      return;
    }

    let updated: TradeSnapshot;
    try {
      updated = this.tradingEngineService.updateTrailingStopLoss(
        trade.id,
        proposal.newStopLoss,
      );
    } catch (error) {
      this.logger.warn(
        `Trailing stop-loss update failed for trade ${trade.id}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return;
    }

    if (updated.currentStopLoss === trade.currentStopLoss) {
      return; // Trade.moveStopLoss() rejected the proposal (not ACTIVE, or would move backward).
    }

    if (proposal.newLastStepPrice !== undefined) {
      await this.extensionStore.patch(trade.id, {
        lastTrailingStepPrice: proposal.newLastStepPrice,
      });
      this.extensionCache.delete(trade.id);
    }

    this.eventBus.publish(
      new StopLossMovedEvent(
        trade.id,
        trade.currentStopLoss,
        updated.currentStopLoss,
        extension.trailingConfig.strategy,
      ),
    );
  }

  private async extensionFor(tradeId: string): Promise<TradeExtension> {
    const cached = this.extensionCache.get(tradeId);
    if (cached) {
      return cached;
    }
    const extension = await this.extensionStore.get(tradeId);
    this.extensionCache.set(tradeId, extension);
    return extension;
  }

  private invalidateOnEvent(event: BaseEvent): void {
    const tradeId = (event as unknown as { tradeId?: unknown }).tradeId;
    if (typeof tradeId === 'string') {
      this.extensionCache.delete(tradeId);
    }
  }
}
