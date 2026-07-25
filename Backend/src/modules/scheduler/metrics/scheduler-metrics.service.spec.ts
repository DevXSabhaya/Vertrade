import { JobName } from '../models/job-name.enum';
import { SchedulerMetricsService } from './scheduler-metrics.service';

describe('SchedulerMetricsService', () => {
  it('starts with zeroed counters and null averages', () => {
    const metrics = new SchedulerMetricsService();
    expect(metrics.snapshot()).toEqual({
      executions: 0,
      failedJobs: 0,
      averageJobDurationMs: null,
      lastStartupAt: null,
      lastMarketCloseAt: null,
    });
  });

  it('tracks executions and failures independently', () => {
    const metrics = new SchedulerMetricsService();
    metrics.recordExecution(JobName.HEALTH_CHECK, 100, true, 'ts1');
    metrics.recordExecution(JobName.HEALTH_CHECK, 200, false, 'ts2');

    const snapshot = metrics.snapshot();
    expect(snapshot.executions).toBe(2);
    expect(snapshot.failedJobs).toBe(1);
    expect(snapshot.averageJobDurationMs).toBe(150);
  });

  it('records lastStartupAt only for a successful MORNING_STARTUP execution', () => {
    const metrics = new SchedulerMetricsService();
    metrics.recordExecution(JobName.MORNING_STARTUP, 50, false, 'failed-ts');
    expect(metrics.snapshot().lastStartupAt).toBeNull();

    metrics.recordExecution(JobName.MORNING_STARTUP, 50, true, 'success-ts');
    expect(metrics.snapshot().lastStartupAt).toBe('success-ts');
  });

  it('records lastMarketCloseAt only for a successful MARKET_CLOSE execution', () => {
    const metrics = new SchedulerMetricsService();
    metrics.recordExecution(JobName.MARKET_CLOSE, 50, true, 'close-ts');
    expect(metrics.snapshot().lastMarketCloseAt).toBe('close-ts');
  });
});
