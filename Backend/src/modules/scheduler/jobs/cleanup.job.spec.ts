import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { TradingEngineService } from '@modules/trading-engine/trading-engine.service';
import type { PositionManager } from '@modules/trade-lifecycle/position-manager.service';
import { CleanupJob } from './cleanup.job';
import { DEFAULT_SCHEDULER_CONFIG } from '../models/scheduler-config.model';

describe('CleanupJob', () => {
  it('expires stale queue items, cleans up stale locks, and prunes completed items/trades/cache', async () => {
    const orderQueueService = {
      expireStaleItems: jest.fn().mockResolvedValue(3),
      cleanupLocks: jest.fn().mockReturnValue(2),
      pruneCompletedItems: jest.fn().mockReturnValue(5),
    };
    const tradingEngineService = {
      pruneCompletedTrades: jest.fn().mockReturnValue(4),
    };
    const positionManager = {
      pruneCache: jest.fn().mockReturnValue(4),
    };
    const job = new CleanupJob(
      orderQueueService as unknown as OrderQueueService,
      tradingEngineService as unknown as TradingEngineService,
      positionManager as unknown as PositionManager,
      DEFAULT_SCHEDULER_CONFIG,
    );

    await job.run();

    expect(orderQueueService.expireStaleItems).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.queueExpiryThresholdMs,
    );
    expect(orderQueueService.cleanupLocks).toHaveBeenCalled();
    expect(orderQueueService.pruneCompletedItems).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.completedItemRetentionMs,
    );
    expect(tradingEngineService.pruneCompletedTrades).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.completedItemRetentionMs,
    );
    expect(positionManager.pruneCache).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.completedItemRetentionMs,
    );
  });
});
