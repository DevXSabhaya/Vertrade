import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentMasterLoadedEvent extends DomainEvent {
  readonly eventName = 'instrument-master.loaded';

  constructor(
    public readonly version: number,
    public readonly instrumentCount: number,
  ) {
    super();
  }
}
