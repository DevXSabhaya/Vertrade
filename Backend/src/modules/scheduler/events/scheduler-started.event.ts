import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class SchedulerStartedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'scheduler.started';
  readonly eventName = SchedulerStartedEvent.EVENT_NAME;

  constructor() {
    super();
  }
}
