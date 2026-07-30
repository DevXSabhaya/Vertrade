import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { FeatureFlagsService } from '@core/feature-flags/feature-flag.service';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import { TIMER_SCHEDULER } from '@shared/scheduler/timer-scheduler.constants';
import type { ITimerScheduler } from '@shared/scheduler/timer-scheduler.interface';
import { JobRegistry } from './job-registry';
import { JobName } from './models/job-name.enum';
import type { JobResult } from './models/job-result.model';
import type { SchedulerConfig } from './models/scheduler-config.model';
import { SchedulerMetricsService } from './metrics/scheduler-metrics.service';
import {
  SCHEDULER_CONFIG,
  SCHEDULER_ENABLED_FLAG,
  SCHEDULER_HISTORY_REPOSITORY,
} from './scheduler.constants';
import type { ISchedulerHistoryRepository } from './interfaces/scheduler-history-repository.interface';
import {
  SchedulerStartedEvent,
  SchedulerStoppedEvent,
  SchedulerJobCompletedEvent,
  JobFailedEvent,
} from './events';

/**
 * Automates every platform lifecycle operation. Never starts its own
 * periodic jobs at boot (`onModuleInit` is deliberately absent) — an
 * explicit `start()` call is required, exactly mirroring Phase 6's
 * MarketDataService and Phase 8's own BrokerHealthService not
 * auto-connecting/auto-checking at construction time. Job failures are
 * always caught here: one failing job must never crash the Scheduler or
 * prevent the next scheduled run.
 */
@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private healthCheckHandle: unknown = null;
  private instrumentRefreshHandle: unknown = null;
  private cleanupHandle: unknown = null;
  private riskMaintenanceHandle: unknown = null;
  private started = false;
  /**
   * Guards against overlapping runs of the same job. Without this, a job
   * that takes longer than its own interval to finish (e.g. INSTRUMENT_REFRESH
   * blocked on a slow broker download, or any job stalled during a broker
   * outage) gets fired again by the next interval tick before the first
   * invocation has returned — two concurrent runs racing each other over
   * the same shared state (the instrument cache swap, the order-queue
   * cleanup pass, etc). Also protects the manual trigger entrypoints
   * (`triggerMorningStartup`/`triggerMarketClose`) from double-firing if
   * called again while already running.
   */
  private readonly inFlightJobs = new Set<JobName>();

  constructor(
    private readonly jobRegistry: JobRegistry,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly metrics: SchedulerMetricsService,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
    @Inject(TIMER_SCHEDULER) private readonly scheduler: ITimerScheduler,
    @Inject(SCHEDULER_CONFIG) private readonly config: SchedulerConfig,
    @Inject(SCHEDULER_HISTORY_REPOSITORY)
    private readonly repository: ISchedulerHistoryRepository,
  ) {}

  isStarted(): boolean {
    return this.started;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    const enabled = await this.featureFlagsService.isEnabled(
      SCHEDULER_ENABLED_FLAG,
    );
    if (!enabled) {
      return;
    }

    this.started = true;
    this.healthCheckHandle = this.scheduler.setInterval(
      () => void this.runJob(JobName.HEALTH_CHECK),
      this.config.healthCheckIntervalMs,
    );
    this.instrumentRefreshHandle = this.scheduler.setInterval(
      () => void this.runJob(JobName.INSTRUMENT_REFRESH),
      this.config.instrumentRefreshIntervalMs,
    );
    this.cleanupHandle = this.scheduler.setInterval(
      () => void this.runJob(JobName.CLEANUP),
      this.config.cleanupIntervalMs,
    );
    this.riskMaintenanceHandle = this.scheduler.setInterval(
      () => void this.runJob(JobName.RISK_MAINTENANCE),
      this.config.riskMaintenanceIntervalMs,
    );

    this.eventBus.publish(new SchedulerStartedEvent());
  }

  stop(): void {
    this.clearHandle('healthCheckHandle');
    this.clearHandle('instrumentRefreshHandle');
    this.clearHandle('cleanupHandle');
    this.clearHandle('riskMaintenanceHandle');
    const wasStarted = this.started;
    this.started = false;
    if (wasStarted) {
      this.eventBus.publish(new SchedulerStoppedEvent());
    }
  }

  onModuleDestroy(): void {
    this.stop();
  }

  async triggerMorningStartup(): Promise<JobResult> {
    return this.runJob(JobName.MORNING_STARTUP);
  }

  async triggerMarketClose(): Promise<JobResult> {
    return this.runJob(JobName.MARKET_CLOSE);
  }

  getMetrics() {
    return this.metrics.snapshot();
  }

  async runJob(name: JobName): Promise<JobResult> {
    if (this.inFlightJobs.has(name)) {
      const now = this.clock.now().toISOString();
      return {
        jobName: name,
        succeeded: false,
        startedAt: now,
        finishedAt: now,
        durationMs: 0,
        error: 'Skipped: a previous run of this job is still in progress',
        skipped: true,
      };
    }

    this.inFlightJobs.add(name);
    try {
      return await this.runJobNow(name);
    } finally {
      this.inFlightJobs.delete(name);
    }
  }

  private async runJobNow(name: JobName): Promise<JobResult> {
    const job = this.jobRegistry.get(name);
    const startedAt = this.clock.now();

    try {
      await job.run();
      const finishedAt = this.clock.now();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const result: JobResult = {
        jobName: name,
        succeeded: true,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        error: null,
      };
      this.metrics.recordExecution(name, durationMs, true, result.finishedAt);
      await this.repository.save(result);
      this.eventBus.publish(
        new SchedulerJobCompletedEvent(name, true, durationMs),
      );
      return result;
    } catch (error) {
      const finishedAt = this.clock.now();
      const durationMs = finishedAt.getTime() - startedAt.getTime();
      const message =
        error instanceof Error ? error.message : 'Unknown job failure';
      const result: JobResult = {
        jobName: name,
        succeeded: false,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        error: message,
      };
      this.metrics.recordExecution(name, durationMs, false, result.finishedAt);
      await this.repository.save(result);
      this.eventBus.publish(
        new SchedulerJobCompletedEvent(name, false, durationMs),
      );
      this.eventBus.publish(new JobFailedEvent(name, message));
      return result;
    }
  }

  private clearHandle(
    field:
      | 'healthCheckHandle'
      | 'instrumentRefreshHandle'
      | 'cleanupHandle'
      | 'riskMaintenanceHandle',
  ): void {
    const handle = this[field];
    if (handle !== null) {
      this.scheduler.clearInterval(handle);
      this[field] = null;
    }
  }
}
