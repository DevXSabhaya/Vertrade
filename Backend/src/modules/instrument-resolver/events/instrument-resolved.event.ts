import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentResolvedEvent extends DomainEvent {
  readonly eventName = 'instrument.resolved';

  constructor(
    public readonly rawSymbol: string,
    public readonly tradingSymbol: string,
  ) {
    super();
  }
}
