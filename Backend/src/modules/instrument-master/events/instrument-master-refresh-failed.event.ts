import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentMasterRefreshFailedEvent extends DomainEvent {
  readonly eventName = 'instrument-master.refresh.failed';

  constructor(public readonly reason: string) {
    super();
  }
}
