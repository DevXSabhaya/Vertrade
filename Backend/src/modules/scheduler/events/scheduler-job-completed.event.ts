import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { JobName } from '../models/job-name.enum';

/**
 * Published for every job execution, success or failure — this is what
 * BrokerHealthModule's SchedulerHealthIndicator observes to determine the
 * Scheduler is alive, entirely through the Event Bus.
 */
export class SchedulerJobCompletedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'scheduler.job.completed';
  readonly eventName = SchedulerJobCompletedEvent.EVENT_NAME;

  constructor(
    public readonly jobName: JobName,
    public readonly succeeded: boolean,
    public readonly durationMs: number,
  ) {
    super();
  }
}
