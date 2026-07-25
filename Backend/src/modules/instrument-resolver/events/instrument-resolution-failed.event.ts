import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentResolutionFailedEvent extends DomainEvent {
  readonly eventName = 'instrument.resolution.failed';

  constructor(
    public readonly rawSymbol: string,
    public readonly reason: string,
  ) {
    super();
  }
}
