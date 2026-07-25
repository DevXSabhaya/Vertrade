import { DomainEvent } from '@core/event-bus/events/domain-event.base';

export class InstrumentMasterRefreshStartedEvent extends DomainEvent {
  readonly eventName = 'instrument-master.refresh.started';
}
