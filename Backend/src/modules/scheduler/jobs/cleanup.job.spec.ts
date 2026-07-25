import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { CleanupJob } from './cleanup.job';
import { DEFAULT_SCHEDULER_CONFIG } from '../models/scheduler-config.model';

describe('CleanupJob', () => {
  it('expires stale queue items and cleans up stale locks', async () => {
    const orderQueueService = {
      expireStaleItems: jest.fn().mockResolvedValue(3),
      cleanupLocks: jest.fn().mockReturnValue(2),
    };
    const job = new CleanupJob(
      orderQueueService as unknown as OrderQueueService,
      DEFAULT_SCHEDULER_CONFIG,
    );

    await job.run();

    expect(orderQueueService.expireStaleItems).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.queueExpiryThresholdMs,
    );
    expect(orderQueueService.cleanupLocks).toHaveBeenCalled();
  });
});
