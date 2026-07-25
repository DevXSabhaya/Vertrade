import { QueueMetricsService } from './queue-metrics.service';

describe('QueueMetricsService', () => {
  it('starts with zeroed counters and null averages', () => {
    const metrics = new QueueMetricsService();
    expect(metrics.snapshot(0, 0)).toEqual({
      queueSize: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retryCount: 0,
      averageWaitMs: null,
      averageProcessingTimeMs: null,
    });
  });

  it('tracks completed, failed, and retry counts independently', () => {
    const metrics = new QueueMetricsService();
    metrics.recordCompleted();
    metrics.recordCompleted();
    metrics.recordFailed();
    metrics.recordRetry();
    metrics.recordRetry();
    metrics.recordRetry();

    const snapshot = metrics.snapshot(2, 1);
    expect(snapshot.completed).toBe(2);
    expect(snapshot.failed).toBe(1);
    expect(snapshot.retryCount).toBe(3);
    expect(snapshot.queueSize).toBe(2);
    expect(snapshot.processing).toBe(1);
  });

  it('computes the average wait time across samples', () => {
    const metrics = new QueueMetricsService();
    metrics.recordWait(100);
    metrics.recordWait(300);
    expect(metrics.snapshot(0, 0).averageWaitMs).toBe(200);
  });

  it('computes the average processing time across samples', () => {
    const metrics = new QueueMetricsService();
    metrics.recordProcessingTime(50);
    metrics.recordProcessingTime(150);
    expect(metrics.snapshot(0, 0).averageProcessingTimeMs).toBe(100);
  });
});
