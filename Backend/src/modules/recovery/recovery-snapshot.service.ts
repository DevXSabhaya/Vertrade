import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { BaseEvent } from '@core/event-bus/events/base.event';
import { EventCategory } from '@shared/enums/event-category.enum';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { MarketPriceUpdatedEvent } from '@shared/events/market-price-updated.event';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { BrokerSessionManager } from '@modules/broker/broker-auth/broker-session-manager';
import {
  RECOVERY_CONFIG,
  RECOVERY_SNAPSHOT_REPOSITORY,
} from './recovery.constants';
import type { RecoveryConfig } from './models/recovery-config.model';
import type { RecoverySnapshot } from './models/recovery-snapshot.model';
import type { IRecoverySnapshotRepository } from './interfaces/recovery-snapshot-repository.interface';
import { RecoveryEventPublisher } from './recovery-event-publisher';

/** Event names emitted by Recovery itself — never re-triggers a capture, or every snapshot save would trigger another snapshot save. */
const RECOVERY_EVENT_PREFIX = 'recovery.';

@Injectable()
export class RecoverySnapshotService implements OnModuleInit, OnModuleDestroy {
  private lastTick: {
    instrumentToken: string;
    price: number;
    at: string;
  } | null = null;
  private debounceHandle: unknown = null;

  constructor(
    private readonly tradingEngineService: TradingEngineService,
    private readonly orderQueueService: OrderQueueService,
    private readonly brokerSessionManager: BrokerSessionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(RECOVERY_CONFIG) private readonly config: RecoveryConfig,
    @Inject(RECOVERY_SNAPSHOT_REPOSITORY)
    private readonly repository: IRecoverySnapshotRepository,
    private readonly eventPublisher: RecoveryEventPublisher,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe<MarketPriceUpdatedEvent>(
      MarketPriceUpdatedEvent.EVENT_NAME,
      (event) => {
        this.lastTick = {
          instrumentToken: event.instrumentToken,
          price: event.price,
          at: this.clock.now().toISOString(),
        };
      },
    );

    // Automatic snapshot updates whenever important (domain) state changes —
    // debounced so a burst of ticks/state changes coalesces into one write
    // instead of one Mongo write per event.
    this.eventBus.subscribeToAll((event) => this.onAnyEvent(event));
  }

  captureSnapshot(): RecoverySnapshot {
    const trades = this.tradingEngineService.getAllTrades();
    const queueItems = this.orderQueueService.getAllItems();

    const engineStateSummary: Record<string, number> = {};
    for (const trade of trades) {
      engineStateSummary[trade.state] =
        (engineStateSummary[trade.state] ?? 0) + 1;
    }

    const subscriptionsByToken = new Map<
      string,
      { exchange: string; tradingSymbol: string; instrumentToken: string }
    >();
    for (const trade of trades) {
      subscriptionsByToken.set(trade.instrumentToken, {
        exchange: trade.exchange,
        tradingSymbol: trade.tradingSymbol,
        instrumentToken: trade.instrumentToken,
      });
    }

    return {
      id: randomUUID(),
      capturedAt: this.clock.now().toISOString(),
      trades,
      queueItems,
      idempotencyKeys: queueItems.map((item) => item.idempotencyKey),
      marketSubscriptions: Array.from(subscriptionsByToken.values()),
      engineStateSummary,
      brokerSessionClientCode:
        this.brokerSessionManager.getActiveSession()?.clientCode ?? null,
      lastTick: this.lastTick,
    };
  }

  async persistSnapshot(snapshot: RecoverySnapshot): Promise<void> {
    await this.repository.save(snapshot);
    this.eventPublisher.snapshotSaved(
      snapshot.id,
      snapshot.trades.length,
      snapshot.queueItems.length,
    );
  }

  async captureAndPersist(): Promise<RecoverySnapshot> {
    const snapshot = this.captureSnapshot();
    await this.persistSnapshot(snapshot);
    return snapshot;
  }

  async loadLatestSnapshot(): Promise<RecoverySnapshot | null> {
    return this.repository.findLatest();
  }

  private onAnyEvent(event: BaseEvent): void {
    if (
      event.metadata.category !== EventCategory.DOMAIN ||
      event.eventName.startsWith(RECOVERY_EVENT_PREFIX)
    ) {
      return;
    }
    this.scheduleDebouncedCapture();
  }

  private scheduleDebouncedCapture(): void {
    if (this.debounceHandle !== null) {
      return;
    }
    this.debounceHandle = this.scheduler.setTimeout(() => {
      this.debounceHandle = null;
      void this.captureAndPersist();
    }, this.config.snapshotDebounceMs);
  }

  /** Cancels any pending debounced capture — without this, a timer scheduled just before shutdown fires after the app (and its Mongo connection) has already closed. */
  onModuleDestroy(): void {
    if (this.debounceHandle !== null) {
      this.scheduler.clearTimeout(this.debounceHandle);
      this.debounceHandle = null;
    }
  }
}
