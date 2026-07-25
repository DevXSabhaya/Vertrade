import type { OrderQueueService } from '@modules/order-queue/order-queue.service';
import type { QueueMetricsSnapshot } from '@modules/order-queue/models/queue-metrics-snapshot';
import { OrderQueueHealthIndicator } from './order-queue.health-indicator';
import { HealthStatus } from '../models/health-status.enum';
import { FakeClock } from '../testing/fake-clock';

function fakeService(metrics: QueueMetricsSnapshot): OrderQueueService {
  return { getMetrics: () => metrics } as unknown as OrderQueueService;
}

const base: QueueMetricsSnapshot = {
  queueSize: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  retryCount: 0,
  averageWaitMs: null,
  averageProcessingTimeMs: null,
};

describe('OrderQueueHealthIndicator', () => {
  it('reports HEALTHY when there is little/no activity', async () => {
    const indicator = new OrderQueueHealthIndicator(
      fakeService(base),
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });

  it('reports DEGRADED when the failure rate is high with enough samples', async () => {
    const indicator = new OrderQueueHealthIndicator(
      fakeService({ ...base, completed: 2, failed: 8 }),
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.DEGRADED);
  });

  it('does not flag a high failure rate from too few samples', async () => {
    const indicator = new OrderQueueHealthIndicator(
      fakeService({ ...base, completed: 0, failed: 2 }),
      new FakeClock(),
    );
    expect((await indicator.check()).status).toBe(HealthStatus.HEALTHY);
  });
});
