import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { MarketDataService } from '@modules/market-data/market-data.service';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { SCHEDULER_CONFIG } from '../scheduler.constants';
import type { SchedulerConfig } from '../models/scheduler-config.model';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';
import { MarketCloseCompletedEvent } from '../events/market-close-completed.event';

/**
 * Implements every Market Close step that has real infrastructure behind it
 * today: disconnecting market data, and cleaning up expired queue items and
 * stale locks. Three documented steps are honest no-ops given the current
 * architecture, not fake implementations:
 *  - "Flush pending events": the Event Bus (Phase 0) is an in-process,
 *    synchronous EventEmitter — there is no async buffer to flush.
 *  - "Persist caches" / "Archive completed trades": the Trading Engine
 *    (Phase 5) is explicitly in-memory only, "No Database" by design; adding
 *    trade persistence is out of this phase's scope and would modify a
 *    previous phase's architecture.
 *  - "Rotate logs": this codebase uses NestJS's built-in console logger
 *    (Phase 0/1) with no file-based log rotation infrastructure to rotate.
 */
@Injectable()
export class MarketCloseJob implements IScheduledJob {
  readonly name = JobName.MARKET_CLOSE;

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly orderQueueService: OrderQueueService,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
  ) {}

  async run(): Promise<void> {
    await this.marketDataService.stop();

    const expiredQueueItems = await this.orderQueueService.expireStaleItems(
      this.config.queueExpiryThresholdMs,
    );
    const cleanedLocks = this.orderQueueService.cleanupLocks();

    this.eventBus.publish(
      new MarketCloseCompletedEvent(expiredQueueItems, cleanedLocks),
    );
  }
}
