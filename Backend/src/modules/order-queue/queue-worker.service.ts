import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { ConfigService } from '@core/config/config.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TradingModeService } from '@modules/trading-mode/trading-mode.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { CreateTradeParams } from '@modules/trading-engine/domain/create-trade.params';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { MarketDataInstrument } from '@modules/market-data/models/market-data-instrument.model';
import { LockManager } from './lock/lock-manager';
import { QueueMetricsService } from './metrics/queue-metrics.service';
import { RetryStrategy } from './retry/retry-strategy';
import type { QueueItem } from './models/queue-item.aggregate';
import { QUEUE_REPOSITORY, RETRY_OPTIONS } from './order-queue.constants';
import type { IQueueItemRepository } from './interfaces/queue-item-repository.interface';
import type { RetryOptions } from './models/retry-options.model';
import { LockAcquisitionException } from './exceptions/lock-acquisition.exception';
import {
  OrderLockedEvent,
  OrderProcessingEvent,
  OrderSubmittedEvent,
  OrderCompletedEvent,
  OrderRetryEvent,
  OrderFailedEvent,
} from './events';

/**
 * Background worker: pulls items through Lock -> Executor -> Success/Retry/
 * Failed. Every item is chained onto a single running promise
 * (`processingChain`), so processing is always strictly sequential — never
 * two items in flight at once — without needing a real timer-driven loop,
 * which keeps it fully deterministic in tests (`await drain()`).
 */
@Injectable()
export class QueueWorker implements OnModuleDestroy {
  private processingChain: Promise<void> = Promise.resolve();
  private inFlightCount = 0;
  private paused = false;

  constructor(
    private readonly lockManager: LockManager,
    private readonly tradingEngineService: TradingEngineService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(RETRY_OPTIONS) private readonly retryOptions: RetryOptions,
    private readonly queueMetrics: QueueMetricsService,
    @Inject(QUEUE_REPOSITORY) private readonly repository: IQueueItemRepository,
    private readonly configService: ConfigService,
    private readonly marketDataService: MarketDataService,
    private readonly tradingModeService: TradingModeService,
  ) {}

  /**
   * Queues `item` for sequential processing; resolves once its turn is done.
   * Graceful shutdown only rejects work enqueued *after* `pause()` — an item
   * already chained in before that point is allowed to finish, exactly like
   * a real graceful shutdown draining in-flight work rather than aborting it.
   */
  enqueue(item: QueueItem, ownerId: string): Promise<void> {
    if (this.paused) {
      return Promise.resolve();
    }
    this.inFlightCount += 1;
    this.processingChain = this.processingChain.then(() =>
      this.processGate(item, ownerId),
    );
    return this.processingChain;
  }

  /** Resolves once every currently-chained item has finished processing. */
  async drain(): Promise<void> {
    await this.processingChain;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  isPaused(): boolean {
    return this.paused;
  }

  get inFlight(): number {
    return this.inFlightCount;
  }

  async onModuleDestroy(): Promise<void> {
    this.pause();
    await this.drain();
  }

  private async processGate(item: QueueItem, ownerId: string): Promise<void> {
    try {
      if (this.configService.killSwitchEnabled) {
        // "Queue pauses": leave the item exactly as it is, do not touch it.
        // Re-checked live (unlike `paused`), since the kill switch can flip
        // on after an item is already chained in for processing.
        return;
      }
      await this.processOnce(item, ownerId);
    } finally {
      this.inFlightCount -= 1;
    }
  }

  private async processOnce(item: QueueItem, ownerId: string): Promise<void> {
    const lockKey = item.resolvedInstrument.instrumentToken;

    if (!this.lockManager.tryAcquire(lockKey, ownerId)) {
      await this.handleFailure(
        item,
        ownerId,
        new LockAcquisitionException(
          `Instrument ${lockKey} is currently locked by another operation`,
        ),
      );
      return;
    }

    item.lock(ownerId, this.clock);
    await this.repository.save(item.toSnapshot());
    this.eventBus.publish(new OrderLockedEvent(item.id, ownerId));

    item.beginProcessing(this.clock);
    await this.repository.save(item.toSnapshot());
    this.eventBus.publish(new OrderProcessingEvent(item.id, item.attempts + 1));

    try {
      const tradeSnapshot = this.tradingEngineService.createTrade(
        this.buildCreateTradeParams(item),
      );

      item.markSubmitted(tradeSnapshot.id, this.clock);
      await this.repository.save(item.toSnapshot());
      this.eventBus.publish(new OrderSubmittedEvent(item.id, tradeSnapshot.id));

      // Without this, a brand-new instrument never receives a single price
      // tick: nothing else in the create-trade path ever subscribes it (only
      // Startup Recovery does, for trades that already existed before a
      // restart). Fire-and-forget — a subscription hiccup must never fail an
      // otherwise-successful trade submission; entry/SL/target evaluation
      // simply waits for the next tick once the subscription lands.
      void this.marketDataService
        .subscribeInstrument(
          new MarketDataInstrument(
            item.resolvedInstrument.exchange,
            item.resolvedInstrument.tradingSymbol,
            item.resolvedInstrument.instrumentToken,
          ),
          `trade:${tradeSnapshot.id}`,
        )
        .catch(() => undefined);

      item.markCompleted(this.clock);
      await this.repository.save(item.toSnapshot());
      this.lockManager.release(lockKey, ownerId);
      this.queueMetrics.recordCompleted();
      this.eventBus.publish(new OrderCompletedEvent(item.id, tradeSnapshot.id));
    } catch (error) {
      this.lockManager.release(lockKey, ownerId);
      await this.handleFailure(item, ownerId, error);
    }
  }

  private async handleFailure(
    item: QueueItem,
    ownerId: string,
    error: unknown,
  ): Promise<void> {
    const reason =
      error instanceof Error ? error.message : 'Unknown processing error';
    const nextAttempt = item.attempts + 1;

    if (
      RetryStrategy.isPermanentFailure(error) ||
      RetryStrategy.hasExceededMaxRetries(nextAttempt, this.retryOptions)
    ) {
      item.markFailed(reason, this.clock);
      await this.repository.save(item.toSnapshot());
      this.queueMetrics.recordFailed();
      this.eventBus.publish(new OrderFailedEvent(item.id, reason));
      return;
    }

    item.scheduleRetry(reason, this.clock);
    await this.repository.save(item.toSnapshot());
    this.queueMetrics.recordRetry();
    const delayMs = RetryStrategy.computeDelayMs(
      item.attempts,
      this.retryOptions,
    );
    this.eventBus.publish(
      new OrderRetryEvent(item.id, item.attempts, reason, delayMs),
    );

    // No real timer: the delay above is published for observability, but the
    // retry attempt itself happens as the very next step in this same
    // sequential chain, keeping retries fully deterministic in tests.
    await this.processOnce(item, ownerId);
  }

  /**
   * `mode` is read here — right before `TradingEngineService.createTrade()`
   * is actually called (`processOnce`, below) — rather than back when the
   * item was first queued, since a queued item can wait a long time (an
   * unfilled entry trigger, a retry backoff) before this runs. This is the
   * one moment a trade's mode is ever decided; `Trade` pins it for its
   * entire lifecycle from here on (see `Trade.mode`'s own docstring).
   */
  private buildCreateTradeParams(item: QueueItem): CreateTradeParams {
    return {
      direction: item.request.direction,
      exchange: item.resolvedInstrument.exchange,
      tradingSymbol: item.resolvedInstrument.tradingSymbol,
      instrumentToken: item.resolvedInstrument.instrumentToken,
      quantity: item.request.quantity,
      entryTriggerPrice: item.request.entryTriggerPrice,
      initialStopLoss: item.request.initialStopLoss,
      mode: this.tradingModeService.getCurrentMode(),
      targets: item.request.targets,
      metadata: item.request.metadata,
    };
  }
}
