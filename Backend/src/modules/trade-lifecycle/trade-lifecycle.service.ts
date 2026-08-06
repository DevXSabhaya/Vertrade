import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { EntryFilledEvent } from '@modules/trading-engine/events/entry-filled.event';
import { TradeCompletedEvent } from '@modules/trading-engine/events/trade-completed.event';
import { TradeCancelledEvent } from '@modules/trading-engine/events/trade-cancelled.event';
import { TradeRejectedEvent } from '@modules/trading-engine/events/trade-rejected.event';
import { TradeFailedEvent } from '@modules/trading-engine/events/trade-failed.event';
import { TradeExtensionStore } from './trade-extension.store';
import { PnLService } from './pnl.service';
import { composeTradeRecord } from './domain/trade-record-composer';
import { TRADE_HISTORY_REPOSITORY } from './trade-lifecycle.constants';
import type { ITradeHistoryRepository } from './interfaces/trade-history-repository.interface';
import { PositionOpenedEvent } from './events';

const TERMINAL_EVENT_NAMES: readonly string[] = [
  TradeCompletedEvent.EVENT_NAME,
  TradeCancelledEvent.EVENT_NAME,
  TradeRejectedEvent.EVENT_NAME,
  TradeFailedEvent.EVENT_NAME,
];

/** All four terminal events carry `tradeId` as their first constructor argument; this is the only shape `archive()` needs. */
interface TerminalTradeEvent {
  readonly tradeId: string;
}

/**
 * The module's top-level orchestrator: bridges Trading Engine's own
 * lifecycle events into the two Phase 10 concerns nothing else owns —
 * publishing `PositionOpenedEvent` the instant an entry fills, and
 * archiving a trade's final composed `TradeRecord` into the Trade History
 * Repository the instant it reaches any terminal state. Never mutates a
 * Trade or its extension itself.
 */
@Injectable()
export class TradeLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradeLifecycleService.name);
  private readonly activeWrites = new Set<Promise<unknown>>();
  private destroyed = false;
  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly extensionStore: TradeExtensionStore,
    private readonly pnlService: PnLService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TRADE_HISTORY_REPOSITORY)
    private readonly historyRepository: ITradeHistoryRepository,
    private readonly marketDataService: MarketDataService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<EntryFilledEvent>(
      EntryFilledEvent.EVENT_NAME,
      (event) => {
        this.eventBus.publish(
          new PositionOpenedEvent(
            event.tradeId,
            event.fillPrice,
            event.filledQuantity,
          ),
        );
      },
    );

    for (const eventName of TERMINAL_EVENT_NAMES) {
      this.eventBus.subscribe(eventName, (event) => {
        const promise = this.archive(
          (event as unknown as TerminalTradeEvent).tradeId,
        );
        const task = promise
          .catch((error) => {
            if (this.destroyed) {
              return;
            }
            this.logger.error(
              `Failed to archive trade: ${error instanceof Error ? error.message : String(error)}`,
            );
          })
          .finally(() => {
            this.activeWrites.delete(task);
          });
        this.activeWrites.add(task);
      });
    }
  }

  private async archive(tradeId: string): Promise<void> {
    if (!this.tradingEngineService.hasTrade(tradeId)) {
      return;
    }
    const snapshot = this.tradingEngineService.getTrade(tradeId);
    const extension = await this.extensionStore.get(tradeId);
    const record = composeTradeRecord(
      snapshot,
      extension,
      this.pnlService.getMarkPrice(snapshot.instrumentToken),
      this.clock.now().getTime(),
    );
    await this.historyRepository.save(record);

    // Mirrors the subscribe call made when the trade entered the queue
    // (QueueWorker) — ref-counted, so this only actually unsubscribes from
    // the provider once no other active trade still needs this instrument.
    void this.marketDataService
      .unsubscribeInstrument(snapshot.instrumentToken, `trade:${tradeId}`)
      .catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.activeWrites.size > 0) {
      await Promise.all(Array.from(this.activeWrites));
    }
  }
}
