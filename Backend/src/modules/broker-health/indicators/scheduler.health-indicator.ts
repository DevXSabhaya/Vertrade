import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EVENT_BUS } from '@core/event-bus/event-bus.constants';
import type { IEventBus } from '@core/event-bus/event-bus.interface';
import { CLOCK } from '@shared/clock/clock.constants';
import type { IClock } from '@shared/clock/clock.interface';
import type { IHealthIndicator } from '../interfaces/health-indicator.interface';
import type { HealthIndicatorResult } from '../models/health-indicator-result.model';
import { HealthStatus } from '../models/health-status.enum';

/**
 * BrokerHealthModule must never import SchedulerModule directly: the
 * Scheduler's own HealthCheckJob calls into BrokerHealthService, and a
 * reverse direct dependency would create a module import cycle. This
 * indicator instead observes the Scheduler purely through the Event Bus
 * (`scheduler.started` / `scheduler.stopped` / `scheduler.job.completed`),
 * exactly the Event-Driven Architecture principle the frozen architecture
 * requires for cross-module communication.
 */
@Injectable()
export class SchedulerHealthIndicator
  implements IHealthIndicator, OnModuleInit
{
  static readonly STARTED_EVENT_NAME = 'scheduler.started';
  static readonly STOPPED_EVENT_NAME = 'scheduler.stopped';
  static readonly JOB_COMPLETED_EVENT_NAME = 'scheduler.job.completed';

  readonly name = 'scheduler';
  private started = false;
  private lastJobCompletedAt: Date | null = null;

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(SchedulerHealthIndicator.STARTED_EVENT_NAME, () => {
      this.started = true;
    });
    this.eventBus.subscribe(SchedulerHealthIndicator.STOPPED_EVENT_NAME, () => {
      this.started = false;
    });
    this.eventBus.subscribe(
      SchedulerHealthIndicator.JOB_COMPLETED_EVENT_NAME,
      () => {
        this.lastJobCompletedAt = this.clock.now();
      },
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async to match IHealthIndicator; state is purely event-sourced/local
  async check(): Promise<HealthIndicatorResult> {
    const checkedAt = this.clock.now().toISOString();

    if (!this.started) {
      return {
        name: this.name,
        status: HealthStatus.UNKNOWN,
        message: 'Scheduler has not reported starting yet',
        checkedAt,
      };
    }

    return { name: this.name, status: HealthStatus.HEALTHY, checkedAt };
  }
}
