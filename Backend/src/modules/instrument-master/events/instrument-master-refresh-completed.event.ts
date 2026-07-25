import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentMasterRefreshCompletedEvent extends DomainEvent {
  readonly eventName = 'instrument-master.refresh.completed';

  constructor(
    public readonly version: number,
    public readonly instrumentCount: number,
  ) {
    super();
  }
}
