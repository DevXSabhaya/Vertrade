import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { MarketDataService } from '@modules/market-data/market-data.service';
import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import { MarketCloseJob } from './market-close.job';
import { DEFAULT_SCHEDULER_CONFIG } from '../models/scheduler-config.model';
import { MarketCloseCompletedEvent } from '../events/market-close-completed.event';

describe('MarketCloseJob', () => {
  it('disconnects market data and cleans up expired queue items and stale locks', async () => {
    const marketDataService = { stop: jest.fn().mockResolvedValue(undefined) };
    const orderQueueService = {
      expireStaleItems: jest.fn().mockResolvedValue(2),
      cleanupLocks: jest.fn().mockReturnValue(1),
    };
    const publishSpy = jest.fn();
    const eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    } as unknown as IEventBus;

    const job = new MarketCloseJob(
      marketDataService as unknown as MarketDataService,
      orderQueueService as unknown as OrderQueueService,
      DEFAULT_SCHEDULER_CONFIG,
      eventBus,
    );

    await job.run();

    expect(marketDataService.stop).toHaveBeenCalled();
    expect(orderQueueService.expireStaleItems).toHaveBeenCalledWith(
      DEFAULT_SCHEDULER_CONFIG.queueExpiryThresholdMs,
    );
    expect(orderQueueService.cleanupLocks).toHaveBeenCalled();

    const event = publishSpy.mock.calls
      .map(([e]: [unknown]) => e)
      .find((e) => e instanceof MarketCloseCompletedEvent);
    expect(event?.expiredQueueItems).toBe(2);
    expect(event?.cleanedLocks).toBe(1);
  });
});
