import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class MorningStartupCompletedEvent extends DomainEvent {
  readonly eventName = 'scheduler.morning-startup.completed';

  constructor(
    public readonly restVerified: boolean,
    public readonly websocketVerified: boolean,
  ) {
    super();
  }
}
