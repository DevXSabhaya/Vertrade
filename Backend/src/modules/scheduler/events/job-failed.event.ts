import { DomainEvent } from '@core/event-bus/events/domain-event.base';
import type { JobName } from '../models/job-name.enum';

export class JobFailedEvent extends DomainEvent {
  readonly eventName = 'scheduler.job.failed';

  constructor(
    public readonly jobName: JobName,
    public readonly reason: string,
  ) {
    super();
  }
}
