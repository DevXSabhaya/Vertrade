import { Inject, Injectable } from '@nestjs/common';
import { OrderQueueService } from '@modules/order-queue/order-queue.service';
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
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
  ) {}

  async run(): Promise<void> {
    await this.orderQueueService.expireStaleItems(
      this.config.queueExpiryThresholdMs,
    );
    this.orderQueueService.cleanupLocks();
  }
}
