import type { IEventBus } from '@core/event-bus/event-bus.interface';
import type { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { SchedulerService } from './scheduler.service';
import { JobRegistry } from './job-registry';
import { SchedulerMetricsService } from './metrics/scheduler-metrics.service';
import { JobName } from './models/job-name.enum';
import type { SchedulerConfig } from './models/scheduler-config.model';
import type { ISchedulerHistoryRepository } from './interfaces/scheduler-history-repository.interface';
import type { IScheduledJob } from './interfaces/scheduled-job.interface';
import { FakeClock } from './testing/fake-clock';
import { FakeTimerScheduler } from './testing/fake-timer-scheduler';
import {
  SchedulerStartedEvent,
  SchedulerStoppedEvent,
  SchedulerJobCompletedEvent,
  JobFailedEvent,
} from './events';

function fakeJob(
  name: JobName,
  run: jest.Mock = jest.fn().mockResolvedValue(undefined),
): IScheduledJob {
  return { name, run };
}

const config: SchedulerConfig = {
  healthCheckIntervalMs: 1_000,
  instrumentRefreshIntervalMs: 2_000,
  cleanupIntervalMs: 3_000,
  queueExpiryThresholdMs: 60_000,
  marketOpenTime: '09:15',
  marketCloseTime: '15:30',
  riskMaintenanceIntervalMs: 4_000,
};

describe('SchedulerService', () => {
  let clock: FakeClock;
  let scheduler: FakeTimerScheduler;
  let publishSpy: jest.Mock;
  let eventBus: IEventBus;
  let featureFlagsService: jest.Mocked<Pick<FeatureFlagsService, 'isEnabled'>>;
  let repository: jest.Mocked<ISchedulerHistoryRepository>;
  let metrics: SchedulerMetricsService;
  let jobs: Record<JobName, IScheduledJob>;
  let service: SchedulerService;

  beforeEach(() => {
    clock = new FakeClock();
    scheduler = new FakeTimerScheduler();
    publishSpy = jest.fn();
    eventBus = {
      publish: publishSpy,
      subscribe: jest.fn(),
      subscribeToAll: jest.fn(),
    };
    featureFlagsService = { isEnabled: jest.fn().mockResolvedValue(true) };
    repository = {
      save: jest.fn().mockResolvedValue(undefined),
      findRecent: jest.fn(),
      findLastSuccessful: jest.fn(),
    };
    metrics = new SchedulerMetricsService();
    jobs = {
      [JobName.MORNING_STARTUP]: fakeJob(JobName.MORNING_STARTUP),
      [JobName.MARKET_CLOSE]: fakeJob(JobName.MARKET_CLOSE),
      [JobName.HEALTH_CHECK]: fakeJob(JobName.HEALTH_CHECK),
      [JobName.INSTRUMENT_REFRESH]: fakeJob(JobName.INSTRUMENT_REFRESH),
      [JobName.CLEANUP]: fakeJob(JobName.CLEANUP),
      [JobName.RISK_MAINTENANCE]: fakeJob(JobName.RISK_MAINTENANCE),
    };
    const registry = new JobRegistry(Object.values(jobs));
    service = new SchedulerService(
      registry,
      featureFlagsService as unknown as FeatureFlagsService,
      metrics,
      eventBus,
      clock,
      scheduler,
      config,
      repository,
    );
  });

  describe('scheduler execution', () => {
    it('runJob executes the job and persists a success result', async () => {
      const result = await service.runJob(JobName.HEALTH_CHECK);

      expect(result.succeeded).toBe(true);
      expect(jobs[JobName.HEALTH_CHECK].run).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ succeeded: true }),
      );
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof SchedulerJobCompletedEvent,
        ),
      ).toBe(true);
    });

    it('triggerMorningStartup runs the MORNING_STARTUP job', async () => {
      const result = await service.triggerMorningStartup();
      expect(result.jobName).toBe(JobName.MORNING_STARTUP);
      expect(jobs[JobName.MORNING_STARTUP].run).toHaveBeenCalled();
    });

    it('triggerMarketClose runs the MARKET_CLOSE job', async () => {
      const result = await service.triggerMarketClose();
      expect(result.jobName).toBe(JobName.MARKET_CLOSE);
      expect(jobs[JobName.MARKET_CLOSE].run).toHaveBeenCalled();
    });

    it('start() registers periodic intervals for health check, instrument refresh, and cleanup', async () => {
      await service.start();
      expect(scheduler.pendingIntervalCount()).toBe(4);
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof SchedulerStartedEvent,
        ),
      ).toBe(true);
    });

    it('start() is idempotent', async () => {
      await service.start();
      await service.start();
      expect(scheduler.pendingIntervalCount()).toBe(4);
    });

    it('firing the health-check interval runs the HEALTH_CHECK job', async () => {
      await service.start();
      scheduler.fireAllIntervals();
      await Promise.resolve();
      await Promise.resolve();
      expect(jobs[JobName.HEALTH_CHECK].run).toHaveBeenCalled();
    });

    it('stop() clears intervals and publishes SchedulerStoppedEvent', async () => {
      await service.start();
      service.stop();
      expect(scheduler.pendingIntervalCount()).toBe(0);
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof SchedulerStoppedEvent,
        ),
      ).toBe(true);
    });

    it('stop() without a prior start() does not publish SchedulerStoppedEvent', () => {
      service.stop();
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof SchedulerStoppedEvent,
        ),
      ).toBe(false);
    });
  });

  describe('job failure', () => {
    it('catches a job failure, persists it, and publishes JobFailedEvent — without crashing', async () => {
      jobs[JobName.CLEANUP].run = jest
        .fn()
        .mockRejectedValue(new Error('cleanup exploded'));

      const result = await service.runJob(JobName.CLEANUP);

      expect(result.succeeded).toBe(false);
      expect(result.error).toBe('cleanup exploded');
      expect(
        publishSpy.mock.calls.some(
          ([e]: [unknown]) => e instanceof JobFailedEvent,
        ),
      ).toBe(true);
    });

    it('a failing job does not prevent subsequent jobs from running', async () => {
      jobs[JobName.CLEANUP].run = jest
        .fn()
        .mockRejectedValue(new Error('boom'));

      await service.runJob(JobName.CLEANUP);
      const result = await service.runJob(JobName.HEALTH_CHECK);

      expect(result.succeeded).toBe(true);
    });
  });

  describe('feature flags', () => {
    it('does not start when SCHEDULER_ENABLED is disabled', async () => {
      featureFlagsService.isEnabled.mockResolvedValue(false);

      await service.start();

      expect(service.isStarted()).toBe(false);
      expect(scheduler.pendingIntervalCount()).toBe(0);
    });
  });

  describe('configuration', () => {
    it('uses the configured intervals from SchedulerConfig', async () => {
      const customConfig: SchedulerConfig = {
        ...config,
        healthCheckIntervalMs: 5_000,
      };
      const registry = new JobRegistry(Object.values(jobs));
      const customService = new SchedulerService(
        registry,
        featureFlagsService as unknown as FeatureFlagsService,
        metrics,
        eventBus,
        clock,
        scheduler,
        customConfig,
        repository,
      );
      await customService.start();
      expect(scheduler.pendingIntervalCount()).toBe(4);
    });
  });

  describe('metrics', () => {
    it('exposes execution metrics', async () => {
      await service.runJob(JobName.HEALTH_CHECK);
      expect(service.getMetrics().executions).toBe(1);
    });
  });
});
