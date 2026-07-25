import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class SchedulerStoppedEvent extends DomainEvent {
  static readonly EVENT_NAME = 'scheduler.stopped';
  readonly eventName = SchedulerStoppedEvent.EVENT_NAME;

  constructor() {
    super();
  }
}
