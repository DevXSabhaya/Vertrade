import { Inject, Injectable } from '@nestjs/common';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import { SCHEDULER_CONFIG } from '../scheduler.constants';
import type { SchedulerConfig } from '../models/scheduler-config.model';
import type { IScheduledJob } from '../interfaces/scheduled-job.interface';
import { JobName } from '../models/job-name.enum';

/** The periodic counterpart to MarketCloseJob's cleanup step — runs on its own configurable interval, not just once at close. */
@Injectable()
export class CleanupJob implements IScheduledJob {
  readonly name = JobName.CLEANUP;

  constructor(
    private readonly orderQueueService: OrderQueueService,
    private readonly tradingEngineService: TradingEngineService,
    private readonly positionManager: PositionManager,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
  ) {}

  async run(): Promise<void> {
    await this.orderQueueService.expireStaleItems(
      this.config.queueExpiryThresholdMs,
    );
    this.orderQueueService.cleanupLocks();
    this.orderQueueService.pruneCompletedItems(
      this.config.completedItemRetentionMs,
    );
    // Every trade pruned here was already durably archived to
    // TradeHistoryRepository the moment it went terminal (see
    // TradeLifecycleService.archive()) — nothing is lost, only evicted from
    // RAM. Order matters: prune the engine's own trades first, then the
    // position cache, so a cache entry never briefly outlives (and is
    // reachable but stale relative to) the trade it was composed from.
    this.tradingEngineService.pruneCompletedTrades(
      this.config.completedItemRetentionMs,
    );
    this.positionManager.pruneCache(this.config.completedItemRetentionMs);
  }
}
