import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentRefreshCompletedEvent extends DomainEvent {
  readonly eventName = 'scheduler.instrument-refresh.completed';

  constructor(public readonly instrumentCount: number) {
    super();
  }
}
